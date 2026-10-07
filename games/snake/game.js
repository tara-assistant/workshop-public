(() => {
  "use strict";

  const canvas = document.querySelector("#board");
  const context = canvas.getContext("2d");
  const scoreElement = document.querySelector("#score");
  const bestElement = document.querySelector("#best");
  const statusElement = document.querySelector("#status");
  const statusMessage = document.querySelector("#status-message");
  const startButton = document.querySelector("#start");
  const pauseButton = document.querySelector("#pause");
  const restartButton = document.querySelector("#restart");
  const playAgainButton = document.querySelector("#play-again");
  const fullscreenButton = document.querySelector("#fullscreen");
  const clearBestButton = document.querySelector("#clear-best");
  const noticeElement = document.querySelector("#notice");

  const gridSize = 24;
  const cellSize = canvas.width / gridSize;
  const palette = {
    board: "#160d26",
    boardCell: "rgba(255, 255, 255, .018)",
    grid: "rgba(255, 209, 102, .11)",
    snake: "#38c9a4",
    snakeAlt: "#5edebd",
    head: "#e7ffe9",
    food: "#ff5d8f",
    foodHighlight: "#ffd166",
  };
  const directions = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };

  let snake;
  let food;
  let direction;
  let nextDirection;
  let score;
  let best = Number.parseInt(localStorage.getItem("snake-best") || "0", 10);
  let timer = null;
  let state = "ready";
  let touchStart = null;
  let noticeTimer = null;

  bestElement.textContent = best;

  function reset() {
    snake = [
      { x: 12, y: 12 },
      { x: 11, y: 12 },
      { x: 10, y: 12 },
    ];
    direction = directions.right;
    nextDirection = direction;
    score = 0;
    food = placeFood();
    state = "ready";
    stopTimer();
    updateScore();
    draw();
    setStatus("Press Start to play");
  }

  function start() {
    if (state === "playing") return;
    if (state === "game-over") reset();
    state = "playing";
    setStatus("");
    stopTimer();
    timer = window.setInterval(tick, Math.max(65, 155 - score * 3));
    vibrate(8);
  }

  function pause(message = "Paused") {
    if (state !== "playing") return;
    state = "paused";
    stopTimer();
    setStatus(message);
  }

  function restart() {
    reset();
    start();
  }

  function tick() {
    direction = nextDirection;
    const head = snake[0];
    const next = {
      x: head.x + direction.x,
      y: head.y + direction.y,
    };

    if (next.x < 0 || next.x >= gridSize || next.y < 0 || next.y >= gridSize || hitsSnake(next)) {
      finish();
      return;
    }

    snake.unshift(next);
    if (next.x === food.x && next.y === food.y) {
      score += 1;
      if (score > best) {
        best = score;
        localStorage.setItem("snake-best", String(best));
      }
      food = placeFood();
      updateScore();
      restartTimerAtNewSpeed();
      vibrate(12);
    } else {
      snake.pop();
    }
    draw();
  }

  function finish() {
    state = "game-over";
    stopTimer();
    setStatus(`Game over. Score: ${score}`, true);
    vibrate([70, 45, 70]);
  }

  function setDirection(name) {
    const candidate = directions[name];
    if (!candidate || (candidate.x + direction.x === 0 && candidate.y + direction.y === 0)) return;
    nextDirection = candidate;
    if (state === "ready" || state === "paused") start();
    vibrate(6);
  }

  function placeFood() {
    const available = [];
    for (let y = 0; y < gridSize; y += 1) {
      for (let x = 0; x < gridSize; x += 1) {
        if (!snake.some((part) => part.x === x && part.y === y)) available.push({ x, y });
      }
    }
    return available[Math.floor(Math.random() * available.length)];
  }

  function hitsSnake(position) {
    return snake.some((part) => part.x === position.x && part.y === position.y);
  }

  function draw() {
    context.fillStyle = palette.board;
    context.fillRect(0, 0, canvas.width, canvas.height);

    for (let y = 0; y < gridSize; y += 1) {
      for (let x = 0; x < gridSize; x += 1) {
        if ((x + y) % 2 === 0) {
          context.fillStyle = palette.boardCell;
          context.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
        }
      }
    }

    context.strokeStyle = palette.grid;
    context.lineWidth = 1;
    for (let index = 1; index < gridSize; index += 1) {
      const offset = index * cellSize;
      context.beginPath();
      context.moveTo(offset, 0);
      context.lineTo(offset, canvas.height);
      context.moveTo(0, offset);
      context.lineTo(canvas.width, offset);
      context.stroke();
    }

    drawFood(food);
    for (let index = snake.length - 1; index >= 0; index -= 1) {
      drawSnakePart(snake[index], index);
    }
  }

  function drawFood(cell) {
    const centerX = cell.x * cellSize + cellSize / 2;
    const centerY = cell.y * cellSize + cellSize / 2;
    context.save();
    context.shadowColor = palette.food;
    context.shadowBlur = 22;
    context.fillStyle = palette.food;
    context.beginPath();
    context.arc(centerX, centerY, cellSize * 0.27, 0, Math.PI * 2);
    context.fill();
    context.restore();

    context.fillStyle = palette.foodHighlight;
    context.beginPath();
    context.arc(centerX - cellSize * 0.08, centerY - cellSize * 0.09, cellSize * 0.07, 0, Math.PI * 2);
    context.fill();
  }

  function drawSnakePart(cell, index) {
    const padding = index === 0 ? 2.5 : 3;
    const x = cell.x * cellSize + padding;
    const y = cell.y * cellSize + padding;
    const size = cellSize - padding * 2;
    context.save();
    context.shadowColor = index === 0 ? palette.head : palette.snake;
    context.shadowBlur = index === 0 ? 18 : 8;
    context.fillStyle = index === 0 ? palette.head : index % 2 === 0 ? palette.snake : palette.snakeAlt;
    roundedRect(x, y, size, size, index === 0 ? 7 : 5);
    context.fill();
    context.restore();

    if (index === 0) {
      drawEyes(cell);
    } else {
      context.fillStyle = "rgba(255, 255, 255, .22)";
      roundedRect(x + 3, y + 3, Math.max(2, size * 0.32), 2, 1);
      context.fill();
    }
  }

  function drawEyes(cell) {
    const centerX = cell.x * cellSize + cellSize / 2;
    const centerY = cell.y * cellSize + cellSize / 2;
    const front = direction;
    const side = { x: -direction.y, y: direction.x };
    const eyes = [
      { x: centerX + front.x * 5 + side.x * 4, y: centerY + front.y * 5 + side.y * 4 },
      { x: centerX + front.x * 5 - side.x * 4, y: centerY + front.y * 5 - side.y * 4 },
    ];
    context.fillStyle = "#29101b";
    eyes.forEach((eye) => {
      context.beginPath();
      context.arc(eye.x, eye.y, 2.15, 0, Math.PI * 2);
      context.fill();
    });
  }

  function roundedRect(x, y, width, height, radius) {
    context.beginPath();
    if (typeof context.roundRect === "function") {
      context.roundRect(x, y, width, height, radius);
      return;
    }
    context.moveTo(x + radius, y);
    context.arcTo(x + width, y, x + width, y + height, radius);
    context.arcTo(x + width, y + height, x, y + height, radius);
    context.arcTo(x, y + height, x, y, radius);
    context.arcTo(x, y, x + width, y, radius);
    context.closePath();
  }

  function updateScore() {
    scoreElement.textContent = score;
    bestElement.textContent = best;
  }

  function setStatus(message, showReplay = false) {
    statusMessage.textContent = message;
    playAgainButton.hidden = !showReplay;
    statusElement.classList.toggle("playing", state === "playing");
    statusElement.classList.toggle("game-over", state === "game-over");
  }

  function showNotice(message) {
    window.clearTimeout(noticeTimer);
    noticeElement.textContent = message;
    noticeElement.hidden = false;
    noticeTimer = window.setTimeout(() => {
      noticeElement.hidden = true;
    }, 2800);
  }

  function stopTimer() {
    if (timer !== null) window.clearInterval(timer);
    timer = null;
  }

  function restartTimerAtNewSpeed() {
    if (state !== "playing") return;
    stopTimer();
    timer = window.setInterval(tick, Math.max(65, 155 - score * 3));
  }

  function vibrate(pattern) {
    if (typeof navigator.vibrate === "function") navigator.vibrate(pattern);
  }

  function isFullscreen() {
    return Boolean(document.fullscreenElement || document.webkitFullscreenElement);
  }

  function updateFullscreenButton() {
    const active = isFullscreen();
    fullscreenButton.textContent = active ? "Exit fullscreen" : "Fullscreen";
    fullscreenButton.setAttribute("aria-pressed", String(active));
  }

  async function toggleFullscreen() {
    const root = document.documentElement;
    try {
      if (isFullscreen()) {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        return;
      }
      if (root.requestFullscreen) await root.requestFullscreen({ navigationUI: "hide" });
      else if (root.webkitRequestFullscreen) root.webkitRequestFullscreen();
      else showNotice("Fullscreen is unavailable here. Add Snake to your Home Screen for app mode.");
    } catch {
      showNotice("Fullscreen was blocked by the browser. Try pressing the button again.");
    }
  }

  document.addEventListener("fullscreenchange", updateFullscreenButton);
  document.addEventListener("webkitfullscreenchange", updateFullscreenButton);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state === "playing") pause("Paused while away");
  });

  document.addEventListener("keydown", (event) => {
    const keyMap = {
      ArrowUp: "up", w: "up", W: "up",
      ArrowDown: "down", s: "down", S: "down",
      ArrowLeft: "left", a: "left", A: "left",
      ArrowRight: "right", d: "right", D: "right",
    };
    if (keyMap[event.key]) {
      event.preventDefault();
      setDirection(keyMap[event.key]);
    }
    if (event.code === "Space") {
      event.preventDefault();
      state === "playing" ? pause() : start();
    }
  });

  canvas.addEventListener("touchstart", (event) => {
    const touch = event.changedTouches[0];
    touchStart = { x: touch.clientX, y: touch.clientY };
  }, { passive: true });

  canvas.addEventListener("touchend", (event) => {
    if (!touchStart) return;
    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - touchStart.x;
    const deltaY = touch.clientY - touchStart.y;
    touchStart = null;
    if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 24) return;
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      setDirection(deltaX > 0 ? "right" : "left");
    } else {
      setDirection(deltaY > 0 ? "down" : "up");
    }
  }, { passive: true });

  document.querySelectorAll("[data-direction]").forEach((button) => {
    button.addEventListener("click", () => setDirection(button.dataset.direction));
  });
  startButton.addEventListener("click", start);
  pauseButton.addEventListener("click", pause);
  restartButton.addEventListener("click", restart);
  playAgainButton.addEventListener("click", restart);
  fullscreenButton.addEventListener("click", toggleFullscreen);
  clearBestButton.addEventListener("click", () => {
    best = 0;
    localStorage.removeItem("snake-best");
    updateScore();
    showNotice("Best score cleared.");
    vibrate(18);
  });

  updateFullscreenButton();
  reset();
})();
