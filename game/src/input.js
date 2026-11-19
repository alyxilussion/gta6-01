// Keyboard and mouse state. The game reads `keys` and `mouse` each step;
// UI screens read the one-shot `pressed` set, cleared at each frame's end.
export const keys = {};
export const pressed = new Set();
export const mouse = { x: 0, y: 0, down: false, clicked: false };

// One-shot presses are snapshotted at the start of each frame: the snapshot
// is what the frame reads, and fresh keydowns during the frame land in the
// next frame's snapshot. Clearing the live set at the frame's end instead
// would swallow any press that arrived after the frame's input reads.
let pressedSnapshot = new Set();

export function beginFrameInput() {
  pressedSnapshot = new Set(pressed);
  pressed.clear();
}

export function endFrameInput() {
  mouse.clicked = false;
}

export function wasPressed(name) {
  return pressedSnapshot.has(name);
}

// Like wasPressed, but consumes the press: with a fixed-step accumulator
// running several steps per frame, an unconsumed 'enter' would exit a car
// and re-enter it in the same frame.
export function consumePressed(name) {
  if (!pressedSnapshot.has(name)) return false;
  pressedSnapshot.delete(name);
  return true;
}

const KEY_NAMES = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'sprint', ShiftRight: 'sprint',
  Space: 'handbrake',
  KeyE: 'enter',
  KeyM: 'mute',
  KeyP: 'pause',
  Escape: 'pause',
  Enter: 'confirm',
  KeyR: 'restart',
  KeyH: 'help',
};

export function initInput(canvas) {
  window.addEventListener('keydown', (event) => {
    const name = KEY_NAMES[event.code];
    if (name) {
      if (!keys[name]) pressed.add(name);
      keys[name] = true;
      if (name === 'handbrake' || name === 'up' || name === 'down') event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => {
    const name = KEY_NAMES[event.code];
    if (name) keys[name] = false;
  });
  window.addEventListener('blur', () => {
    for (const k of Object.keys(keys)) keys[k] = false;
  });
  canvas.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = event.clientX - rect.left;
    mouse.y = event.clientY - rect.top;
  });
  canvas.addEventListener('mousedown', (event) => {
    if (event.button === 0) {
      mouse.down = true;
      mouse.clicked = true;
    }
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) mouse.down = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
}

export function moveVector() {
  let x = 0;
  let y = 0;
  if (keys.left) x -= 1;
  if (keys.right) x += 1;
  if (keys.up) y -= 1;
  if (keys.down) y += 1;
  if (x !== 0 && y !== 0) {
    x *= Math.SQRT1_2;
    y *= Math.SQRT1_2;
  }
  return { x, y };
}
