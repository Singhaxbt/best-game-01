// Input: keyboard + mouse state, in arena coordinates.
// One job: read the devices. The sim asks this, it never touches the DOM.

export function makeInput(canvas) {
  const keys = new Set();
  const mouse = { x: 0, y: 0, down: false };
  const pressed = new Set(); // keys hit since the last consume (edge-triggered)

  const toArena = (e) => {
    const r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (canvas.width / r.width),
      y: (e.clientY - r.top) * (canvas.height / r.height),
    };
  };

  addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (!e.repeat) pressed.add(k);
    keys.add(k);
  });
  addEventListener('keyup', (e) => {
    keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  });
  addEventListener('blur', () => { keys.clear(); mouse.down = false; });
  canvas.addEventListener('mousemove', (e) => Object.assign(mouse, toArena(e)));
  canvas.addEventListener('mousedown', (e) => { Object.assign(mouse, toArena(e)); mouse.down = true; });
  addEventListener('mouseup', () => { mouse.down = false; });

  return {
    mouse,
    // Held movement keys as a unit vector (WASD or arrows).
    moveVec() {
      let x = 0, y = 0;
      if (keys.has('a') || keys.has('ArrowLeft')) x -= 1;
      if (keys.has('d') || keys.has('ArrowRight')) x += 1;
      if (keys.has('w') || keys.has('ArrowUp')) y -= 1;
      if (keys.has('s') || keys.has('ArrowDown')) y += 1;
      const len = Math.hypot(x, y);
      return len > 0 ? { x: x / len, y: y / len } : { x: 0, y: 0 };
    },
    // Was this key pressed since the last check? (consumes it)
    hit(key) {
      if (pressed.has(key)) { pressed.delete(key); return true; }
      return false;
    },
    held(key) { return keys.has(key); },
    // Clear edge-triggered presses (used when a screen changes).
    flush() { pressed.clear(); },
  };
}
