const boardDiv = document.getElementById("board");

const pointPositions = [
  // Outer square (0-7)
  [0, 0], // 0: top-left
  [50, 0], // 1: top-center
  [100, 0], // 2: top-right
  [100, 50], // 3: right-center
  [100, 100], // 4: bottom-right
  [50, 100], // 5: bottom-center
  [0, 100], // 6: bottom-left
  [0, 50], // 7: left-center

  // Middle square (8-15)
  [15, 15], // 8: top-left
  [50, 15], // 9: top-center
  [85, 15], // 10: top-right
  [85, 50], // 11: right-center
  [85, 85], // 12: bottom-right
  [50, 85], // 13: bottom-center
  [15, 85], // 14: bottom-left
  [15, 50], // 15: left-center

  // Inner square (16-23)
  [30, 30], // 16: top-left
  [50, 30], // 17: top-center
  [70, 30], // 18: top-right
  [70, 50], // 19: right-center
  [70, 70], // 20: bottom-right
  [50, 70], // 21: bottom-center
  [30, 70], // 22: bottom-left
  [30, 50], // 23: left-center
];

pointPositions.forEach((pos, id) => {
  const p = document.createElement("div");
  p.classList.add("point");
  p.dataset.id = id;
  p.style.left = pos[0] + "%";
  p.style.top = pos[1] + "%";

  p.onclick = () => {
    console.log(`Point ${id} clicked`);

    if (!gameState) return;

    if (gameState.captureMode) {
      socket.emit("placeCow", id);
      return;
    }

    if (gameState.phase === "placement") {
      socket.emit("placeCow", id);
      return;
    }

    if (gameState.phase === "movement") {
      const clickedPiece = gameState.board[id];

      if (selectedPiece === null) {
        if (clickedPiece === gameState.currentPlayer) {
          selectedPiece = id;
          console.log(`Selected piece at ${id}`);

          document.querySelectorAll(".point").forEach((point, idx) => {
            point.classList.remove("move-target");
          });

          const currentPlayerCanFly =
            (gameState.currentPlayer === "P1" && gameState.p1CanFly) ||
            (gameState.currentPlayer === "P2" && gameState.p2CanFly);

          if (currentPlayerCanFly) {
            gameState.board.forEach((piece, idx) => {
              if (piece === null) {
                document
                  .querySelector(`[data-id="${idx}"]`)
                  .classList.add("move-target");
              }
            });
            console.log("FLYING MODE - can move to any empty position!");
          } else {
            const adjacentPositions = adjacency[id];
            adjacentPositions.forEach((adjId) => {
              if (gameState.board[adjId] === null) {
                document
                  .querySelector(`[data-id="${adjId}"]`)
                  .classList.add("move-target");
              }
            });
          }

          p.classList.add("selected");
        }
      } else {
        if (clickedPiece === null) {
          socket.emit("movePiece", { from: selectedPiece, to: id });
          selectedPiece = null;

          document.querySelectorAll(".point").forEach((point) => {
            point.classList.remove("move-target", "selected");
          });
        } else if (clickedPiece === gameState.currentPlayer) {
          selectedPiece = id;
          console.log(`Changed selection to piece at ${id}`);

          document.querySelectorAll(".point").forEach((point, idx) => {
            point.classList.remove("move-target", "selected");
          });

          const currentPlayerCanFly =
            (gameState.currentPlayer === "P1" && gameState.p1CanFly) ||
            (gameState.currentPlayer === "P2" && gameState.p2CanFly);

          if (currentPlayerCanFly) {
            gameState.board.forEach((piece, idx) => {
              if (piece === null) {
                document
                  .querySelector(`[data-id="${idx}"]`)
                  .classList.add("move-target");
              }
            });
          } else {
            const adjacentPositions = adjacency[id];
            adjacentPositions.forEach((adjId) => {
              if (gameState.board[adjId] === null) {
                document
                  .querySelector(`[data-id="${adjId}"]`)
                  .classList.add("move-target");
              }
            });
          }

          p.classList.add("selected");
        }
      }
    }
  };

  boardDiv.appendChild(p);
});

const socket = io();
let gameState = null;
let selectedPiece = null;
let myPlayerNumber = null;

const board = document.getElementById("board");
const statusText = document.getElementById("status");
const messages = document.getElementById("messages");
const loginDiv = document.getElementById("login");
const variantSelectionDiv = document.getElementById("variant-selection");
const variantPrompt = document.getElementById("variant-prompt");
const waitingMessage = document.getElementById("waiting-message");

document.getElementById("join").onclick = () => {
  const nickname = document.getElementById("nickname").value || "Guest";
  const mode = document.getElementById("mode").value;

  socket.emit("join", { nickname, mode });
  loginDiv.style.display = "none";
};

// Handle variant selection
socket.on("variantSelection", ({ canChoose, player, showP2Option }) => {
  myPlayerNumber = player;
  variantSelectionDiv.style.display = "block";

  if (canChoose) {
    variantPrompt.textContent = `You are ${player}. Choose the game variant:`;
    waitingMessage.style.display = "none";

    // Show/hide the P2 choose button
    const p2ChooseBtn = document.querySelector(
      '.variant-btn[data-variant="p2-choose"]',
    );
    if (showP2Option) {
      p2ChooseBtn.style.display = "block";
    } else {
      p2ChooseBtn.style.display = "none";
    }

    // Enable all buttons
    document.querySelectorAll(".variant-btn").forEach((btn) => {
      btn.disabled = false;
      btn.onclick = () => {
        const variant = btn.dataset.variant;
        socket.emit("selectVariant", { variant });

        // Disable buttons after selection
        document
          .querySelectorAll(".variant-btn")
          .forEach((b) => (b.disabled = true));

        if (variant === "p2-choose") {
          variantPrompt.textContent = "You chose to let P2 decide...";
          waitingMessage.textContent = "Waiting for P2's choice...";
          waitingMessage.style.display = "block";
        } else {
          variantSelectionDiv.style.display = "none";
        }
      };
    });
  } else {
    variantPrompt.textContent = `You are ${player}.`;
    waitingMessage.textContent = "Waiting for P1's choice...";
    waitingMessage.style.display = "block";

    document.querySelectorAll(".variant-btn").forEach((btn) => {
      btn.disabled = true;
    });
  }
});

socket.on("boardUpdate", (state) => {
  gameState = state;

  if (state.phase === "placement" || state.phase === "movement") {
    variantSelectionDiv.style.display = "none";
  }

  if (
    state.captureMode ||
    state.currentPlayer !==
      (selectedPiece !== null ? state.board[selectedPiece] : null)
  ) {
    selectedPiece = null;
  }

  document.body.className = "";
  if (state.winner) {
    document.body.classList.add("game-over");
  } else if (state.phase === "movement") {
    document.body.classList.add("movement-phase");
  }

  statusText.className = "";
  let statusHTML = "";

  if (state.winner) {
    if (state.winner === "Draw") {
      statusHTML = `🤝 Game Drawn!`;
    } else {
      statusHTML = `🏆 ${state.winner} wins!`;
    }
  } else if (state.captureMode) {
    statusHTML = `${state.playerWhoFormedMill} formed a mill! Select opponent piece to capture.`;
    statusText.classList.add("capture-mode");
  } else {
    const currentPlayerFlying =
      (state.currentPlayer === "P1" && state.p1CanFly) ||
      (state.currentPlayer === "P2" && state.p2CanFly);
    const flyingIndicator = currentPlayerFlying ? " ✈️" : "";
    statusHTML = `Turn: ${state.currentPlayer}${flyingIndicator}`;

    if (state.phase === "placement") {
      const variant = state.gameVariant || 9;
      statusHTML += `<span class="phase-indicator">📍 Placement Phase (${variant} Men's Morris) - P1: ${state.piecesPlaced.P1}/${variant} | P2: ${state.piecesPlaced.P2}/${variant}</span>`;
      statusText.classList.add("placement-phase");
    } else if (state.phase === "movement") {
      const p1Status = state.p1CanFly
        ? `P1: ${state.p1Count} ✈️`
        : `P1: ${state.p1Count}`;
      const p2Status = state.p2CanFly
        ? `P2: ${state.p2Count} ✈️`
        : `P2: ${state.p2Count}`;
      let drawWarning = "";
      if (
        state.p1Count === 3 &&
        state.p2Count === 3 &&
        state.movesWithoutCapture >= 5
      ) {
        drawWarning = ` ⚠️ Draw in ${10 - state.movesWithoutCapture} moves`;
      }
      const variant = state.gameVariant || 9;
      statusHTML += `<span class="phase-indicator">🔄 Movement Phase (${variant} Men's Morris) - ${p1Status} | ${p2Status}${drawWarning}</span>`;
      statusText.classList.add("movement-phase");
    }
  }

  statusText.innerHTML = statusHTML;

  document.querySelectorAll(".point").forEach((point, id) => {
    const owner = state.board[id];

    point.classList.remove(
      "p1",
      "p2",
      "capture-target",
      "selected",
      "move-target",
    );

    if (owner === "P1") {
      point.classList.add("p1");
    } else if (owner === "P2") {
      point.classList.add("p2");
    }

    if (selectedPiece === id) {
      point.classList.add("selected");
    }

    if (state.captureMode && state.playerWhoFormedMill) {
      const opponent = state.playerWhoFormedMill === "P1" ? "P2" : "P1";
      if (owner === opponent) {
        if (
          state.capturablePositions &&
          state.capturablePositions.includes(id)
        ) {
          point.classList.add("capture-target");
        }
      }
    }
  });
});

socket.on("chat", (msg) => {
  messages.innerHTML += `<div>${msg}</div>`;
  messages.scrollTop = messages.scrollHeight;
});

document.getElementById("chatInput").onkeydown = (e) => {
  if (e.key === "Enter" && e.target.value.trim()) {
    socket.emit("chat", e.target.value);
    e.target.value = "";
  }
};
