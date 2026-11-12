// Touch (virtual stick + buttons) and keyboard input.
const KEYMAP = { KeyJ: 'attack', KeyK: 'heavy', Space: 'dodge', KeyL: 'dodge', KeyU: 'rage', KeyI: 'rage', KeyP: 'pause', Escape: 'pause' };

export class Input {
  constructor(stickZone, buttons) {
    this.mx = 0; this.my = 0;           // move vector, screen space (x right, y up), |v| <= 1
    this.pressed = new Set();           // edge-triggered actions consumed by the game
    this.held = new Set();
    this.buttonPointers = new Map();
    this.stickId = null;
    this.zone = stickZone;
    this.base = stickZone.querySelector('.stick-base');
    this.knob = stickZone.querySelector('.stick-knob');
    this.keys = new Set();
    this.radius = 56;

    stickZone.addEventListener('pointerdown', e => this.stickStart(e));
    window.addEventListener('pointermove', e => this.stickMove(e), { passive: false });
    window.addEventListener('pointerup', e => this.stickEnd(e));
    window.addEventListener('pointercancel', e => this.stickEnd(e));

    const releasePointer = e => {
      const button = this.buttonPointers.get(e.pointerId);
      if (!button) return;
      this.buttonPointers.delete(e.pointerId);
      if (!this.touchHeld(button.action)) button.el.classList.remove('down');
      this.release(button.action);
    };
    for (const [action, el] of Object.entries(buttons)) {
      el.addEventListener('pointerdown', e => {
        e.preventDefault();
        this.buttonPointers.set(e.pointerId, { action, el });
        try { el.setPointerCapture?.(e.pointerId); } catch (err) { /* window handles uncaptured pointers */ }
        this.press(action); el.classList.add('down');
      });
      el.addEventListener('pointerup', releasePointer);
      el.addEventListener('pointercancel', releasePointer);
      el.addEventListener('contextmenu', e => e.preventDefault());
    }
    window.addEventListener('pointerup', releasePointer);
    window.addEventListener('pointercancel', releasePointer);

    window.addEventListener('keydown', e => {
      if (e.repeat) return;
      this.keys.add(e.code);
      const a = KEYMAP[e.code];
      if (a) { this.press(a); e.preventDefault(); }
    });
    window.addEventListener('keyup', e => {
      this.keys.delete(e.code);
      const a = KEYMAP[e.code]; if (a) this.release(a);
    });
    window.addEventListener('blur', () => {
      this.keys.clear(); this.clear(); this.resetButtons(); this.resetStick();
    });
    // iOS: block pinch-zoom / double-tap zoom gestures on the game surface
    document.addEventListener('gesturestart', e => e.preventDefault());
    document.addEventListener('dblclick', e => e.preventDefault());
  }
  press(a) { this.pressed.add(a); this.held.add(a); }
  consume(a) { if (this.pressed.has(a)) { this.pressed.delete(a); return true; } return false; }
  clear() { this.pressed.clear(); }
  touchHeld(action) {
    return [...this.buttonPointers.values()].some(button => button.action === action);
  }
  release(action) {
    if (!this.touchHeld(action) && ![...this.keys].some(code => KEYMAP[code] === action)) this.held.delete(action);
  }
  resetButtons() {
    for (const { el } of this.buttonPointers.values()) el.classList.remove('down');
    this.buttonPointers.clear();
    this.held.clear();
  }
  stickStart(e) {
    if (this.stickId !== null) return;
    e.preventDefault();
    this.stickId = e.pointerId;
    const r = this.zone.getBoundingClientRect();
    this.ox = e.clientX; this.oy = e.clientY;
    this.base.style.transform = `translate(${e.clientX - r.left}px, ${e.clientY - r.top}px)`;
    this.knob.style.transform = `translate(${e.clientX - r.left}px, ${e.clientY - r.top}px)`;
    this.zone.classList.add('active');
  }
  stickMove(e) {
    if (e.pointerId !== this.stickId) return;
    e.preventDefault();
    let dx = e.clientX - this.ox, dy = e.clientY - this.oy;
    const d = Math.hypot(dx, dy), R = this.radius;
    if (d > R) { dx *= R / d; dy *= R / d; }
    const r = this.zone.getBoundingClientRect();
    this.knob.style.transform = `translate(${this.ox - r.left + dx}px, ${this.oy - r.top + dy}px)`;
    const m = Math.min(1, d / R);
    const dead = 0.15, l = Math.hypot(dx, dy) || 1;
    const amt = m < dead ? 0 : (m - dead) / (1 - dead);
    this.mx = (dx / l) * amt;
    this.my = (-dy / l) * amt;
  }
  stickEnd(e) { if (e.pointerId === this.stickId) this.resetStick(); }
  resetStick() {
    this.stickId = null; this.mx = 0; this.my = 0;
    this.zone.classList.remove('active');
  }
  move() {
    let x = this.mx, y = this.my;
    const k = this.keys;
    const kx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const ky = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    if (kx || ky) { const l = Math.hypot(kx, ky); x = kx / l; y = ky / l; }
    return [x, y];
  }
}
