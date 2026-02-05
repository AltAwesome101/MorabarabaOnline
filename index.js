console.log("🔥 index.js has started");

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve frontend files
app.use(express.static(path.join(__dirname, "public")));

// Socket.IO logic
let board = Array(24).fill(null);

let currentPlayer = "P1";

let cowsPlaced = {
  P1: 0,
  P2: 0,
};

let phase = "placement"; // placement | movement | flying

let selectedPoint = null;

let mustCapture = false;

let capturePlayer = null;

//let winner = null;

const adjacency = {
  0: [1, 7],
  1: [0, 2, 9],
  2: [1, 3],
  3: [2, 4, 11],
  4: [3, 5],
  5: [4, 6, 13],
  6: [5, 7],
  7: [6, 0, 15],

  8: [9, 15],
  9: [8, 10, 1, 17],
  10: [9, 11],
  11: [10, 12, 3, 19],
  12: [11, 13],
  13: [12, 14, 5, 21],
  14: [13, 15],
  15: [14, 8, 7, 23],

  16: [17, 23],
  17: [16, 18, 9],
  18: [17, 19],
  19: [18, 20, 11],
  20: [19, 21],
  21: [20, 22, 13],
  22: [21, 23],
  23: [22, 16, 15],
};

const mills = [
  // Outer square
  [0, 1, 2],
  [2, 3, 4],
  [4, 5, 6],
  [6, 7, 0],

  // Middle square
  [8, 9, 10],
  [10, 11, 12],
  [12, 13, 14],
  [14, 15, 8],

  // Inner square
  [16, 17, 18],
  [18, 19, 20],
  [20, 21, 22],
  [22, 23, 16],

  // Vertical connections
  [1, 9, 17],
  [3, 11, 19],
  [5, 13, 21],
  [7, 15, 23],
];

function isMillFormed(board, player, point) {
  return mills.some(
    (mill) =>
      mill.includes(point) && mill.every((pos) => board[pos] === player),
  );
}

function getCapturablePositions(board, opponent) {
  const nonMill = [];
  const inMill = [];

  for (let i = 0; i < 24; i++) {
    if (board[i] === opponent) {
      const partOfMill = mills.some(
        (mill) =>
          mill.includes(i) && mill.every((pos) => board[pos] === opponent),
      );

      if (partOfMill) inMill.push(i);
      else nonMill.push(i);
    }
  }

  return nonMill.length > 0 ? nonMill : inMill;
}

//function getGameState() {
//return {
// board,
// currentPlayer,
// phase,
// cowsPlaced,
// selectedPoint,
// mustCapture,
// winner,
// };
//}

function countCows(board, player) {
  return board.filter((p) => p === player).length;
}

//function hasAnyLegalMove(board, player) {
// const cowCount = countCows(board, player);
//const canFly = cowCount === 3;

//for (let i = 0; i < 24; i++) {
//  if (board[i] === player) {
//    if (canFly) {
// Any empty spot works
//     if (board.includes(null)) return true;
//    } else {
// Check adjacent empty
//     for (const adj of adjacency[i]) {
//       if (board[adj] === null) return true;
//    }
//    }
//    }
//  }
//  return false;
//}

//function checkWinner(board, playerJustMoved) {
//const opponent = playerJustMoved === "P1" ? "P2" : "P1";

//const opponentCows = countCows(board, opponent);

//if (opponentCows <= 2) {
//return playerJustMoved;
// }

//if (!hasAnyLegalMove(board, opponent)) {
//   return playerJustMoved;
// }

// return null;
//}

io.on("connection", (socket) => {
  console.log("🟢 Player connected:", socket.id);

  // Send current board to new player
  socket.emit("boardUpdate", {
    board,
    currentPlayer,
    phase,
    cowsPlaced,
  });

  socket.on("placeCow", (pointId) => {
    // 🔴 CAPTURE MODE
    if (mustCapture) {
      const opponent = capturePlayer === "P1" ? "P2" : "P1";
      const capturable = getCapturablePositions(board, opponent);

      if (!capturable.includes(pointId)) return;

      board[pointId] = null;
      mustCapture = false;
      capturePlayer = null;

      // winner = checkWinner(board, currentPlayer);
      // if (winner) {
      //   io.emit("boardUpdate", getGameState());
      //   return;
      // }

      io.emit("boardUpdate", {
        board,
        currentPlayer,
        phase,
        cowsPlaced,
        selectedPoint,
        mustCapture,
      });

      return;
    }

    // 🔹 PLACEMENT PHASE
    if (phase === "placement") {
      if (board[pointId] !== null) return;
      if (cowsPlaced[currentPlayer] >= 12) return;

      board[pointId] = currentPlayer;
      cowsPlaced[currentPlayer]++;

      if (isMillFormed(board, currentPlayer, pointId)) {
        mustCapture = true;
        capturePlayer = currentPlayer;
      } else {
        currentPlayer = currentPlayer === "P1" ? "P2" : "P1";
      }

      if (cowsPlaced.P1 === 12 && cowsPlaced.P2 === 12) {
        phase = "movement";
      }

      io.emit("boardUpdate", {
        board,
        currentPlayer,
        phase,
        cowsPlaced,
        selectedPoint,
        mustCapture,
      });

      return;
    }

    // 🔹 MOVEMENT PHASE

    const cowCount = countCows(board, currentPlayer);
    const canFly = cowCount === 3;

    if (phase === "movement") {
      if (selectedPoint === null) {
        if (board[pointId] === currentPlayer) {
          selectedPoint = pointId;
        }
      } else {
        if (
          board[pointId] === null &&
          (canFly || adjacency[selectedPoint].includes(pointId))
        ) {
          board[pointId] = currentPlayer;
          board[selectedPoint] = null;
          selectedPoint = null;

          //winner = checkWinner(board, currentPlayer);
          // if (winner) {
          //   io.emit("boardUpdate", getGameState());
          //    return;
          //  }

          if (isMillFormed(board, currentPlayer, pointId)) {
            mustCapture = true;
            capturePlayer = currentPlayer;
          } else {
            currentPlayer = currentPlayer === "P1" ? "P2" : "P1";
          }
        } else {
          selectedPoint = null;
        }
      }

      io.emit("boardUpdate", {
        board,
        currentPlayer,
        phase,
        cowsPlaced,
        selectedPoint,
        mustCapture,
      });
    }
  });

  socket.on("disconnect", () => {
    console.log("🔴 Player disconnected:", socket.id);
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
