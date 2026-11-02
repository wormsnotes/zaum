"use strict";

(() => {
  const dialog = document.querySelector("#game-dialog");
  const canvas = document.querySelector("#board");
  const context = canvas.getContext("2d");
  const scoreOutput = document.querySelector("#score");
  const bestOutput = document.querySelector("#best-score");
  const status = document.querySelector("#game-status");
  const overlay = document.querySelector("#board-overlay");
  const overlayTitle = document.querySelector("#overlay-title");
  const overlayMessage = document.querySelector("#overlay-message");
  const overlayAction = document.querySelector("#overlay-action");
  const pauseButton = document.querySelector("#pause-game");
  const openButton = document.querySelector("#open-game");
  const SIZE = 24;
  const CELL = canvas.width / SIZE;
  const STORAGE_KEY = "zaum-snake-best";
  const directions = {
    up: { x: 0, y: -1 }, down: { x: 0, y: 1 },
    left: { x: -1, y: 0 }, right: { x: 1, y: 0 }
  };
  const keys = {
    ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
    w: "up", s: "down", a: "left", d: "right",
    ц: "up", ы: "down", ф: "left", в: "right"
  };
  let snake = [];
  let direction = directions.right;
  let nextDirection = direction;
  let food = null;
  let score = 0;
  let best = 0;
  let state = "closed";
  let frame = null;
  let lastStep = 0;
  let touchStart = null;

  document.querySelector("#year").textContent = new Date().getFullYear();
  try {
    const saved = Number(localStorage.getItem(STORAGE_KEY));
    if (Number.isInteger(saved) && saved > 0 && saved <= SIZE * SIZE - 3) best = saved;
  } catch (_) { /* Игра работает и без доступа к хранилищу. */ }
  bestOutput.textContent = best;

  function placeFood() {
    const free = [];
    const occupied = new Set(snake.map(part => part.y * SIZE + part.x));
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        if (!occupied.has(y * SIZE + x)) free.push({ x, y });
      }
    }
    return free.length ? free[Math.floor(Math.random() * free.length)] : null;
  }

  function updateScore() {
    scoreOutput.textContent = score;
    if (score > best) {
      best = score;
      bestOutput.textContent = best;
      try { localStorage.setItem(STORAGE_KEY, String(best)); } catch (_) { /* Необязательное сохранение. */ }
    }
  }

  function draw() {
    context.fillStyle = "#ddf672";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = "#2724240d";
    context.lineWidth = 1;
    context.beginPath();
    for (let i = 1; i < SIZE; i++) {
      context.moveTo(i * CELL, 0); context.lineTo(i * CELL, canvas.height);
      context.moveTo(0, i * CELL); context.lineTo(canvas.width, i * CELL);
    }
    context.stroke();
    if (food) {
      const x = (food.x + .5) * CELL;
      const y = (food.y + .55) * CELL;
      context.fillStyle = "#7a58bd";
      context.beginPath();
      context.ellipse(x, y, CELL * .36, CELL * .34, 0, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = "#272424";
      context.lineWidth = 2;
      context.beginPath(); context.moveTo(x, y - 6); context.lineTo(x + 3, y - 11); context.stroke();
    }
    snake.forEach((part, i) => {
      context.fillStyle = i === 0 ? "#272424" : "#3e4930";
      context.fillRect(part.x * CELL + 1, part.y * CELL + 1, CELL - 2, CELL - 2);
    });
    const head = snake[0];
    if (!head) return;
    const centerX = (head.x + .5) * CELL + direction.x * 5;
    const centerY = (head.y + .5) * CELL + direction.y * 5;
    context.fillStyle = "#f3f0e7";
    for (const side of [-1, 1]) {
      context.beginPath();
      context.arc(centerX + direction.y * side * 5, centerY + direction.x * side * 5, 2.5, 0, Math.PI * 2);
      context.fill();
    }
  }

  function showOverlay(title, message, action) {
    overlayTitle.textContent = title;
    overlayMessage.textContent = message;
    overlayAction.replaceChildren(document.createTextNode(action + " ↗"));
    overlay.hidden = false;
    overlayAction.focus({ preventScroll: true });
  }

  function stopFrame() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
  }

  function finish(won) {
    state = won ? "won" : "over";
    stopFrame();
    pauseButton.disabled = true;
    status.textContent = won ? "Вот это аппетит!" : "Бывает. Ещё по яблочку?";
    showOverlay(won ? "Поле съедено!" : "Встретились.",
      won ? `Все ${score} яблока твои. Змейке пора на отдых.` : `Яблок собрано: ${score}. Самое время попробовать ещё раз.`, "Ещё раз");
  }

  function step() {
    direction = nextDirection;
    const head = { x: snake[0].x + direction.x, y: snake[0].y + direction.y };
    const eating = food && head.x === food.x && head.y === food.y;
    // При обычном ходе хвост освобождает свою клетку одновременно с движением головы.
    const body = eating ? snake : snake.slice(0, -1);
    if (head.x < 0 || head.x >= SIZE || head.y < 0 || head.y >= SIZE ||
        body.some(part => part.x === head.x && part.y === head.y)) {
      finish(false);
      return;
    }
    snake.unshift(head);
    if (eating) {
      score++;
      updateScore();
      food = placeFood();
    } else snake.pop();
    draw();
    if (!food) finish(true);
  }

  function loop(timestamp) {
    frame = null;
    if (state !== "running") return;
    if (!lastStep) lastStep = timestamp;
    if (timestamp - lastStep >= Math.max(75, 155 - score * 3)) {
      lastStep = timestamp;
      step();
    }
    if (state === "running") frame = requestAnimationFrame(loop);
  }

  function start() {
    stopFrame();
    snake = [{ x: 8, y: 12 }, { x: 7, y: 12 }, { x: 6, y: 12 }];
    direction = directions.right;
    nextDirection = direction;
    score = 0;
    state = "running";
    lastStep = 0;
    touchStart = null;
    food = placeFood();
    overlay.hidden = true;
    pauseButton.disabled = false;
    pauseButton.textContent = "Пауза";
    status.textContent = "Приятного аппетита!";
    updateScore();
    draw();
    canvas.focus({ preventScroll: true });
    frame = requestAnimationFrame(loop);
  }

  function togglePause() {
    if (state === "running") {
      state = "paused";
      stopFrame();
      pauseButton.textContent = "Продолжить";
      status.textContent = "Маленький перерыв";
      showOverlay("Пауза", "Яблоко никуда не убежит.", "Продолжить");
    } else if (state === "paused") {
      state = "running";
      overlay.hidden = true;
      pauseButton.textContent = "Пауза";
      status.textContent = "Приятного аппетита!";
      lastStep = 0;
      canvas.focus({ preventScroll: true });
      frame = requestAnimationFrame(loop);
    }
  }

  function turn(name) {
    if (state !== "running") return;
    const candidate = directions[name];
    if (!candidate) return;
    // Только один поворот за шаг: быстрое нажатие двух клавиш не разворачивает змейку в себя.
    if (nextDirection !== direction) return;
    if (candidate.x === -direction.x && candidate.y === -direction.y) return;
    nextDirection = candidate;
  }

  openButton.addEventListener("click", () => { dialog.showModal(); start(); });
  document.querySelector("#close-game").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    state = "closed";
    stopFrame();
    touchStart = null;
    openButton.focus({ preventScroll: true });
  });
  pauseButton.addEventListener("click", togglePause);
  document.querySelector("#restart-game").addEventListener("click", start);
  overlayAction.addEventListener("click", () => state === "paused" ? togglePause() : start());
  document.querySelectorAll("[data-direction]").forEach(button => {
    button.addEventListener("click", () => turn(button.dataset.direction));
  });
  document.addEventListener("keydown", event => {
    if (!dialog.open || event.ctrlKey || event.metaKey || event.altKey) return;
    const name = keys[event.key] || keys[event.key.toLowerCase()];
    if (name) {
      event.preventDefault();
      turn(name);
    } else if (event.code === "Space" && event.target === canvas) {
      event.preventDefault();
      if (!event.repeat) togglePause();
    } else if (event.code === "Space" && state === "paused" && event.target === overlayAction) {
      event.preventDefault();
      if (!event.repeat) togglePause();
    }
  });
  canvas.addEventListener("pointerdown", event => {
    if (event.pointerType === "mouse") return;
    touchStart = { x: event.clientX, y: event.clientY, id: event.pointerId };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", event => {
    if (!touchStart || touchStart.id !== event.pointerId) return;
    const dx = event.clientX - touchStart.x;
    const dy = event.clientY - touchStart.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 15) return;
    turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"));
    touchStart = { x: event.clientX, y: event.clientY, id: event.pointerId };
  });
  const endTouch = () => { touchStart = null; };
  canvas.addEventListener("pointerup", endTouch);
  canvas.addEventListener("pointercancel", endTouch);
  canvas.addEventListener("lostpointercapture", endTouch);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state === "running") togglePause();
  });
  window.addEventListener("blur", () => { if (state === "running") togglePause(); });
})();
