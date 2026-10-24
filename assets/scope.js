// Home-page hero: an oscilloscope drawing diode circuit waveforms on a 2D canvas.
//
// Calm state: the beam sweeps left to right and leaves a fading phosphor trail.
// Every few seconds the scope "loses sync" for a fraction of a second. During
// that burst the picture is corrupted on purpose: horizontal bands tear
// sideways, macroblocks are copied to the wrong place, the trace splits into
// amber and blue copies, and a block or two leaks the raw sample values the
// trace is drawn from. The waveform changes inside a burst, so the cut is hidden.
// The random layout of a burst is held for 2 frames so it reads as a codec
// error rather than noise.
(() => {
  const canvas = document.getElementById("scope");
  if (!canvas || !canvas.getContext) return;
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const css = getComputedStyle(document.documentElement);
  const C = (name) => css.getPropertyValue(name).trim();
  const COL = { bg: C("--bg"), trace: C("--trace"), amber: C("--amber"), blue: C("--blue"), rule: "rgba(230,235,227,.09)", rule2: "rgba(230,235,227,.2)" };

  const TAU = Math.PI * 2;
  const DROP = 0.12; // one diode drop, as a fraction of the peak
  const MODES = [
    { name: "Sine", formula: "v(t) = A sin ωt", f: (p) => Math.sin(p) },
    { name: "Half-wave rectifier", formula: "v = max(A sin ωt − U_D, 0)", f: (p) => Math.max(Math.sin(p) - DROP, 0) },
    { name: "Half-wave + C", formula: "ripple ≈ I / f C", f: (p) => {
      const since = ((p - Math.PI / 2) % TAU + TAU) % TAU; // time since the last peak
      return Math.max(Math.sin(p) - DROP, (1 - DROP) * Math.exp(-since / 9));
    } },
    { name: "Full-wave bridge", formula: "v = max(|A sin ωt| − 2U_D, 0)", f: (p) => Math.max(Math.abs(Math.sin(p)) - 2 * DROP, 0) },
    { name: "Diode clipper", formula: "|v| ≤ U_D + U_bias", f: (p) => Math.max(-0.55, Math.min(0.55, 1.35 * Math.sin(p))) },
  ];
  const cycles = () => (W > H ? 3 : 1.5); // periods across the screen
  const SWEEP = 1.7;  // seconds per sweep

  const hud = (k) => document.querySelector(`[data-${k}]`);
  const syncEl = hud("sync"), modeEl = hud("mode"), seedEl = hud("seed"), formulaEl = hud("formula");
  const nameEl = document.querySelector("[data-scope]");

  const ctx = canvas.getContext("2d");
  const make = () => document.createElement("canvas");
  const grid = make(), phosphor = make(), frame = make(), tint = make();
  const pctx = phosphor.getContext("2d"), fctx = frame.getContext("2d"), tctx = tint.getContext("2d");

  let W = 0, H = 0, dpr = 1, quality = 1;
  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2) * quality;
    W = Math.max(1, Math.round(canvas.clientWidth * dpr));
    H = Math.max(1, Math.round(canvas.clientHeight * dpr));
    for (const c of [canvas, grid, phosphor, frame, tint]) { c.width = W; c.height = H; }
    drawGrid();
    prevX = 0;
  }

  // Graticule: 10 × 8 divisions, minor ticks on the centre axes, a soft vignette.
  function drawGrid() {
    const g = grid.getContext("2d");
    g.fillStyle = COL.bg; g.fillRect(0, 0, W, H);
    const halo = g.createRadialGradient(W / 2, H * 0.42, 0, W / 2, H * 0.42, Math.max(W, H) * 0.6);
    halo.addColorStop(0, "rgba(157,255,107,.035)"); halo.addColorStop(1, "rgba(0,0,0,.55)");
    g.fillStyle = halo; g.fillRect(0, 0, W, H);
    g.lineWidth = Math.max(1, dpr);
    g.strokeStyle = COL.rule;
    g.beginPath();
    for (let i = 1; i < 10; i++) { const x = Math.round((W * i) / 10) + 0.5; g.moveTo(x, 0); g.lineTo(x, H); }
    for (let j = 1; j < 8; j++) { const y = Math.round((H * j) / 8) + 0.5; g.moveTo(0, y); g.lineTo(W, y); }
    g.stroke();
    g.strokeStyle = COL.rule2;
    g.beginPath();
    const cx = W / 2, cy = Y0();
    for (let i = 0; i <= 50; i++) { const x = (W * i) / 50; g.moveTo(x, cy - 4 * dpr); g.lineTo(x, cy + 4 * dpr); }
    for (let j = 0; j <= 40; j++) { const y = (H * j) / 40; g.moveTo(cx - 4 * dpr, y); g.lineTo(cx + 4 * dpr, y); }
    g.stroke();
  }

  const Y0 = () => H * 0.42;          // 0 V line
  const AMP = () => H * 0.24;         // peak height
  let mode = 0, jitter = 0;
  const yAt = (x) => Y0() - MODES[mode].f((x / W) * cycles() * TAU + jitter) * AMP();

  // Draw the trace from x0 to x1 into the phosphor layer.
  function sweep(c, x0, x1) {
    if (x1 <= x0) return;
    const step = 2 * dpr;
    c.beginPath();
    c.moveTo(x0, yAt(x0));
    for (let x = x0 + step; x < x1; x += step) c.lineTo(x, yAt(x));
    c.lineTo(x1, yAt(x1));
    c.stroke();
  }

  // ---- bursts
  let burstStart = -1, burstLen = 0, nextBurst = 2.2, kick = 0, changed = false;
  const rnd = (a, b) => a + Math.random() * (b - a);
  function burstLevel(t) {
    if (t >= nextBurst && t > burstStart + burstLen) {
      burstStart = t; burstLen = rnd(0.14, 0.7); nextBurst = t + burstLen + rnd(2.5, 6.5);
      changed = false;
    }
    const k = (t - burstStart) / burstLen;
    let b = k >= 0 && k < 1 ? Math.sqrt(Math.sin(Math.PI * k)) : 0;
    // swap the waveform at the peak of every longer burst
    if (b > 0.9 && !changed && burstLen > 0.3) { changed = true; mode = (mode + 1) % MODES.length; setMode(); }
    return Math.min(1, Math.max(b, kick));
  }
  function setMode() {
    modeEl && (modeEl.textContent = MODES[mode].name);
    formulaEl && (formulaEl.textContent = MODES[mode].formula);
    pctx.clearRect(0, 0, W, H);
  }

  // Pointer energy causes small, short bursts.
  let px = 0, py = 0;
  addEventListener("pointermove", (e) => {
    const v = Math.hypot(e.clientX - px, e.clientY - py); px = e.clientX; py = e.clientY;
    if (v > 60) kick = Math.min(0.7, kick + v / 600);
  }, { passive: true });

  // One corrupted frame, drawn on top of the clean one already in ctx.
  function corrupt(B) {
    const bs = Math.round(Math.min(W, H) / 9);
    // horizontal tears
    const tears = 2 + ((B * 6) | 0);
    for (let i = 0; i < tears; i++) {
      const h = rnd(0.01, 0.07) * H, y = rnd(0, H - h), dx = rnd(-0.08, 0.08) * W * B;
      ctx.drawImage(frame, 0, y, W, h, dx, y, W, h);
    }
    // macroblocks copied from the wrong place, some posterised
    const blocks = (B * 9) | 0;
    for (let i = 0; i < blocks; i++) {
      const w = bs * ((rnd(1, 4)) | 0), h = bs * ((rnd(1, 3)) | 0);
      const sx = rnd(0, W - w), sy = rnd(0, H - h), dx = Math.round(rnd(0, W - w) / bs) * bs, dy = Math.round(rnd(0, H - h) / bs) * bs;
      ctx.drawImage(frame, sx, sy, w, h, dx, dy, w, h);
      if (Math.random() < 0.3) {
        ctx.globalAlpha = 0.45;
        ctx.globalCompositeOperation = "difference";
        ctx.fillStyle = Math.random() < 0.5 ? COL.amber : COL.blue;
        ctx.fillRect(dx, dy, w, h);
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
      }
    }
    // chroma split of the trace: tinted copies of the phosphor layer, offset sideways
    const dx = rnd(4, 16) * dpr * B * (Math.random() < 0.5 ? -1 : 1);
    ctx.globalCompositeOperation = "lighter";
    for (const [col, off] of [[COL.amber, dx], [COL.blue, -dx * 0.8]]) {
      tctx.globalCompositeOperation = "source-over";
      tctx.clearRect(0, 0, W, H); tctx.drawImage(phosphor, 0, 0);
      tctx.globalCompositeOperation = "source-in";
      tctx.fillStyle = col; tctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 0.85; ctx.drawImage(tint, off, 0); ctx.globalAlpha = 1;
    }
    ctx.globalCompositeOperation = "source-over";
    // leak the sample buffer the trace is made from
    if (B > 0.5) {
      const w = bs * 3, h = bs * 2, x = Math.round(rnd(0, W - w) / bs) * bs, y = Math.round(rnd(0, H - h) / bs) * bs;
      ctx.fillStyle = COL.bg; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = COL.amber;
      const fs = Math.max(9, Math.round(bs / 7));
      ctx.font = `500 ${fs}px "IBM Plex Mono", monospace`;
      for (let r = 0, sx = x; r < Math.floor(h / (fs * 1.3)); r++) {
        let line = "";
        for (let k = 0; k < 4; k++, sx += W / 37) line += ((Y0() - yAt(sx)) / AMP()).toFixed(3).padStart(7) + " ";
        ctx.fillText(line, x + fs * 0.5, y + fs * 1.3 * (r + 1));
      }
    }
  }

  // ---- loop
  let prevX = 0, frameNo = 0, t0 = performance.now(), last = t0, slow = 0, running = false, glitching = false, held = 0;
  function tick(now) {
    if (!running) return;
    const t = (now - t0) / 1000, dt = now - last; last = now;
    // adaptive resolution: drop quality if frames are consistently slow
    slow = slow * 0.95 + (dt > 26 ? 1 : 0) * 0.05;
    if (slow > 0.6 && quality > 0.5) { quality -= 0.25; slow = 0; resize(); }

    const B = burstLevel(t);
    kick *= 0.86;
    if (frameNo++ % 2 === 0) held = B; // hold the burst seed for 2 frames
    const on = held > 0.05;
    if (on !== glitching) {
      glitching = on;
      nameEl && nameEl.classList.toggle("is-glitching", on);
      if (syncEl) { syncEl.textContent = on ? "Lost" : "Locked"; syncEl.classList.toggle("amber", on); }
      if (on && seedEl) seedEl.textContent = "0x" + ((Math.random() * 0xffffff) | 0).toString(16).toUpperCase().padStart(6, "0");
    }
    jitter = on ? rnd(-0.6, 0.6) * held : 0;

    // phosphor decays, then the beam advances
    pctx.globalCompositeOperation = "destination-out";
    pctx.fillStyle = "rgba(0,0,0,.08)"; pctx.fillRect(0, 0, W, H);
    pctx.globalCompositeOperation = "source-over";
    // wipe a bar just ahead of the beam, so faint residue never builds up
    const bx = ((t % SWEEP) / SWEEP) * W, gap = W * 0.06;
    pctx.clearRect(bx, 0, gap, H);
    if (bx + gap > W) pctx.clearRect(0, 0, bx + gap - W, H);
    pctx.strokeStyle = COL.trace; pctx.lineWidth = 2 * dpr; pctx.lineJoin = "round";
    pctx.shadowColor = COL.trace; pctx.shadowBlur = 8 * dpr;
    if (bx < prevX) { sweep(pctx, prevX, W); sweep(pctx, 0, bx); } else sweep(pctx, prevX, bx);
    prevX = bx;
    pctx.shadowBlur = 0;

    fctx.drawImage(grid, 0, 0);
    fctx.drawImage(phosphor, 0, 0);
    fctx.fillStyle = "#f4ffe9"; // beam spot
    fctx.beginPath(); fctx.arc(bx, yAt(bx), 2.6 * dpr, 0, TAU); fctx.fill();

    ctx.drawImage(frame, 0, 0);
    if (on) {
      corrupt(held);
      if (held > 0.96 && frameNo % 2 === 1) { // one inverted frame at the peak of a big hit
        ctx.globalCompositeOperation = "difference"; ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = "source-over";
      }
    }
    requestAnimationFrame(tick);
  }

  // A single calm frame: the whole trace, no beam, no bursts.
  function drawStill() {
    pctx.clearRect(0, 0, W, H);
    pctx.strokeStyle = COL.trace; pctx.lineWidth = 2 * dpr; pctx.shadowColor = COL.trace; pctx.shadowBlur = 10 * dpr;
    sweep(pctx, 0, W);
    ctx.drawImage(grid, 0, 0); ctx.drawImage(phosphor, 0, 0);
  }

  // Debug stills: ?mode=0..4 freezes a waveform, ?burst=1 freezes a corrupted frame.
  const q = new URLSearchParams(location.search);
  if (q.has("mode")) mode = Math.min(MODES.length - 1, Math.max(0, +q.get("mode") || 0));

  resize(); setMode();
  canvas.classList.add("is-live");
  addEventListener("resize", () => { resize(); if (still) drawStill(); });

  if (still || q.has("mode")) {
    drawStill();
    if (q.get("burst") === "1") { fctx.drawImage(canvas, 0, 0); corrupt(0.9); }
    return;
  }

  const start = () => { if (!running) { running = true; last = performance.now(); requestAnimationFrame(tick); } };
  const stop = () => { running = false; };
  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; visible && !document.hidden ? start() : stop(); }).observe(canvas);
  document.addEventListener("visibilitychange", () => (document.hidden || !visible ? stop() : start()));
  start();
})();
