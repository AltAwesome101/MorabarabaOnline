const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

let players = {};
let spectators = [];
let board = Array(24).fill(null);
let currentPlayer = "P1";
let winner = null;
let phase = "variant-selection";
let piecesPlaced = { P1: 0, P2: 0 };
let captureMode = false;
let playerWhoFormedMill = null;
let lastMillFormed = null;
let movesWithoutCapture = 0;
let drawOffered = false;
let gameVariant = null;
let variantVotes = { P1: null, P2: null };

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

  // Vertical connectors
  [1, 9, 17],
  [3, 11, 19],
  [5, 13, 21],
  [7, 15, 23],

  // Diagonals (VALID ONLY)
  [0, 8, 16],
  [2, 10, 18],
  [4, 12, 20],
  [6, 14, 22],
];

function checkMill(position, player) {
  return mills.some(
    (mill) =>
      mill.includes(position) && mill.every((pos) => board[pos] === player),
  );
}

function isPartOfMill(position) {
  const player = board[position];
  if (!player) return false;
  return checkMill(position, player);
}

function broadcast() {
  let capturablePositions = [];
  if (captureMode && playerWhoFormedMill) {
    const opponent = playerWhoFormedMill === "P1" ? "P2" : "P1";
    const opponentPieces = board
      .map((p, idx) => (p === opponent ? idx : null))
      .filter((idx) => idx !== null);

    const piecesNotInMills = opponentPieces.filter((pos) => !isPartOfMill(pos));

    if (piecesNotInMills.length > 0) {
      capturablePositions = piecesNotInMills;
    } else {
      capturablePositions = opponentPieces;
    }
  }

  const p1Count = board.filter((p) => p === "P1").length;
  const p2Count = board.filter((p) => p === "P2").length;

  io.emit("boardUpdate", {
    board,
    currentPlayer,
    winner,
    phase,
    piecesPlaced,
    captureMode,
    playerWhoFormedMill,
    capturablePositions,
    p1CanFly: canPlayerFly("P1"),
    p2CanFly: canPlayerFly("P2"),
    p1Count,
    p2Count,
    movesWithoutCapture,
    gameVariant,
    variantVotes,
  });
}

function checkWinner() {
  const p1Count = board.filter((p) => p === "P1").length;
  const p2Count = board.filter((p) => p === "P2").length;

  if (p1Count < 3 && phase === "movement") {
    winner = "P2";
    phase = "finished";
    return true;
  }
  if (p2Count < 3 && phase === "movement") {
    winner = "P1";
    phase = "finished";
    return true;
  }

  if (phase === "movement" && !captureMode) {
    const opponent = currentPlayer === "P1" ? "P2" : "P1";
    const opponentCount = board.filter((p) => p === opponent).length;

    if (opponentCount > 3) {
      let hasValidMove = false;
      for (let i = 0; i < 24; i++) {
        if (board[i] === opponent) {
          for (const adj of adjacency[i]) {
            if (board[adj] === null) {
              hasValidMove = true;
              break;
            }
          }
          if (hasValidMove) break;
        }
      }

      if (!hasValidMove) {
        winner = currentPlayer;
        phase = "finished";
        return true;
      }
    }
  }

  if (p1Count === 3 && p2Count === 3 && movesWithoutCapture >= 10) {
    winner = "Draw";
    phase = "finished";
    return true;
  }

  return false;
}

function canPlayerFly(player) {
  const pieceCount = board.filter((p) => p === player).length;
  return pieceCount === 3;
}

function aiMove(difficulty) {
  if (captureMode && playerWhoFormedMill === currentPlayer) {
    const opponent = currentPlayer === "P1" ? "P2" : "P1";
    const opponentPieces = board
      .map((p, idx) => (p === opponent ? idx : null))
      .filter((idx) => idx !== null);

    let captureTarget = opponentPieces.find((pos) => !isPartOfMill(pos));

    if (captureTarget === undefined && opponentPieces.length > 0) {
      captureTarget = opponentPieces[0];
    }

    if (captureTarget !== undefined) {
      board[captureTarget] = null;
      captureMode = false;
      playerWhoFormedMill = null;
      movesWithoutCapture = 0;
      currentPlayer = currentPlayer === "P1" ? "P2" : "P1";
    }
    return;
  }

  if (phase === "placement") {
    const emptySpots = board
      .map((val, idx) => (val === null ? idx : null))
      .filter((idx) => idx !== null);

    if (emptySpots.length > 0) {
      const move = emptySpots[Math.floor(Math.random() * emptySpots.length)];
      board[move] = currentPlayer;
      piecesPlaced[currentPlayer]++;

      const formedMill = checkMill(move, currentPlayer);
      if (formedMill) {
        captureMode = true;
        playerWhoFormedMill = currentPlayer;

        setTimeout(() => {
          aiMove(difficulty);
          checkWinner();
          broadcast();
        }, 600);
        return;
      }

      if (piecesPlaced.P1 === gameVariant && piecesPlaced.P2 === gameVariant) {
        phase = "movement";
      }

      currentPlayer = currentPlayer === "P1" ? "P2" : "P1";
    }
  } else if (phase === "movement") {
    const playerCanFly = canPlayerFly(currentPlayer);
    const moves = [];

    for (let i = 0; i < 24; i++) {
      if (board[i] === currentPlayer) {
        if (playerCanFly) {
          for (let j = 0; j < 24; j++) {
            if (board[j] === null) {
              moves.push([i, j]);
            }
          }
        } else {
          for (const a of adjacency[i]) {
            if (board[a] === null) {
              moves.push([i, a]);
            }
          }
        }
      }
    }

    if (moves.length > 0) {
      const move = moves[Math.floor(Math.random() * moves.length)];
      board[move[0]] = null;
      board[move[1]] = currentPlayer;

      const formedMill = checkMill(move[1], currentPlayer);
      if (formedMill) {
        captureMode = true;
        playerWhoFormedMill = currentPlayer;

        setTimeout(() => {
          aiMove(difficulty);
          checkWinner();
          broadcast();
        }, 600);
        return;
      }

      movesWithoutCapture++;
      currentPlayer = currentPlayer === "P1" ? "P2" : "P1";
    }
  }
}

io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on("join", ({ nickname, mode }) => {
    socket.nickname = nickname || "Guest";

    if (mode === "spectator") {
      spectators.push(socket.id);
      io.emit("chat", `👁️ ${socket.nickname} is spectating`);
      broadcast();
      return;
    }

    if (mode.startsWith("ai")) {
      socket.playerNumber = "P1";
      players[socket.id] = mode;
      io.emit(
        "chat",
        `✅ ${socket.nickname} joined as P1 vs ${mode.toUpperCase()}`,
      );

      socket.emit("variantSelection", {
        canChoose: true,
        player: "P1",
        showP2Option: false,
      });
      broadcast();
      return;
    }

    const playerKeys = Object.keys(players);
    if (playerKeys.length === 0) {
      socket.playerNumber = "P1";
      players[socket.id] = mode;
      io.emit("chat", `✅ ${socket.nickname} joined as P1 (${mode})`);

      socket.emit("variantSelection", {
        canChoose: true,
        player: "P1",
        showP2Option: true,
      });
    } else if (playerKeys.length === 1) {
      socket.playerNumber = "P2";
      players[socket.id] = mode;
      io.emit("chat", `✅ ${socket.nickname} joined as P2 (${mode})`);

      if (variantVotes.P1 === "p2-choose") {
        socket.emit("variantSelection", {
          canChoose: true,
          player: "P2",
          showP2Option: false,
        });
      } else if (variantVotes.P1 !== null) {
        gameVariant = variantVotes.P1;
        phase = "placement";
        io.emit("chat", `🎮 Starting ${gameVariant} Men's Morris!`);
        broadcast();
      } else {
        socket.emit("variantSelection", {
          canChoose: false,
          player: "P2",
        });
      }
    }

    broadcast();
  });

  socket.on("selectVariant", ({ variant }) => {
    console.log(`Variant selected: ${variant} by ${socket.playerNumber}`);

    if (socket.playerNumber === "P1") {
      variantVotes.P1 = variant;

      if (variant === "p2-choose") {
        io.emit("chat", `P1 lets P2 choose the variant`);

        io.emit("variantSelection", {
          canChoose: true,
          player: "P2",
          showP2Option: false,
        });
      } else {
        gameVariant = parseInt(variant);
        phase = "placement";

        const mode = Object.values(players)[0];
        if (mode && mode.startsWith("ai")) {
          io.emit(
            "chat",
            `🎮 Starting ${gameVariant} Men's Morris vs ${mode.toUpperCase()}!`,
          );
        } else {
          io.emit(
            "chat",
            `🎮 P1 chose ${gameVariant} Men's Morris! Game starting...`,
          );
        }
        broadcast();
      }
    } else if (socket.playerNumber === "P2") {
      variantVotes.P2 = variant;
      gameVariant = parseInt(variant);
      phase = "placement";
      io.emit(
        "chat",
        `🎮 P2 chose ${gameVariant} Men's Morris! Game starting...`,
      );
      broadcast();
    }
  });

  socket.on("placeCow", (id) => {
    console.log(
      `placeCow called: id=${id}, phase=${phase}, winner=${winner}, currentPlayer=${currentPlayer}, captureMode=${captureMode}`,
    );

    if (winner) {
      console.log("Game already won, ignoring move");
      return;
    }

    if (captureMode) {
      const opponent = playerWhoFormedMill === "P1" ? "P2" : "P1";

      if (board[id] !== opponent) {
        console.log("Must select an opponent's piece to capture");
        return;
      }

      const opponentPieces = board
        .map((p, idx) => (p === opponent ? idx : null))
        .filter((idx) => idx !== null);

      const piecesNotInMills = opponentPieces.filter(
        (pos) => !isPartOfMill(pos),
      );

      if (piecesNotInMills.length > 0 && isPartOfMill(id)) {
        console.log(
          "Cannot capture piece in a mill (pieces not in mills are available)",
        );
        return;
      }

      console.log(`${playerWhoFormedMill} captures opponent piece at ${id}`);
      board[id] = null;
      captureMode = false;
      playerWhoFormedMill = null;

      movesWithoutCapture = 0;

      currentPlayer = currentPlayer === "P1" ? "P2" : "P1";

      checkWinner();
      broadcast();

      const mode = Object.values(players)[0];
      if (mode?.startsWith("ai") && currentPlayer === "P2" && !winner) {
        setTimeout(() => {
          aiMove(mode.split("-")[1]);
          checkWinner();
          broadcast();
        }, 600);
      }

      return;
    }

    if (board[id] !== null) {
      console.log("Position already occupied");
      return;
    }

    if (phase === "placement") {
      console.log(`Placing ${currentPlayer} cow at position ${id}`);
      board[id] = currentPlayer;
      piecesPlaced[currentPlayer]++;

      const formedMill = checkMill(id, currentPlayer);
      if (formedMill) {
        console.log(`${currentPlayer} formed a mill! Enter capture mode.`);
        captureMode = true;
        playerWhoFormedMill = currentPlayer;

        broadcast();
        return;
      }

      currentPlayer = currentPlayer === "P1" ? "P2" : "P1";

      if (piecesPlaced.P1 === gameVariant && piecesPlaced.P2 === gameVariant) {
        phase = "movement";
        console.log("Switching to movement phase");
      }

      broadcast();

      // AI move
      const mode = Object.values(players)[0];
      if (mode?.startsWith("ai") && !winner && currentPlayer === "P2") {
        setTimeout(() => {
          aiMove(mode.split("-")[1]);
          checkWinner();
          broadcast();
        }, 600);
      }
    }
  });

  socket.on("movePiece", ({ from, to }) => {
    console.log(
      `movePiece: from=${from}, to=${to}, phase=${phase}, currentPlayer=${currentPlayer}`,
    );

    if (winner || phase !== "movement" || captureMode) {
      console.log("Invalid move state");
      return;
    }

    if (board[from] !== currentPlayer) {
      console.log("Not your piece");
      return;
    }

    if (board[to] !== null) {
      console.log("Destination occupied");
      return;
    }

    const playerCanFly = canPlayerFly(currentPlayer);

    if (!playerCanFly && !adjacency[from].includes(to)) {
      console.log("Not an adjacent position (and you can't fly yet)");
      return;
    }

    const millsBeforeMove = mills.filter((mill) =>
      mill.every((pos) => board[pos] === currentPlayer),
    );

    board[from] = null;
    board[to] = currentPlayer;
    console.log(
      `Moved ${currentPlayer} from ${from} to ${to}${playerCanFly ? " (FLYING)" : ""}`,
    );

    const millsAfterMove = mills.filter((mill) =>
      mill.every((pos) => board[pos] === currentPlayer),
    );

    const newMills = millsAfterMove.filter(
      (mill) =>
        !millsBeforeMove.some((oldMill) =>
          mill.every((pos, idx) => pos === oldMill[idx]),
        ),
    );

    let formedMill = false;
    if (newMills.length > 0) {
      if (lastMillFormed) {
        const isSameMill = newMills.some((mill) =>
          mill.every((pos, idx) => pos === lastMillFormed[idx]),
        );

        if (isSameMill && millsBeforeMove.length === 0) {
          console.log("Cannot immediately reform the same mill");
          lastMillFormed = null;
        } else {
          formedMill = true;
          lastMillFormed = newMills[0];
        }
      } else {
        formedMill = true;
        lastMillFormed = newMills[0];
      }
    } else {
      lastMillFormed = null;
    }

    if (formedMill) {
      console.log(`${currentPlayer} formed a mill! Enter capture mode.`);
      captureMode = true;
      playerWhoFormedMill = currentPlayer;
      broadcast();
      return;
    }

    movesWithoutCapture++;

    // Switch turns
    currentPlayer = currentPlayer === "P1" ? "P2" : "P1";

    checkWinner();
    broadcast();

    const mode = Object.values(players)[0];
    if (mode?.startsWith("ai") && currentPlayer === "P2" && !winner) {
      setTimeout(() => {
        aiMove(mode.split("-")[1]);
        checkWinner();
        broadcast();
      }, 600);
    }
  });

  socket.on("chat", (msg) => {
    if (msg.trim()) {
      io.emit("chat", `${socket.nickname}: ${msg}`);
    }
  });

  socket.on("disconnect", () => {
    if (players[socket.id]) {
      io.emit("chat", `❌ ${socket.nickname} left`);
      delete players[socket.id];
    }
    spectators = spectators.filter((id) => id !== socket.id);
    console.log(`User disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Morabaraba server running on http://localhost:${PORT}`);
});
