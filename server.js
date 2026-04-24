const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(express.static('public'));
app.get('/', (req, res) => {
    res.send('Multiplayer Arcade Engine is Online!');
});

// Load the individual game modules
require('./games/neon-grid')(io);
require('./games/chess')(io);

server.listen(3000, () => {
    console.log('Arcade Server running on port 3000');
});
