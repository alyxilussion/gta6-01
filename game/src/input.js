// Keyboard + mouse state. One-shot presses are snapshotted at the START of
// each frame and cleared at the END, so a press is never swallowed by a
// frame-end clear (a bug the 2D build's playtest caught).

export function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set(); // keys pressed since last frame start
  const released = new Set();
  let mouseDown = false;
  let mousePressed = false;
  let mouseX = 0;
  let mouseY = 0;
  let lookDX = 0; // accumulated mouse movement for camera orbit

  function keyOf(e) {
    if (e.code.startsWith('Key')) return e.code.slice(3).toLowerCase();
    if (e.code.startsWith('Digit')) return e.code.slice(5);
    return e.code; // Space, ShiftLeft, Escape, Enter, Tab, ArrowUp...
  }

  window.addEventListener('keydown', (e) => {
    const k = keyOf(e);
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    if (!keys.has(k)) pressed.add(k);
    keys.add(k);
  });
  window.addEventListener('keyup', (e) => {
    const k = keyOf(e);
    keys.delete(k);
    released.add(k);
  });
  window.addEventListener('blur', () => { keys.clear(); });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) { mouseDown = true; mousePressed = true; }
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouseDown = false;
  });
  canvas.addEventListener('mousemove', (e) => {
    mouseX = e.clientX; mouseY = e.clientY;
    lookDX += e.movementX || 0;
  });

  return {
    down(k) { return keys.has(k); },
    wasPressed(k) { return pressed.has(k); },
    wasReleased(k) { return released.has(k); },
    get mouseDown() { return mouseDown; },
    get mousePressed() { return mousePressed; },
    get mouseX() { return mouseX; },
    get mouseY() { return mouseY; },
    consumeLook() { const d = lookDX; lookDX = 0; return d; },
    // Axis helpers: forward is W/S, strafe is A/D.
    axisY() { return (this.down('w') ? 1 : 0) - (this.down('s') ? 1 : 0); },
    axisX() { return (this.down('d') ? 1 : 0) - (this.down('a') ? 1 : 0); },
    sprint() { return this.down('ShiftLeft') || this.down('ShiftRight'); },
    endFrame() {
      pressed.clear();
      released.clear();
      mousePressed = false;
    },
  };
}
