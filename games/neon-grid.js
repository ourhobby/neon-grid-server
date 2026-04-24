// File: games/neon-grid.js
module.exports = function(io) {
    // This creates an isolated channel just for grid players
    const gridSpace = io.of('/grid');

    const COLS = 100;
    const ROWS = 75;
    const COLORS = ['#00ffff', '#ff00ff', '#00ff00', '#ffaa00', '#ff0000', '#ffff00', '#0000ff'];

    let lobby = []; 
    let players = {}; 
    let grid = [];
    let gameInterval = null;
    let gameState = 'LOBBY'; 
    let round = 1;

    function initGrid() { grid = new Array(COLS).fill(0).map(() => new Array(ROWS).fill(0)); }

    function startRound() {
        if (lobby.length < 2) return; 
        gameState = 'PLAYING';
        initGrid();
        players = {};
        
        let activePlayers = lobby.slice(0, 7); 
        activePlayers.forEach((p, index) => {
            players[p.id] = {
                id: p.id, name: p.name, color: COLORS[index % COLORS.length],
                x: Math.floor(COLS * 0.1) + (index * 10),
                y: Math.floor(ROWS * ((index + 1) / (activePlayers.length + 1))),
                dirX: 1, dirY: 0, alive: true
            };
        });

        gridSpace.emit('gameStart', { round, players, cols: COLS, rows: ROWS });

        if (gameInterval) clearInterval(gameInterval);
        setTimeout(() => { gameInterval = setInterval(gameTick, 80); }, 3000);
    }

    function gameTick() {
        let aliveCount = 0;
        let lastAlive = null;

        for (let id in players) {
            let p = players[id];
            if (!p.alive) continue;

            grid[p.x][p.y] = p.color;
            p.x += p.dirX;
            p.y += p.dirY;

            if (p.x < 0 || p.x >= COLS || p.y < 0 || p.y >= ROWS || grid[p.x][p.y] !== 0) {
                p.alive = false;
                gridSpace.emit('playerCrashed', { id: p.id, x: p.x, y: p.y, color: p.color });
            } else {
                aliveCount++;
                lastAlive = p;
            }
        }

        gridSpace.emit('gameState', { players, grid });

        if (aliveCount <= 1) {
            clearInterval(gameInterval);
            gameState = 'ROUND_OVER';
            let winnerName = lastAlive ? lastAlive.name : "Draw - Mutual Destruction";
            gridSpace.emit('roundOver', { winner: winnerName });
        }
    }

    gridSpace.on('connection', (socket) => {
        socket.on('joinLobby', (name) => {
            if (lobby.length >= 7) { socket.emit('lobbyFull'); return; }
            lobby.push({ id: socket.id, name: name || 'Unknown' });
            gridSpace.emit('lobbyUpdate', lobby);
        });

        socket.on('startMatch', () => { if (gameState === 'LOBBY' && lobby.length >= 2) startRound(); });

        socket.on('changeDirection', (dir) => {
            let p = players[socket.id];
            if (p && p.alive) {
                if (dir.x !== 0 && p.dirX !== -dir.x) { p.dirX = dir.x; p.dirY = 0; }
                if (dir.y !== 0 && p.dirY !== -dir.y) { p.dirX = 0; p.dirY = dir.y; }
            }
        });

        socket.on('nextRound', () => { if (gameState === 'ROUND_OVER') { round++; startRound(); } });

        socket.on('exitToLobby', () => {
            if (gameState === 'ROUND_OVER') { gameState = 'LOBBY'; gridSpace.emit('lobbyUpdate', lobby); }
        });

        socket.on('disconnect', () => {
            lobby = lobby.filter(p => p.id !== socket.id);
            if (players[socket.id]) players[socket.id].alive = false;
            gridSpace.emit('lobbyUpdate', lobby);
        });
    });
};
