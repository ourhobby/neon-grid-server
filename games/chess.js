// File: games/chess.js
module.exports = function(io) {
    const chessSpace = io.of('/chess');
    let waitingPlayer = null; 

    console.log("♟️ Chess multiplayer module loaded!");

    chessSpace.on('connection', (socket) => {
        console.log(`⚡ New connection attempt: ${socket.id}`);
        
        socket.on('findMatch', (userName) => {
            console.log(`🔍 Player [${userName}] is looking for a match.`);

            if (waitingPlayer && waitingPlayer.id !== socket.id) {
                console.log(`✅ Match found! Pairing ${waitingPlayer.userName} with ${userName}`);
                
                const roomName = 'chess_room_' + waitingPlayer.id;
                
                socket.join(roomName);
                waitingPlayer.join(roomName);

                // Assign colors and start the match
                chessSpace.to(waitingPlayer.id).emit('matchStart', { color: 'w', room: roomName, opponent: userName });
                chessSpace.to(socket.id).emit('matchStart', { color: 'b', room: roomName, opponent: waitingPlayer.userName });

                waitingPlayer = null; // Clear the waiting slot
            } else {
                console.log(`⏳ No one is waiting. Putting [${userName}] in the queue.`);
                waitingPlayer = socket;
                waitingPlayer.userName = userName;
                socket.emit('waitingForOpponent');
            }
        });

        socket.on('makeMove', (data) => {
            console.log(`♟️ Move made in room ${data.room}: ${data.move.san}`);
            socket.to(data.room).emit('opponentMove', data);
        });

        socket.on('disconnect', () => {
            console.log(`❌ Player disconnected: ${socket.id}`);
            if (waitingPlayer && waitingPlayer.id === socket.id) {
                console.log("🧹 Clearing waiting player because they left.");
                waitingPlayer = null;
            }
        });
    });
};
