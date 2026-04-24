// File: games/chess.js
module.exports = function(io) {
    const chessSpace = io.of('/chess');
    let waitingPlayer = null; // Holds a player until a second one joins

    chessSpace.on('connection', (socket) => {
        
        socket.on('findMatch', (userName) => {
            if (waitingPlayer && waitingPlayer.id !== socket.id) {
                // We have two players! Create a unique room for them.
                const roomName = 'chess_room_' + waitingPlayer.id;
                
                socket.join(roomName);
                waitingPlayer.join(roomName);

                // Assign colors and start the match
                chessSpace.to(waitingPlayer.id).emit('matchStart', { color: 'w', room: roomName, opponent: userName });
                chessSpace.to(socket.id).emit('matchStart', { color: 'b', room: roomName, opponent: waitingPlayer.userName });

                waitingPlayer = null; // Clear the waiting slot
            } else {
                // Nobody is waiting, so this player becomes the waiting player
                waitingPlayer = socket;
                waitingPlayer.userName = userName;
                socket.emit('waitingForOpponent');
            }
        });

        // When a player makes a move, relay it to the other person in their room
        socket.on('makeMove', (data) => {
            // data should include { room: '...', move: '...', fen: '...' }
            socket.to(data.room).emit('opponentMove', data);
        });

        socket.on('disconnect', () => {
            if (waitingPlayer && waitingPlayer.id === socket.id) {
                waitingPlayer = null;
            }
            // You can add logic here to emit an 'opponentLeft' message to the room
        });
    });
};