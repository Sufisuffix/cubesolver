const FACE_ORDER = ["U", "R", "F", "D", "L", "B"];
const FACE_NAMES = {
  U: "Up",
  R: "Right",
  F: "Front",
  D: "Down",
  L: "Left",
  B: "Back"
};
const COLOR_OPTIONS = [
  { key: "W", label: "White", hex: "#f7f7f2" },
  { key: "Y", label: "Yellow", hex: "#f1c93b" },
  { key: "R", label: "Red", hex: "#d94730" },
  { key: "O", label: "Orange", hex: "#e9862f" },
  { key: "B", label: "Blue", hex: "#2d66d7" },
  { key: "G", label: "Green", hex: "#2a9d63" }
];
const DEFAULT_CENTERS = {
  U: "W",
  R: "R",
  F: "G",
  D: "Y",
  L: "O",
  B: "B"
};
const COLOR_LOOKUP = Object.fromEntries(COLOR_OPTIONS.map((option) => [option.key, option]));
const FORWARD_DELAY_MS = 1400;
const ANIMATION_DURATION_MS = 900;

const paletteElement = document.querySelector("#palette");
const countsElement = document.querySelector("#counts");
const entryNetElement = document.querySelector("#entry-net");
const statusBannerElement = document.querySelector("#status-banner");
const solveButton = document.querySelector("#solve-button");
const resetButton = document.querySelector("#reset-button");
const demoButton = document.querySelector("#demo-button");
const summaryElement = document.querySelector("#solution-summary");
const viewerElement = document.querySelector("#viewer");
const solutionNetElement = document.querySelector("#solution-net");
const prevButton = document.querySelector("#prev-button");
const stepButton = document.querySelector("#step-button");
const playButton = document.querySelector("#play-button");
const restartButton = document.querySelector("#restart-button");
const moveTitleElement = document.querySelector("#move-title");
const moveDescriptionElement = document.querySelector("#move-description");
const stepListElement = document.querySelector("#step-list");

let selectedColor = "W";
let paintIsActive = false;
let entryFaces = createBlankFaces();
let solverReady = false;
let solveRequestId = 0;
let playbackTimer = null;
let animationTimer = null;
let playback = {
  faceColors: DEFAULT_CENTERS,
  moves: [],
  states: [],
  currentIndex: 0,
  autoplay: false,
  animation: null
};

renderPalette();
renderCounts();
renderEntryNet();
renderSolutionArea();

paletteElement.addEventListener("click", handlePaletteClick);
entryNetElement.addEventListener("mousedown", handleEntryMouseDown);
entryNetElement.addEventListener("mouseover", handleEntryMouseOver);
entryNetElement.addEventListener("click", handleEntryClick);
document.addEventListener("mouseup", () => {
  paintIsActive = false;
});
solveButton.addEventListener("click", handleSolve);
resetButton.addEventListener("click", () => {
  resetEntry();
  setStatus("Board reset. Paint the stickers to match your cube.", "info");
});
demoButton.addEventListener("click", loadDemoScramble);
prevButton.addEventListener("click", goBackOneStep);
stepButton.addEventListener("click", stepForwardManually);
playButton.addEventListener("click", toggleAutoplay);
restartButton.addEventListener("click", restartPlayback);
stepListElement.addEventListener("click", handleStepJump);

function createBlankFaces() {
  const faces = {};
  for (const face of FACE_ORDER) {
    faces[face] = Array(9).fill(null);
    faces[face][4] = DEFAULT_CENTERS[face];
  }
  return faces;
}

function renderPalette() {
  paletteElement.innerHTML = COLOR_OPTIONS.map((option) => {
    const isSelected = option.key === selectedColor ? " is-selected" : "";
    return `
      <button
        class="palette-swatch${isSelected}"
        type="button"
        data-color="${option.key}"
        aria-pressed="${option.key === selectedColor}"
      >
        <span class="palette-swatch__dot" style="background:${option.hex}"></span>
        <span>${option.label}</span>
      </button>
    `;
  }).join("");
}

function renderCounts() {
  const counts = getColorCounts(entryFaces);
  countsElement.innerHTML = COLOR_OPTIONS.map((option) => {
    const count = counts[option.key] || 0;
    const stateClass = count === 9 ? "" : " is-bad";
    return `
      <div class="count-chip${stateClass}">
        <span class="count-chip__dot" style="background:${option.hex}"></span>
        <span>${option.label}: ${count}/9</span>
      </div>
    `;
  }).join("");
}

function renderEntryNet() {
  entryNetElement.innerHTML = FACE_ORDER.map((face) => renderFaceCard(face, entryFaces[face], {
    mode: "entry",
    title: `${FACE_NAMES[face]} face`,
    hint: "tap or drag to paint"
  })).join("");
}

function renderSolutionArea() {
  const hasSolution = playback.states.length > 0;
  viewerElement.classList.toggle("viewer--empty", !hasSolution);

  if (!hasSolution) {
    solutionNetElement.innerHTML = FACE_ORDER.map((face) => renderFaceCard(face, entryFaces[face], {
      mode: "viewer",
      title: `${FACE_NAMES[face]} face`,
      hint: "preview"
    })).join("");
    summaryElement.innerHTML = `
      <p class="summary-card__title">Waiting for a cube</p>
      <p class="summary-card__text">
        Once you submit a valid sticker layout, the solution and playback controls will appear here.
      </p>
    `;
    moveTitleElement.textContent = "No move yet";
    moveDescriptionElement.textContent = "Submit a cube to see each move explained here.";
    stepListElement.innerHTML = "";
    updatePlaybackButtons();
    return;
  }

  const currentState = playback.states[playback.currentIndex];
  const activeMove = playback.currentIndex > 0 ? playback.moves[playback.currentIndex - 1] : null;
  const changedIndices = playback.animation ? getChangedIndices(playback.animation.from, playback.animation.to) : [];

  summaryElement.innerHTML = `
    <p class="summary-card__title">${playback.moves.length === 0 ? "Already solved" : `${playback.moves.length} move${playback.moves.length === 1 ? "" : "s"} to solve`}</p>
    <p class="summary-card__text">
      ${playback.moves.length === 0
        ? "Your cube is already solved. You can still load a demo scramble or edit the stickers."
        : playback.autoplay
          ? "Autoplay is running. Pause it any time, or use Step by step to control the pace yourself."
          : "Use Step by step to advance one move at a time, or Play animation for the full guided run."}
    </p>
  `;

  solutionNetElement.innerHTML = FACE_ORDER.map((face) => {
    const stickers = faceStringToColors(currentState, playback.faceColors, face);
    const activeFace = activeMove ? activeMove[0] === face : false;
    return renderFaceCard(face, stickers, {
      mode: "viewer",
      title: `${FACE_NAMES[face]} face`,
      hint: activeFace ? "current turn" : "state preview",
      activeFace,
      changedIndices: changedIndices.filter((index) => indexToFace(index) === face).map((index) => indexToFacePosition(index))
    });
  }).join("");

  const moveSummary = getMoveCopy(activeMove, playback.currentIndex, playback.moves.length);
  moveTitleElement.textContent = moveSummary.title;
  moveDescriptionElement.textContent = moveSummary.description;

  stepListElement.innerHTML = [
    renderStepChip(0, "Start", playback.currentIndex === 0),
    ...playback.moves.map((move, index) => renderStepChip(index + 1, move, playback.currentIndex === index + 1))
  ].join("");

  updatePlaybackButtons();
}

function renderFaceCard(face, stickers, options) {
  const mode = options.mode;
  const isActive = options.activeFace ? " is-active" : "";
  const changedSet = new Set(options.changedIndices || []);
  const hint = options.hint || "";
  return `
    <section class="face-card${isActive}" data-face="${face}">
      <div class="face-card__label">
        <span>${options.title}</span>
        <span class="face-card__hint">${hint}</span>
      </div>
      <div class="face-grid">
        ${stickers.map((color, index) => {
          const emptyClass = color ? "" : " is-empty";
          const centerClass = index === 4 ? " is-center" : "";
          const changedClass = changedSet.has(index) ? " is-changing" : "";
          const style = color ? `style="background:${COLOR_LOOKUP[color].hex}"` : "";
          const commonAttrs = `
            data-face="${face}"
            data-index="${index}"
            data-mode="${mode}"
            aria-label="${FACE_NAMES[face]} sticker ${index + 1}"
          `;
          if (mode === "entry") {
            return `
              <button class="sticker${emptyClass}${centerClass}" ${style} type="button" ${commonAttrs}></button>
            `;
          }
          return `
            <div class="sticker${emptyClass}${centerClass}${changedClass}" ${style} ${commonAttrs}></div>
          `;
        }).join("")}
      </div>
      ${options.activeFace ? renderArrow(activeMoveVariant(playback.currentIndex > 0 ? playback.moves[playback.currentIndex - 1] : null)) : ""}
    </section>
  `;
}

function renderArrow(variant) {
  const classes = [
    "face-arrow",
    variant === "prime" ? "is-prime" : "",
    variant === "double" ? "is-double" : ""
  ].filter(Boolean).join(" ");
  return `
    <div class="${classes}" aria-hidden="true">
      <svg viewBox="0 0 140 140">
        <path d="M34 54c8-17 24-28 42-28 29 0 49 21 49 48" />
        <polygon points="125,72 124,92 108,80"></polygon>
      </svg>
    </div>
  `;
}

function renderStepChip(index, move, isCurrent) {
  return `
    <button class="step-chip${isCurrent ? " is-current" : ""}" type="button" data-step="${index}">
      <span class="step-chip__index">${index === 0 ? "Start" : `Step ${index}`}</span>
      <span class="step-chip__move">${move}</span>
    </button>
  `;
}

function handlePaletteClick(event) {
  const button = event.target.closest("[data-color]");
  if (!button) {
    return;
  }
  selectedColor = button.dataset.color;
  renderPalette();
}

function handleEntryMouseDown(event) {
  const sticker = event.target.closest('.sticker[data-mode="entry"]');
  if (!sticker) {
    return;
  }
  paintIsActive = true;
  paintSticker(sticker);
}

function handleEntryMouseOver(event) {
  if (!paintIsActive) {
    return;
  }
  const sticker = event.target.closest('.sticker[data-mode="entry"]');
  if (!sticker) {
    return;
  }
  paintSticker(sticker);
}

function handleEntryClick(event) {
  const sticker = event.target.closest('.sticker[data-mode="entry"]');
  if (!sticker) {
    return;
  }
  paintSticker(sticker);
}

function paintSticker(sticker) {
  const face = sticker.dataset.face;
  const index = Number(sticker.dataset.index);
  if (!face || Number.isNaN(index)) {
    return;
  }
  entryFaces[face][index] = selectedColor;
  invalidatePlayback();
  renderEntryNet();
  renderCounts();
}

function invalidatePlayback() {
  stopAutoplay();
  playback = {
    faceColors: DEFAULT_CENTERS,
    moves: [],
    states: [],
    currentIndex: 0,
    autoplay: false,
    animation: null
  };
  renderSolutionArea();
}

function getColorCounts(faces) {
  const counts = { W: 0, Y: 0, R: 0, O: 0, B: 0, G: 0 };
  for (const face of FACE_ORDER) {
    for (const sticker of faces[face]) {
      if (sticker) {
        counts[sticker] += 1;
      }
    }
  }
  return counts;
}

function validateEntry() {
  for (const face of FACE_ORDER) {
    if (entryFaces[face].some((sticker) => !sticker)) {
      return { ok: false, message: "Every sticker needs a color before the cube can be solved." };
    }
  }

  const counts = getColorCounts(entryFaces);
  const invalidCount = COLOR_OPTIONS.find((option) => counts[option.key] !== 9);
  if (invalidCount) {
    return {
      ok: false,
      message: `Each color must appear exactly 9 times. ${invalidCount.label} is currently ${counts[invalidCount.key]}/9.`
    };
  }

  const centerColors = FACE_ORDER.map((face) => entryFaces[face][4]);
  if (new Set(centerColors).size !== 6) {
    return { ok: false, message: "The six center stickers must all be different colors." };
  }

  const centerToFace = {};
  FACE_ORDER.forEach((face) => {
    centerToFace[entryFaces[face][4]] = face;
  });

  const cubeString = FACE_ORDER.map((face) => {
    return entryFaces[face].map((color) => centerToFace[color]).join("");
  }).join("");

  const faceColors = FACE_ORDER.reduce((result, face) => {
    result[face] = entryFaces[face][4];
    return result;
  }, {});

  return {
    ok: true,
    cubeString,
    faceColors
  };
}

async function handleSolve() {
  const validation = validateEntry();
  if (!validation.ok) {
    setStatus(validation.message, "error");
    return;
  }

  const currentRequest = ++solveRequestId;
  stopAutoplay();
  setSolveButtonBusy(true, "Solving...");
  setStatus("Checking the cube and warming up the solver. This can take a few seconds the first time.", "info");

  try {
    await nextFrame();
    await ensureSolverReady();
    if (currentRequest !== solveRequestId) {
      return;
    }

    const cube = Cube.fromString(validation.cubeString);
    const solutionString = cube.isSolved() ? "" : (cube.solve() || "");
    const moves = solutionString.trim() ? solutionString.trim().split(/\s+/) : [];
    if (moves.length > 0) {
      const verificationCube = Cube.fromString(validation.cubeString);
      verificationCube.move(solutionString);
      if (!verificationCube.isSolved()) {
        throw new Error("Verification failed");
      }
    }
    const states = buildSolutionStates(validation.cubeString, moves);

    playback = {
      faceColors: validation.faceColors,
      moves,
      states,
      currentIndex: 0,
      autoplay: false,
      animation: null
    };

    renderSolutionArea();
    setStatus(
      moves.length === 0
        ? "This cube is already solved."
        : `Solution ready. ${moves.length} move${moves.length === 1 ? "" : "s"} found.`,
      "success"
    );
  } catch (error) {
    invalidatePlayback();
    setStatus("That sticker layout does not describe a solvable 3x3 cube. Double-check the colors and face orientation.", "error");
  } finally {
    setSolveButtonBusy(false, "Submit cube");
  }
}

async function ensureSolverReady() {
  if (solverReady) {
    return;
  }
  await nextFrame();
  Cube.initSolver();
  solverReady = true;
}

function buildSolutionStates(startState, moves) {
  const states = [startState];
  const workingCube = Cube.fromString(startState);
  for (const move of moves) {
    workingCube.move(move);
    states.push(workingCube.asString());
  }
  return states;
}

function setSolveButtonBusy(isBusy, label) {
  solveButton.disabled = isBusy;
  solveButton.textContent = label;
}

function setStatus(message, state) {
  statusBannerElement.textContent = message;
  statusBannerElement.className = `status-banner status-banner--${state}`;
}

function stopAutoplay() {
  playback.autoplay = false;
  if (playbackTimer) {
    clearTimeout(playbackTimer);
    playbackTimer = null;
  }
  if (animationTimer) {
    clearTimeout(animationTimer);
    animationTimer = null;
  }
}

function updatePlaybackButtons() {
  const hasSolution = playback.states.length > 0;
  const atStart = playback.currentIndex === 0;
  const atEnd = playback.currentIndex >= Math.max(playback.states.length - 1, 0);
  prevButton.disabled = !hasSolution || atStart;
  stepButton.disabled = !hasSolution || atEnd;
  playButton.disabled = !hasSolution || playback.moves.length === 0 || atEnd;
  restartButton.disabled = !hasSolution || atStart;
  playButton.textContent = playback.autoplay ? "Pause animation" : "Play animation";
}

function goBackOneStep() {
  stopAutoplay();
  if (playback.currentIndex === 0) {
    return;
  }
  playback.currentIndex -= 1;
  playback.animation = null;
  renderSolutionArea();
}

function stepForwardManually() {
  stopAutoplay();
  advancePlayback();
}

function toggleAutoplay() {
  if (!playback.states.length || playback.moves.length === 0) {
    return;
  }
  if (playback.autoplay) {
    stopAutoplay();
    renderSolutionArea();
    return;
  }
  playback.autoplay = true;
  renderSolutionArea();
  scheduleAutoplay();
}

function scheduleAutoplay() {
  if (!playback.autoplay) {
    return;
  }
  if (playback.currentIndex >= playback.moves.length) {
    playback.autoplay = false;
    renderSolutionArea();
    return;
  }
  advancePlayback();
  playbackTimer = setTimeout(scheduleAutoplay, FORWARD_DELAY_MS);
}

function advancePlayback() {
  if (!playback.states.length || playback.currentIndex >= playback.moves.length) {
    return;
  }

  const fromState = playback.states[playback.currentIndex];
  const toIndex = playback.currentIndex + 1;
  const toState = playback.states[toIndex];
  playback.currentIndex = toIndex;
  playback.animation = {
    from: fromState,
    to: toState
  };
  renderSolutionArea();

  if (animationTimer) {
    clearTimeout(animationTimer);
  }
  animationTimer = setTimeout(() => {
    playback.animation = null;
    renderSolutionArea();
  }, ANIMATION_DURATION_MS);
}

function restartPlayback() {
  stopAutoplay();
  playback.currentIndex = 0;
  playback.animation = null;
  renderSolutionArea();
}

function handleStepJump(event) {
  const button = event.target.closest("[data-step]");
  if (!button) {
    return;
  }
  const nextStep = Number(button.dataset.step);
  if (Number.isNaN(nextStep)) {
    return;
  }
  stopAutoplay();
  playback.currentIndex = Math.max(0, Math.min(nextStep, playback.states.length - 1));
  playback.animation = null;
  renderSolutionArea();
}

function faceStringToColors(state, faceColors, face) {
  const faceStart = FACE_ORDER.indexOf(face) * 9;
  return state
    .slice(faceStart, faceStart + 9)
    .split("")
    .map((faceLetter) => faceColors[faceLetter]);
}

function getMoveCopy(move, currentIndex, totalMoves) {
  if (!move) {
    return currentIndex === 0
      ? {
          title: "Start position",
          description: totalMoves === 0
            ? "No moves are needed."
            : "This is the cube state before the first solving move."
        }
      : {
          title: "Solved",
          description: "The cube is solved. You can restart the walkthrough or step backward to review a move."
        };
  }

  const faceName = FACE_NAMES[move[0]];
  const variant = activeMoveVariant(move);
  const action = variant === "prime"
    ? "Turn this face counterclockwise when looking straight at it."
    : variant === "double"
      ? "Turn this face a half turn."
      : "Turn this face clockwise when looking straight at it.";

  return {
    title: `Step ${currentIndex}: ${move}`,
    description: `${faceName} face: ${action}`
  };
}

function activeMoveVariant(move) {
  if (!move) {
    return "clockwise";
  }
  if (move.includes("'")) {
    return "prime";
  }
  if (move.includes("2")) {
    return "double";
  }
  return "clockwise";
}

function getChangedIndices(fromState, toState) {
  const changed = [];
  for (let index = 0; index < fromState.length; index += 1) {
    if (fromState[index] !== toState[index]) {
      changed.push(index);
    }
  }
  return changed;
}

function indexToFace(index) {
  return FACE_ORDER[Math.floor(index / 9)];
}

function indexToFacePosition(index) {
  return index % 9;
}

function resetEntry() {
  entryFaces = createBlankFaces();
  renderEntryNet();
  renderCounts();
  invalidatePlayback();
}

function loadDemoScramble() {
  const demoCube = Cube.random();
  const demoState = demoCube.asString();
  entryFaces = stateStringToEntryFaces(demoState);
  renderEntryNet();
  renderCounts();
  invalidatePlayback();
  setStatus("Demo scramble loaded. Submit it to see the guided solution.", "info");
}

function stateStringToEntryFaces(state) {
  const faces = {};
  FACE_ORDER.forEach((face, faceIndex) => {
    const start = faceIndex * 9;
    faces[face] = state
      .slice(start, start + 9)
      .split("")
      .map((faceLetter) => DEFAULT_CENTERS[faceLetter]);
  });
  return faces;
}

function nextFrame() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });
}
