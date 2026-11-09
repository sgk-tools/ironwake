// Procedural sound effects and a low drum/drone loop via WebAudio (no audio files needed).
export class Sfx {
  constructor() { this.ctx = null; this.muted = false; this.musicOn = false; }
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.8;
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp); comp.connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain(); this.sfxBus.connect(this.master);
      this.musBus = this.ctx.createGain(); this.musBus.gain.value = 0.35; this.musBus.connect(this.master);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.8; }
  _noise(t, dur, f0, f1, q, gain, type = 'bandpass', dest = this.sfxBus) {
    const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noise;
    s.playbackRate.value = 0.7 + Math.random() * 0.6;
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.03, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }
  _tone(t, dur, f0, f1, gain, type = 'sine', dest = this.sfxBus) {
    const c = this.ctx, o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
  }
  play(name, vol = 1) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    switch (name) {
      case 'swing': this._noise(t, 0.28, 500, 2600, 1.2, 0.35 * vol); break;
      case 'swingHeavy': this._noise(t, 0.45, 300, 1800, 1.0, 0.5 * vol); this._tone(t, 0.3, 90, 50, 0.2 * vol); break;
      case 'hit':
        this._noise(t, 0.12, 2400, 600, 0.8, 0.45 * vol);
        this._tone(t, 0.16, 140, 50, 0.5 * vol, 'triangle');
        this._noise(t + 0.01, 0.2, 900, 200, 2, 0.25 * vol, 'lowpass'); break;
      case 'slam':
        this._tone(t, 0.6, 80, 30, 0.9 * vol); this._noise(t, 0.5, 1200, 100, 0.7, 0.6 * vol, 'lowpass'); break;
      case 'hurt': this._tone(t, 0.25, 220, 90, 0.35 * vol, 'sawtooth'); this._noise(t, 0.15, 1500, 400, 1, 0.3 * vol); break;
      case 'dodge': this._noise(t, 0.22, 800, 300, 0.8, 0.25 * vol); break;
      case 'clang': this._tone(t, 0.4, 1800, 1700, 0.15 * vol, 'square'); this._tone(t, 0.5, 2700, 2600, 0.1 * vol); this._noise(t, 0.08, 4000, 2000, 1, 0.3 * vol); break;
      case 'rage':
        this._tone(t, 1.2, 60, 120, 0.6 * vol, 'sawtooth'); this._noise(t, 1.0, 200, 3000, 0.6, 0.4 * vol);
        this._tone(t, 1.4, 45, 30, 0.8 * vol); break;
      case 'roar':
        for (let i = 0; i < 3; i++) this._tone(t + i * 0.02, 1.6, 70 + i * 13, 40, 0.35 * vol, 'sawtooth');
        this._noise(t, 1.6, 400, 150, 0.7, 0.5 * vol, 'lowpass'); break;
      case 'heal': this._tone(t, 0.35, 520, 880, 0.15 * vol, 'triangle'); break;
      case 'ui': this._tone(t, 0.09, 660, 520, 0.12 * vol, 'triangle'); break;
      case 'wave': this._tone(t, 1.2, 110, 108, 0.4 * vol, 'sawtooth'); this._tone(t, 1.2, 165, 163, 0.25 * vol, 'sawtooth'); break;
    }
  }
  startMusic() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    const c = this.ctx;
    // drone
    this.drone = [];
    for (const [f, g] of [[55, 0.12], [82.4, 0.06], [55.4, 0.08]]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
      const gn = c.createGain(); gn.gain.value = g;
      o.connect(lp); lp.connect(gn); gn.connect(this.musBus); o.start();
      this.drone.push(o);
    }
    // war drums at 96 bpm, scheduled ahead
    const beat = 60 / 96; let next = c.currentTime + 0.1, step = 0;
    const pattern = [1, 0, 0.5, 0, 1, 0.4, 0.6, 0, 1, 0, 0.5, 0.3, 1, 0, 0.8, 0.6];
    const tick = () => {
      if (!this.musicOn) return;
      while (next < c.currentTime + 0.3) {
        const v = pattern[step % 16];
        if (v) {
          this._tone(next, 0.45, 95, 42, 0.55 * v, 'sine', this.musBus);
          this._noise(next, 0.12, 600, 200, 0.7, 0.12 * v, 'lowpass', this.musBus);
        }
        next += beat / 2; step++;
      }
      this.musTimer = setTimeout(tick, 100);
    };
    tick();
  }
  stopMusic() {
    this.musicOn = false; clearTimeout(this.musTimer);
    (this.drone || []).forEach(o => { try { o.stop(); } catch (e) {} });
    this.drone = [];
  }
}
