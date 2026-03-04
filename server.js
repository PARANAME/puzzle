const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http, {
  transports: ["websocket", "polling"]
});

app.use(express.static("public"));

let rooms = {};

function getRoom(room) {
  if (!rooms[room]) {
    rooms[room] = {
      players: {},
      gameStarted: false,
      gameOver: false,
      winner: null
    };
  }
  return rooms[room];
}

function getOpponentId(room, myId) {
  return Object.keys(rooms[room].players).find(id => id !== myId) || null;
}

io.on("connection", socket => {
  console.log("connect:", socket.id);

  socket.on("join", ({ room, name }) => {
    socket.join(room);
    const game = getRoom(room);
    game.players[socket.id] = { name: name || "Player", ready: false };
    io.to(room).emit("state", game);
  });

  socket.on("ready", ({ room }) => {
    const game = rooms[room];
    if (!game || !game.players[socket.id]) return;
    game.players[socket.id].ready = true;

    const ids = Object.keys(game.players);
    if (ids.length === 2 && ids.every(id => game.players[id].ready)) {
      game.gameStarted = true;
      const seed = Math.floor(Math.random() * 2147483647);
      io.to(room).emit("game_start", { seed });
      io.to(room).emit("state", game);
    } else {
      io.to(room).emit("state", game);
    }
  });

  socket.on("send_ojama", ({ room, count }) => {
    const opId = getOpponentId(room, socket.id);
    if (opId) {
      io.to(opId).emit("receive_ojama", { count });
    }
  });

  socket.on("board_update", ({ room, board, score, ojamaCounter }) => {
    const opId = getOpponentId(room, socket.id);
    if (opId) {
      io.to(opId).emit("opponent_board", { board, score, ojamaCounter });
    }
  });

  socket.on("game_over", ({ room }) => {
    const game = rooms[room];
    if (!game || game.gameOver) return;
    game.gameOver = true;
    const opId = getOpponentId(room, socket.id);
    const winnerName = opId && game.players[opId] ? game.players[opId].name : "???";
    game.winner = winnerName;
    io.to(room).emit("game_over_result", { loserId: socket.id, winnerName });
    io.to(room).emit("state", game);
  });

  socket.on("restart", ({ room }) => {
    const game = rooms[room];
    if (!game) return;
    Object.keys(game.players).forEach(id => {
      game.players[id].ready = false;
    });
    game.gameStarted = false;
    game.gameOver = false;
    game.winner = null;
    io.to(room).emit("restart_ack");
    io.to(room).emit("state", game);
  });

  socket.on("disconnect", () => {
    for (let room in rooms) {
      if (rooms[room].players[socket.id]) {
        const opId = getOpponentId(room, socket.id);
        delete rooms[room].players[socket.id];
        if (opId) {
          io.to(opId).emit("opponent_left");
        }
        io.to(room).emit("state", rooms[room]);
      }
    }
    console.log("disconnect:", socket.id);
  });
});

http.listen(process.env.PORT || 3000, () => {
  console.log("Puzzle server running on port 3000");
});
