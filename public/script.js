const socket = io();

const statusText = document.getElementById("status");
const points = document.querySelectorAll(".point");

// Connect status
socket.on("connect", () => {
  statusText.textContent = "Connected to server!";
});

// Receive full board state from server
socket.on("boardUpdate", (gameState) => {
  const {
    board,
    currentPlayer,
    phase,
    cowsPlaced,
    selectedPoint,
    mustCapture,
  } = gameState;

  points.forEach((point) => {
    point.classList.remove("p1", "p2", "selected");

    const id = Number(point.dataset.id);

    if (board[id] === "P1") point.classList.add("p1");
    if (board[id] === "P2") point.classList.add("p2");
    if (id === selectedPoint) point.classList.add("selected");
  });

  if (mustCapture) {
    const opponent = currentPlayer === "P1" ? "P2" : "P1";

    points.forEach((point) => {
      // Clear previous outline
      point.style.outline = "";

      const id = Number(point.dataset.id);
      if (board[id] === opponent) {
        point.style.outline = "3px solid red";
      }
    });
  } else {
    // If not mustCapture, ensure no outlines remain
    points.forEach((point) => {
      point.style.outline = "";
    });
  }

  const cowCount = board.filter((p) => p === currentPlayer).length;

  let extra = "";
  if (phase === "movement" && cowCount === 3) {
    extra = " ✈️ Flying allowed!";
  }

  //if (winner) {
  //statusText.textContent = `🏆 ${winner} wins the game!`;
  //return;
  // }

  statusText.textContent = mustCapture
    ? `⚠️ ${currentPlayer} must capture an opponent cow`
    : `Turn: ${currentPlayer} | Phase: ${phase}${extra}`;
});

// Click handler
//if (gameState?.winner) return;
points.forEach((point) => {
  point.addEventListener("click", () => {
    const pointId = Number(point.dataset.id);
    socket.emit("placeCow", pointId);
  });
});
