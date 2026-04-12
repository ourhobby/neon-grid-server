const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// VIP List for GoDaddy
const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

app.use(express.static('public'));

// Removes the "Cannot GET /" error on Render
app.get('/', (req, res) => {
    res.send('Neon Grid Multiplayer Engine is Online!');
});

// Game Constants
const COLS = 100;
const ROWS = 75;
const COLORS = ['#00ffff', '#ff00ff', '#00ff00', '#ffaa00', '#ff0000', '#ffff00', '#0000ff'];

// State
let lobby = []; 
let players = {}; 
let grid = [];
let gameInterval = null;
let gameState = 'LOBBY'; 
let round = 1;

function initGrid() {
    grid = new Array(COLS).fill(0).map(() => new Array(ROWS).fill(0));
}

function startRound() {
    gameState = 'PLAYING';
    initGrid();
    players = {};
    
    // Spawn players
    let activePlayers = lobby.slice(0, 7); 
    activePlayers.forEach((p, index) => {
        players[p.id] = {
            id: p.id,
            name: p.name,
            color: COLORS[index % COLORS.length],
            x: Math.floor(COLS * 0.1) + (index * 10),
            y: Math.floor(ROWS * ((index + 1) / (activePlayers.length + 1))),
            dirX: 1,
            dirY: 0,
            alive: true,
            trail: [] // The Trail Memory
        };
    });

    io.emit('gameStart', { round, players, cols: COLS, rows: ROWS });

    if (gameInterval) clearInterval(gameInterval);
    
    // Wait for countdown before moving
    setTimeout(() => {
        gameInterval = setInterval(gameTick, 80); 
    }, 3000);
}

function gameTick() {
    let aliveCount = 0;
    let lastAlive = null;

    // Process movements
    for (let id in players) {
        let p = players[id];

        if (p.alive) {
            // Mark current spot as trail
            grid[p.x][p.y] = p.color;
            p.trail.push({ x: p.x, y: p.y });

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
        } else {
            // Slowly dissolve dead player's trail
            if (p.trail && p.trail.length > 0) {
                let fadeSpeed = 3; 
                for (let i = 0; i < fadeSpeed && p.trail.length > 0; i++) {
                    let oldPos = p.trail.shift(); 
                    grid[oldPos.x][oldPos.y] = 0; 
                }
            }
        }
    }

    io.emit('gameState', { players, grid });

    // Check Round Over condition
    if (aliveCount <= 1 && gameState === 'PLAYING') {
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
        // Make sure we don't duplicate players if they reconnect
        if (!lobby.find(p => p.id === socket.id)) {
            lobby.push({ id: socket.id, name: name || 'Unknown' });
        }
        io.emit('lobbyUpdate', lobby);
    });

    socket.on('startMatch', () => {
        console.log(`[SERVER] Start Match received. Players in lobby: ${lobby.length}`);
        if (lobby.length >= 2) {
            console.log(`[SERVER] Initiating Grid Sequence...`);
            startRound();
        } else {
            console.log(`[SERVER] Ignored: Not enough players.`);
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
            io.emit('lobbyUpdate', lobby); 
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
    console.log('Global Thermonuclear War (Grid Server) running on port 3000');
});
