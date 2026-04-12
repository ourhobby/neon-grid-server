const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

app.use(express.static('public'));

// Game Constants
const COLS = 100;
const ROWS = 75;
const COLORS = ['#00ffff', '#ff00ff', '#00ff00', '#ffaa00', '#ff0000', '#ffff00', '#0000ff'];

// State
let lobby = []; // Array of { id, name }
let players = {}; // Active game players
let grid = [];
let gameInterval = null;
let gameState = 'LOBBY'; // LOBBY, PLAYING, ROUND_OVER
let round = 1;

function initGrid() {
    grid = new Array(COLS).fill(0).map(() => new Array(ROWS).fill(0));
}

function startRound() {
    if (lobby.length < 2) return; // Need at least 2 players
    
    gameState = 'PLAYING';
    initGrid();
    players = {};
    
    // Spawn players
    let activePlayers = lobby.slice(0, 7); // Max 7 players
    activePlayers.forEach((p, index) => {
        players[p.id] = {
            id: p.id,
            name: p.name,
            color: COLORS[index % COLORS.length],
            x: Math.floor(COLS * 0.1) + (index * 10),
            y: Math.floor(ROWS * ((index + 1) / (activePlayers.length + 1))),
            dirX: 1,
            dirY: 0,
            alive: true
        };
    });

    io.emit('gameStart', { round, players, cols: COLS, rows: ROWS });

    if (gameInterval) clearInterval(gameInterval);
    
    // Wait for countdown before moving
    setTimeout(() => {
        gameInterval = setInterval(gameTick, 80); // Game Speed
    }, 3000);
}

function gameTick() {
    let aliveCount = 0;
    let lastAlive = null;

    // Process movements
    for (let id in players) {
        let p = players[id];
        if (!p.alive) continue;

        // Mark current spot as trail
        grid[p.x][p.y] = p.color;

        // Move
        p.x += p.dirX;
        p.y += p.dirY;

        // Check Collisions
        if (p.x < 0 || p.x >= COLS || p.y < 0 || p.y >= ROWS || grid[p.x][p.y] !== 0) {
            p.alive = false;
            io.emit('playerCrashed', { id: p.id, x: p.x, y: p.y, color: p.color });
        } else {
            aliveCount++;
            lastAlive = p;
        }
    }

    io.emit('gameState', { players, grid });

    // Check Round Over condition
    if (aliveCount <= 1) {
        clearInterval(gameInterval);
        gameState = 'ROUND_OVER';
        let winnerName = lastAlive ? lastAlive.name : "Draw - Mutual Destruction";
        io.emit('roundOver', { winner: winnerName });
    }
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('joinLobby', (name) => {
        if (lobby.length >= 7) {
            socket.emit('lobbyFull');
            return;
        }
        lobby.push({ id: socket.id, name: name || 'Unknown' });
        io.emit('lobbyUpdate', lobby);
    });

socket.on('startMatch', () => {
    console.log(`[SERVER] Start Match received. Current State: ${gameState} | Players in array: ${lobby.length}`);
    
    // Bypassing the gameState check so we can force-restart if needed
    if (lobby.length >= 2) {
        console.log(`[SERVER] Initiating Grid Sequence...`);
        startRound();
    } else {
        console.log(`[SERVER] Ignored: Not enough players registered on the server.`);
    }
});

    socket.on('changeDirection', (dir) => {
        let p = players[socket.id];
        if (p && p.alive) {
            // Prevent 180 degree turns
            if (dir.x !== 0 && p.dirX !== -dir.x) { p.dirX = dir.x; p.dirY = 0; }
            if (dir.y !== 0 && p.dirY !== -dir.y) { p.dirX = 0; p.dirY = dir.y; }
        }
    });

    socket.on('nextRound', () => {
        if (gameState === 'ROUND_OVER') {
            round++;
            startRound();
        }
    });

    socket.on('exitToLobby', () => {
        if (gameState === 'ROUND_OVER') {
            gameState = 'LOBBY';
            io.emit('lobbyUpdate', lobby); // Kick everyone back to lobby UI
        }
    });

    socket.on('disconnect', () => {
        lobby = lobby.filter(p => p.id !== socket.id);
        if (players[socket.id]) players[socket.id].alive = false;
        io.emit('lobbyUpdate', lobby);
        console.log('User disconnected:', socket.id);
    });
});

server.listen(3000, () => {
    console.log('Global Thermonuclear War (Grid Server) running on http://localhost:3000');
});
