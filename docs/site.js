/* HaiRuo project page. Every number shown comes from the paper, except the per-window figures of the held-out window
   ("In motion"), which are computed from HaiRuo's saved forecast of that window and labelled "This window alone". */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const ease = k => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  const easeOut = k => 1 - Math.pow(1 - k, 3);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SVG = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs = {}, parent) => {
    const n = document.createElementNS(SVG, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  };
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const fmtDate = iso => { const [y, m, d] = iso.split('-').map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };

  /* ---------- Navigation ---------- */
  const nav = $('#nav');
  const navProgress = $('#nav-progress');
  const toggle = $('#menu-toggle');
  const menu = $('#menu');
  const closeMenu = () => { menu.hidden = true; toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-label', 'Open menu'); };
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    menu.hidden = !open;
  });
  $$('a', menu).forEach(a => a.addEventListener('click', closeMenu));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
  const navLinks = $$('.nav-links a');
  const chapterIO = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      navLinks.forEach(a => {
        const on = a.hash === '#' + entry.target.id;
        a.classList.toggle('active', on);
        if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
      });
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  $$('.chapter').forEach(c => chapterIO.observe(c));

  /* ---------- Reveal on scroll + number counters ---------- */
  const fmt = (v, d) => d > 0 ? v.toFixed(d) : Math.round(v).toLocaleString('en-US');
  function countUp(c) {
    const target = parseFloat(c.dataset.count), d = parseInt(c.dataset.decimals || '0', 10);
    if (reduced || !isFinite(target)) { c.textContent = fmt(target, d); return; }
    const t0 = performance.now(), dur = 1000;
    const step = now => {
      const k = clamp((now - t0) / dur);
      c.textContent = fmt(target * (1 - Math.pow(1 - k, 4)), d);
      if (k < 1) requestAnimationFrame(step); else c.textContent = fmt(target, d);
    };
    requestAnimationFrame(step);
  }
  const pending = new Set($$('.reveal'));
  const reveal = t => {
    if (!pending.delete(t)) return;
    t.classList.add('in');
    $$('[data-count]', t).forEach(c => { if (!c.dataset.done) { c.dataset.done = '1'; countUp(c); } });
    revealIO.unobserve(t);
  };
  const revealIO = new IntersectionObserver(entries => {
    entries.forEach(entry => { if (entry.isIntersecting) reveal(entry.target); });
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.01 });
  pending.forEach(r => revealIO.observe(r));
  const sweepPassed = () => {               // anything already scrolled past (fast scrolls, anchor jumps) is revealed too
    if (!pending.size) return;
    const lim = innerHeight * .88;
    pending.forEach(t => { if (t.getBoundingClientRect().top < lim) reveal(t); });
  };
  const countIO = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const c = entry.target;
      if (!c.dataset.done) { c.dataset.done = '1'; countUp(c); }
      countIO.unobserve(c);
    });
  }, { rootMargin: '0px 0px -10% 0px' });
  $$('[data-count]').forEach(c => { if (!c.closest('.reveal')) countIO.observe(c); });

  /* ---------- Manifesto: words light up with scroll ---------- */
  const manifesto = $('#manifesto');
  const mText = $('.manifesto-text', manifesto);
  const words = mText.textContent.trim().split(/\s+/);
  const hlFrom = words.length - parseInt(mText.dataset.hl || '3', 10); // the closing words light up in the ocean colour
  mText.setAttribute('aria-label', mText.textContent.trim());
  mText.innerHTML = words.map((w, i) => `<span class="w${i >= hlFrom ? ' hl' : ''}" aria-hidden="true">${w} </span>`).join('');
  const wordEls = $$('.w', mText);
  let litCount = -1;

  /* ---------- Hero: real geostrophic currents (DUACS, North Atlantic, 7 July 2018) on the deep ocean ---------- */
  (function heroFlow() {
    const box = $('#hero-field'), cv = $('#flow-canvas');
    if (!box || !cv || !cv.getContext) return;
    const ctx = cv.getContext('2d');
    const N = 256, UMAX = 2.0;              // flow_t0.png: 0.25-degree cells; R, G = u, v (+-2 m/s); B = sea level (+-1 m), 0 on land
    const NORTH = 66.875, WEST = -77.125, CELL = 0.25;
    const CENTER = [(-60 - WEST) / CELL, (NORTH - 39) / CELL];   // keep 60 W, 39 N (the Gulf Stream) in view
    const TRAIL = 26, SPEED_PX = 1.25;     // display pixels per frame at 1 m/s (speed^0.55, so weak flow stays visible)
    const COLORS = ['118,160,212', '80,186,255', '150,222,255', '236,246,255'];
    const ALPHA = [.8, .42, .15];
    const WIDTH = [.9, 1.05, 1.3, 1.6];
    let U, V, OCEAN, COSL, tint, W = 0, H = 0, dpr = 1, k = 1, ox = 0, oy = 0;
    let n = 0, PX, PY, AGE, LIFE, LEN, HEAD, SPB, TX, TY;
    let vu = 0, vv = 0, vc = 1, running = false, raf = 0, visible = true;
    const buckets = Array.from({ length: 12 }, () => []);
    const img = new Image();
    img.decoding = 'async';
    img.onload = init;
    img.src = 'assets/data/flow_t0.png';

    function init() {
      const oc = document.createElement('canvas'); oc.width = oc.height = N;
      const o = oc.getContext('2d', { willReadFrequently: true });
      o.drawImage(img, 0, 0);
      const d = o.getImageData(0, 0, N, N).data;
      U = new Float32Array(N * N); V = new Float32Array(N * N); OCEAN = new Uint8Array(N * N); COSL = new Float32Array(N);
      const lc = document.createElement('canvas'); lc.width = lc.height = N;
      const l = lc.getContext('2d'), li = l.createImageData(N, N), T = li.data;
      for (let i = 0; i < N * N; i++) {
        const b = d[i * 4 + 2];
        OCEAN[i] = b > 0 ? 1 : 0;
        U[i] = (d[i * 4] - 128) / 127 * UMAX;
        V[i] = (d[i * 4 + 1] - 128) / 127 * UMAX;
        if (!b) { T[i * 4] = 18; T[i * 4 + 1] = 42; T[i * 4 + 2] = 72; T[i * 4 + 3] = 255; continue; }   // land: a lighter navy
        const s = (b - 128) / 127, a = Math.min(1, Math.abs(s) * 1.7) * .3;                         // sea level: warm crests, cool troughs
        if (s > 0) { T[i * 4] = 255; T[i * 4 + 1] = 120; T[i * 4 + 2] = 132; } else { T[i * 4] = 64; T[i * 4 + 1] = 176; T[i * 4 + 2] = 255; }
        T[i * 4 + 3] = Math.round(a * 255);
      }
      for (let r = 0; r < N; r++) COSL[r] = Math.max(.3, Math.cos((NORTH - (r + .5) * CELL) * Math.PI / 180));
      l.putImageData(li, 0, 0);
      tint = lc;
      resize();
      box.classList.add('ready');
      if (reduced) { for (let s = 0; s < TRAIL + 2; s++) stepAll(); draw(); return; }
      new IntersectionObserver(e => { visible = e[0].isIntersecting; visible && !document.hidden ? start() : stop(); }).observe(box);
      document.addEventListener('visibilitychange', () => { document.hidden ? stop() : visible && start(); });
      let rt = 0;
      addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(resize, 150); });
    }
    function sample(x, y) {               // bilinear velocity at a data position; false on land or off the tile
      const fx = x - .5, fy = y - .5, i = Math.floor(fx), j = Math.floor(fy);
      if (i < 0 || j < 0 || i >= N - 1 || j >= N - 1) return false;
      const p = j * N + i;
      if (!(OCEAN[p] && OCEAN[p + 1] && OCEAN[p + N] && OCEAN[p + N + 1])) return false;
      const a = fx - i, b = fy - j;
      vu = (U[p] * (1 - a) + U[p + 1] * a) * (1 - b) + (U[p + N] * (1 - a) + U[p + N + 1] * a) * b;
      vv = (V[p] * (1 - a) + V[p + 1] * a) * (1 - b) + (V[p + N] * (1 - a) + V[p + N + 1] * a) * b;
      vc = COSL[j];
      return true;
    }
    function spawn(i) {
      const vw = W / k, vh = H / k;
      for (let tries = 0; tries < 24; tries++) {         // favour the currents a little: acceptance grows with speed
        const x = ox + Math.random() * vw, y = oy + Math.random() * vh;
        if (sample(x, y) && (tries > 16 || Math.random() < .3 + Math.hypot(vu, vv) / .5)) { PX[i] = x; PY[i] = y; break; }
      }
      AGE[i] = 0; LIFE[i] = 120 + Math.random() * 220; LEN[i] = 0;
    }
    function resize() {
      const r = box.getBoundingClientRect();
      W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
      dpr = Math.min(2, devicePixelRatio || 1);
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      k = Math.max(W / N, H / N);
      const vw = W / k, vh = H / k;
      ox = clamp(CENTER[0] - vw / 2, 0, N - vw); oy = clamp(CENTER[1] - vh / 2, 0, N - vh);
      n = Math.round(clamp(W * H / 620, 260, 2800));
      PX = new Float32Array(n); PY = new Float32Array(n); AGE = new Float32Array(n); LIFE = new Float32Array(n);
      LEN = new Uint8Array(n); HEAD = new Uint8Array(n); SPB = new Uint8Array(n);
      TX = new Float32Array(n * TRAIL); TY = new Float32Array(n * TRAIL);
      for (let i = 0; i < n; i++) { spawn(i); AGE[i] = Math.random() * LIFE[i]; }
      if (!running) draw();
    }
    function stepAll() {
      const vw = W / k, vh = H / k;
      for (let i = 0; i < n; i++) {
        let x = PX[i], y = PY[i];
        if (!sample(x, y) || AGE[i] > LIFE[i] || x < ox || y < oy || x > ox + vw || y > oy + vh) { spawn(i); continue; }
        const sp = Math.hypot(vu, vv);
        const f = sp > 1e-4 ? SPEED_PX * Math.pow(sp, .55) / sp / k : 0;
        x += vu * f / vc; y -= vv * f;
        PX[i] = x; PY[i] = y; AGE[i]++;
        SPB[i] = sp < .15 ? 0 : sp < .35 ? 1 : sp < .7 ? 2 : 3;
        const h = (HEAD[i] + 1) % TRAIL;
        HEAD[i] = h; TX[i * TRAIL + h] = x; TY[i * TRAIL + h] = y;
        if (LEN[i] < TRAIL) LEN[i]++;
      }
    }
    function draw() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, W, H);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(tint, ox, oy, W / k, H / k, 0, 0, W, H);
      buckets.forEach(b => { b.length = 0; });
      const third = TRAIL / 3;
      for (let i = 0; i < n; i++) {
        const len = LEN[i];
        if (len < 2) continue;
        const h = HEAD[i], base = i * TRAIL, sb = SPB[i] * 3;
        for (let s = 0; s < len - 1; s++) {
          const a = (h - s + TRAIL) % TRAIL, b = (h - s - 1 + TRAIL) % TRAIL;
          buckets[sb + Math.min(2, Math.floor(s / third))].push(
            (TX[base + a] - ox) * k, (TY[base + a] - oy) * k, (TX[base + b] - ox) * k, (TY[base + b] - oy) * k);
        }
      }
      ctx.lineCap = 'round';
      ctx.globalCompositeOperation = 'lighter';
      for (let q = 0; q < 12; q++) {
        const seg = buckets[q];
        if (!seg.length) continue;
        const sb = Math.floor(q / 3), ab = q % 3;
        ctx.strokeStyle = `rgba(${COLORS[sb]},${ALPHA[ab]})`;
        ctx.lineWidth = WIDTH[sb];
        ctx.beginPath();
        for (let j = 0; j < seg.length; j += 4) { ctx.moveTo(seg[j], seg[j + 1]); ctx.lineTo(seg[j + 2], seg[j + 3]); }
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    function loop() { if (!running) return; stepAll(); draw(); raf = requestAnimationFrame(loop); }
    function start() { if (running) return; running = true; raf = requestAnimationFrame(loop); }
    function stop() { running = false; cancelAnimationFrame(raf); }
  })();

  /* ---------- The held-out Dev48 window, shared by "In motion" and "Every eddy, followed" ---------- */
  const WIN = (() => {
    const S = 512, INV = -32768;
    const COL = { 1: [64, 214, 255], 2: [255, 138, 92] };     // cyclonic, anticyclonic
    const RAMP = new Uint8Array(256 * 3);                       // observed sea level: troughs dark, crests light (+-0.9 m)
    const C0 = [3, 11, 26], C1 = [24, 52, 88], C2 = [156, 188, 226];
    for (let i = 0; i < 256; i++) {
      const s = Math.tanh(2.2 * (i - 127.5) / 127.5) / Math.tanh(2.2), tt = (s + 1) / 2;
      const [a, b, f] = tt < .5 ? [C0, C1, tt / .5] : [C1, C2, (tt - .5) / .5];
      for (let c = 0; c < 3; c++) RAMP[i * 3 + c] = Math.round(a[c] + (b[c] - a[c]) * f);
    }
    const cache = new Map();
    let promise = null, D = null;
    const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
    function load() {
      if (promise) return promise;
      promise = (async () => {
        const [meta, sla, mk, tr] = await Promise.all([
          fetch('assets/data/window.json').then(r => r.json()),
          loadImg('assets/data/sla_obs.jpg'), loadImg('assets/data/masks.png'),
          fetch('assets/data/tracks.bin').then(r => r.arrayBuffer())]);
        const oc = document.createElement('canvas'); oc.width = oc.height = S;
        const o = oc.getContext('2d', { willReadFrequently: true });
        const SLA = [], MK = [];
        for (let d = 0; d < 16; d++) {
          o.clearRect(0, 0, S, S); o.drawImage(sla, 0, d * S, S, S, 0, 0, S, S);
          let a = o.getImageData(0, 0, S, S).data; const g = new Uint8Array(S * S);
          for (let i = 0; i < S * S; i++) g[i] = a[i * 4];
          o.clearRect(0, 0, S, S); o.drawImage(mk, 0, d * S, S, S, 0, 0, S, S);
          a = o.getImageData(0, 0, S, S).data; const c = new Uint8Array(S * S);
          for (let i = 0; i < S * S; i++) c[i] = a[i * 4];
          SLA.push(g); MK.push(c);
        }
        const T = new Int16Array(tr);
        D = { meta, SLA, MK, T, nE: T.length / 64 };
        return D;
      })();
      return promise;
    }
    function layers(d) {
      if (cache.has(d)) return cache.get(d);
      const g = D.SLA[d], m = D.MK[d];
      const mk = () => { const c = document.createElement('canvas'); c.width = c.height = S; return c; };
      const bgC = mk(), fiC = mk(), edC = mk();
      const bg = new ImageData(S, S), fi = new ImageData(S, S), ed = new ImageData(S, S);
      const B = bg.data, F = fi.data, E = ed.data;
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const i = y * S + x, o = i * 4, c = m[i];
        if (c >= 9) {
          const coast = (x > 0 && m[i - 1] < 9) || (x < S - 1 && m[i + 1] < 9) || (y > 0 && m[i - S] < 9) || (y < S - 1 && m[i + S] < 9);
          B[o] = coast ? 96 : 42; B[o + 1] = coast ? 112 : 51; B[o + 2] = coast ? 132 : 64; B[o + 3] = 255;
          continue;
        }
        const v = g[i] * 3;
        B[o] = RAMP[v]; B[o + 1] = RAMP[v + 1]; B[o + 2] = RAMP[v + 2]; B[o + 3] = 255;
        const p = Math.floor(c / 3) % 3, a = c % 3;
        if (p) { const col = COL[p]; F[o] = col[0]; F[o + 1] = col[1]; F[o + 2] = col[2]; F[o + 3] = 140; }
        if (a) {
          const na = j => { const q = m[j]; return q >= 9 ? -1 : q % 3; };
          if ((x > 0 && na(i - 1) !== a) || (x < S - 1 && na(i + 1) !== a) || (y > 0 && na(i - S) !== a) || (y < S - 1 && na(i + S) !== a)) {
            E[o] = 255; E[o + 1] = 255; E[o + 2] = 255; E[o + 3] = 225;
          }
        }
      }
      bgC.getContext('2d').putImageData(bg, 0, 0); fiC.getContext('2d').putImageData(fi, 0, 0); edC.getContext('2d').putImageData(ed, 0, 0);
      const L = { bg: bgC, fill: fiC, edge: edC };
      cache.set(d, L);
      return L;
    }
    const alive = (i, d) => D.T[i * 64 + d * 4] !== INV;
    const prebuild = () => { let d = 0; const go = () => { while (d < 16 && cache.has(d)) d++; if (d < 16) { layers(d++); setTimeout(go, 40); } }; setTimeout(go, 200); };
    return { S, INV, COL, load, layers, alive, prebuild, get D() { return D; } };
  })();
  const FEATURE = 83;   // a cyclone of radius 140 km, in the atlas all 15 days (site_tools/export_errors.py)

  /* ---------- In motion: one held-out Dev48 window, observed vs HaiRuo ---------- */
  (function stagePlayer() {
    const stage = $('#stage');
    if (!stage) return;
    const screen = $('#stage-screen'), cv = $('#fc-canvas'), ctx = cv.getContext('2d');
    const playBtn = $('#fc-play'), range = $('#fc-range'), hudDay = $('#hud-day'), hudDate = $('#hud-date'), hudErr = $('#hud-err');
    const tip = $('#stage-tip'), loading = $('#stage-loading'), spark = $('#spark'), followChip = $('[data-follow]', stage);
    const S = WIN.S, INV = WIN.INV, COL = WIN.COL, DAY_MS = 640, HOLD_MS = 2400, REWIND_MS = 1300, REST_MS = 700;
    const VIEWS = { gulf: [8, 136, 256, 256], tile: [0, 0, 512, 512] };
    const show = { masks: true, atlas: true, tracks: true };
    let meta = null, T = null, nE = 0, ready = false;
    let t = 0, playing = false, wantPlay = !reduced, visible = false, phase = 'play', phaseT0 = 0, last = 0, raf = 0, looping = false;
    let view = VIEWS.gulf.slice(), vFrom = null, vTo = null, vT0 = 0, viewKey = 'gulf';
    let W = 0, dpr = 1, focus = -1, pinned = -1;
    const scratch = document.createElement('canvas'); scratch.width = scratch.height = S;
    const sctx = scratch.getContext('2d');

    function init(D) {
      meta = D.meta; T = D.T; nE = D.nE; ready = true;
      loading.hidden = true;
      buildSpark();
      resize();
      setT(reduced ? 15 : 0);
      if (visible && wantPlay) play(); else render();
      WIN.prebuild();
    }

    /* spark line: mean centre error of this window by day */
    let spDot, spDone;
    const sx = d => 30 + d / 15 * 262, sy = km => 96 - km / 30 * 84;
    function buildSpark() {
      const vals = [0, ...meta.lead_mean_km];
      [0, 10, 20, 30].forEach(v => { el('line', { class: 'sp-axis', x1: 30, x2: 292, y1: sy(v), y2: sy(v) }, spark); el('text', { x: 24, y: sy(v) + 4, 'text-anchor': 'end' }, spark).textContent = v === 30 ? '30 km' : v; });
      [0, 5, 10, 15].forEach(d => { el('text', { x: sx(d), y: 114, 'text-anchor': 'middle' }, spark).textContent = d === 0 ? 'day 0' : d; });
      const pts = vals.map((v, d) => `${sx(d).toFixed(1)},${sy(v).toFixed(1)}`).join(' ');
      el('polyline', { class: 'sp-line', points: pts }, spark);
      spDone = el('polyline', { class: 'sp-done', points: '' }, spark);
      const endT = el('text', { x: sx(15), y: sy(vals[15]) - 9, 'text-anchor': 'end' }, spark); endT.textContent = vals[15].toFixed(1) + ' km';
      spDot = el('circle', { class: 'sp-dot', r: 4.5, cx: sx(0), cy: sy(0) }, spark);
    }
    function sparkAt(tt) {
      if (!spDot) return;
      const vals = [0, ...meta.lead_mean_km], d0 = Math.floor(tt), a = tt - d0, d1 = Math.min(15, d0 + 1);
      const v = vals[d0] + (vals[d1] - vals[d0]) * a;
      spDot.setAttribute('cx', sx(tt).toFixed(1)); spDot.setAttribute('cy', sy(v).toFixed(1));
      const pts = []; for (let d = 0; d <= d0; d++) pts.push(`${sx(d).toFixed(1)},${sy(vals[d]).toFixed(1)}`);
      pts.push(`${sx(tt).toFixed(1)},${sy(v).toFixed(1)}`);
      spDone.setAttribute('points', pts.join(' '));
    }

    /* geometry */
    function resize() {
      W = Math.max(1, Math.round(screen.clientWidth));
      dpr = Math.min(2, devicePixelRatio || 1);
      cv.width = cv.height = Math.round(W * dpr);
      if (ready) render();
    }
    new ResizeObserver(() => resize()).observe(screen);
    const kScale = () => cv.width / view[2];
    const toScreen = (x, y) => [(x / 8 - view[0]) * kScale(), (y / 8 - view[1]) * kScale()];

    function hud() {
      const d = Math.round(t);
      hudDay.textContent = 'Day ' + d;
      hudDate.textContent = meta ? fmtDate(meta.dates[d]) + (d === 0 ? ' · last observed' : '') : '';
      hudErr.textContent = meta && d > 0 ? meta.lead_mean_km[d - 1].toFixed(1) + ' km' : '–';
      range.value = t.toFixed(2);
      range.style.setProperty('--fill', (t / 15 * 100).toFixed(2) + '%');
      range.setAttribute('aria-valuetext', 'Day ' + d);
      sparkAt(t);
    }
    function setT(v) { t = clamp(v, 0, 15); hud(); }

    function composite(L0, L1, key, a) {
      sctx.globalCompositeOperation = 'copy'; sctx.globalAlpha = 1 - a; sctx.drawImage(L0[key], 0, 0);
      if (a > 0) { sctx.globalCompositeOperation = 'lighter'; sctx.globalAlpha = a; sctx.drawImage(L1[key], 0, 0); }
      sctx.globalCompositeOperation = 'source-over'; sctx.globalAlpha = 1;
      return scratch;
    }
    function render() {
      if (!ready) return;
      const d0 = Math.min(15, Math.floor(t)), a = t - d0, d1 = Math.min(15, d0 + 1);
      const L0 = WIN.layers(d0), L1 = WIN.layers(d1), [vx, vy, vw, vh] = view, Wp = cv.width, k = kScale();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.fillStyle = '#04101f'; ctx.fillRect(0, 0, Wp, Wp);
      ctx.drawImage(L0.bg, vx, vy, vw, vh, 0, 0, Wp, Wp);
      if (a > 0) { ctx.globalAlpha = a; ctx.drawImage(L1.bg, vx, vy, vw, vh, 0, 0, Wp, Wp); ctx.globalAlpha = 1; }
      if (show.masks) ctx.drawImage(composite(L0, L1, 'fill', a), vx, vy, vw, vh, 0, 0, Wp, Wp);
      if (show.atlas) ctx.drawImage(composite(L0, L1, 'edge', a), vx, vy, vw, vh, 0, 0, Wp, Wp);
      if (show.tracks) tracks(d0, d1, a, k);
      const f = pinned >= 0 ? pinned : focus;
      if (f >= 0) highlight(f, d0, d1, a, k);
    }
    const alive = WIN.alive;
    function predAt(i, d0, d1, a) {
      const b0 = i * 64 + d0 * 4 + 2, b1 = i * 64 + d1 * 4 + 2;
      return [T[b0] + (T[b1] - T[b0]) * a, T[b0 + 1] + (T[b1 + 1] - T[b0 + 1]) * a];
    }
    function truthAt(i, d0, d1, a) {
      const b0 = i * 64 + d0 * 4, b1 = i * 64 + d1 * 4;
      if (T[b1] === INV) return [T[b0], T[b0 + 1]];
      return [T[b0] + (T[b1] - T[b0]) * a, T[b0 + 1] + (T[b1 + 1] - T[b0 + 1]) * a];
    }
    function tracks(d0, d1, a, k) {
      const Wp = cv.width, pad = 20 * dpr, lw = Math.max(1.2, k * .35);
      for (const pol of [1, 2]) {
        const [r, g, b] = COL[pol];
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.strokeStyle = `rgba(${r},${g},${b},.6)`; ctx.lineWidth = lw;
        ctx.beginPath();
        const dots = [];
        for (let i = 0; i < nE; i++) {
          if (meta.polarity[i] !== pol || !alive(i, d0)) continue;
          const p = predAt(i, d0, d1, a), [X, Y] = toScreen(p[0], p[1]);
          if (X < -pad || Y < -pad || X > Wp + pad || Y > Wp + pad) continue;
          const from = Math.max(0, d0 - 4);
          const [x0, y0] = toScreen(T[i * 64 + from * 4 + 2], T[i * 64 + from * 4 + 3]);
          ctx.moveTo(x0, y0);
          for (let d = from + 1; d <= d0; d++) { const q = toScreen(T[i * 64 + d * 4 + 2], T[i * 64 + d * 4 + 3]); ctx.lineTo(q[0], q[1]); }
          ctx.lineTo(X, Y);
          dots.push(X, Y, alive(i, d1) ? 1 : 1 - a);
        }
        ctx.stroke();
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        const rad = Math.max(2, k * .55);
        for (let j = 0; j < dots.length; j += 3) { ctx.globalAlpha = dots[j + 2]; ctx.beginPath(); ctx.arc(dots[j], dots[j + 1], rad, 0, 6.2832); ctx.fill(); }
        ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = Math.max(1, k * .22);   // atlas centres: white rings
      ctx.beginPath();
      const rr = Math.max(2.6, k * .8);
      for (let i = 0; i < nE; i++) {
        if (!alive(i, d0)) continue;
        const q = truthAt(i, d0, d1, a), [X, Y] = toScreen(q[0], q[1]);
        if (X < -pad || Y < -pad || X > Wp + pad || Y > Wp + pad) continue;
        ctx.moveTo(X + rr, Y); ctx.arc(X, Y, rr, 0, 6.2832);
      }
      ctx.stroke();
    }
    function highlight(i, d0, d1, a, k) {
      const [r, g, b] = COL[meta.polarity[i]];
      ctx.save();
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = Math.max(1.5, k * .3); ctx.setLineDash([4 * dpr, 4 * dpr]);
      ctx.beginPath();
      let begun = false;
      for (let d = 0; d <= 15; d++) {
        if (!alive(i, d)) break;
        const [X, Y] = toScreen(T[i * 64 + d * 4], T[i * 64 + d * 4 + 1]);
        if (begun) ctx.lineTo(X, Y); else { ctx.moveTo(X, Y); begun = true; }
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = `rgb(${r},${g},${b})`; ctx.lineWidth = Math.max(2.4, k * .55);
      ctx.shadowColor = `rgba(${r},${g},${b},.8)`; ctx.shadowBlur = 10 * dpr;
      ctx.beginPath();
      for (let d = 0; d <= 15; d++) {
        const [X, Y] = toScreen(T[i * 64 + d * 4 + 2], T[i * 64 + d * 4 + 3]);
        if (d) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
      }
      ctx.stroke();
      const p = predAt(i, d0, d1, a), [X, Y] = toScreen(p[0], p[1]);
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(X, Y, Math.max(3.5, k * .9), 0, 6.2832); ctx.fill();
      ctx.restore();
      placeTip(i, X / dpr, Y / dpr);
    }
    function placeTip(i, x, y) {
      const d15 = meta.d15_dkm[i];
      const kind = meta.polarity[i] === 1 ? 'Cyclone' : 'Anticyclone';
      tip.innerHTML = `<b>${kind}</b> <span>· radius ${meta.radius_km[i]} km</span><br>${d15 >= 0 ? `day-15 error <b>${(d15 / 10).toFixed(1)} km</b>` : '<span>leaves the atlas before day 15</span>'}`;
      tip.hidden = false;
      tip.style.left = clamp(x, 90, W - 90) + 'px';
      tip.style.top = Math.max(y, 64) + 'px';
    }
    function nearest(cx, cy) {
      const d0 = Math.min(15, Math.floor(t)), a = t - d0, d1 = Math.min(15, d0 + 1);
      let best = -1, bd = (16 * dpr) ** 2;
      for (let i = 0; i < nE; i++) {
        if (!alive(i, d0)) continue;
        const p = predAt(i, d0, d1, a), [X, Y] = toScreen(p[0], p[1]);
        const dd = (X - cx) ** 2 + (Y - cy) ** 2;
        if (dd < bd) { bd = dd; best = i; }
      }
      return best;
    }
    const pointer = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr]; };
    cv.addEventListener('pointermove', e => {
      if (!ready || e.pointerType === 'touch') return;
      const f = nearest(...pointer(e));
      if (f !== focus) { focus = f; if (f < 0 && pinned < 0) tip.hidden = true; if (!playing) render(); }
    });
    cv.addEventListener('pointerleave', () => { focus = -1; if (pinned < 0) tip.hidden = true; if (!playing) render(); });
    cv.addEventListener('click', e => {
      if (!ready) return;
      const f = nearest(...pointer(e));
      pinned = f === pinned ? -1 : f;
      if (pinned !== FEATURE) followChip.setAttribute('aria-pressed', 'false');
      if (pinned < 0 && focus < 0) tip.hidden = true;
      if (!playing) render();
    });

    /* playback */
    function frame(now) {
      const dt = Math.min(64, now - last); last = now;
      let need = false;
      if (vTo) {
        const kk = clamp((now - vT0) / 900), e = ease(kk);
        view = vFrom.map((v, j) => v + (vTo[j] - v) * e);
        if (kk >= 1) { view = vTo.slice(); vTo = null; }
        need = true;
      }
      if (playing) {
        if (phase === 'play') { setT(t + dt / DAY_MS); if (t >= 15) { phase = 'hold'; phaseT0 = now; } }
        else if (phase === 'hold') { if (now - phaseT0 > HOLD_MS) { phase = 'rewind'; phaseT0 = now; } }
        else if (phase === 'rewind') { const kk = clamp((now - phaseT0) / REWIND_MS); setT(15 * (1 - ease(kk))); if (kk >= 1) { phase = 'rest'; phaseT0 = now; } }
        else if (phase === 'rest') { if (now - phaseT0 > REST_MS) phase = 'play'; }
        need = true;
      }
      if (need) render();
      if (playing || vTo) raf = requestAnimationFrame(frame); else looping = false;
    }
    function kick() { if (looping) return; looping = true; last = performance.now(); raf = requestAnimationFrame(frame); }
    function play() {
      if (!ready) { wantPlay = true; return; }
      if (t >= 15) { setT(0); phase = 'rest'; phaseT0 = performance.now(); } else phase = 'play';
      playing = true; playBtn.classList.add('playing'); playBtn.setAttribute('aria-label', 'Pause'); kick();
    }
    function pause() { playing = false; playBtn.classList.remove('playing'); playBtn.setAttribute('aria-label', 'Play'); }
    function goView(key, box) {
      viewKey = key;
      $$('[data-view]', stage).forEach(x => x.setAttribute('aria-pressed', String(x.dataset.view === key)));
      vFrom = view.slice(); vTo = (box || VIEWS[key]).slice(); vT0 = performance.now();
      if (reduced) { view = vTo; vTo = null; render(); } else kick();
    }
    playBtn.addEventListener('click', () => { if (playing) { pause(); wantPlay = false; } else { wantPlay = true; play(); } });
    range.addEventListener('input', () => { pause(); wantPlay = false; setT(parseFloat(range.value)); render(); });
    $$('[data-view]', stage).forEach(b => b.addEventListener('click', () => { pinned = -1; followChip.setAttribute('aria-pressed', 'false'); tip.hidden = true; goView(b.dataset.view); }));
    $$('[data-layer]', stage).forEach(b => b.addEventListener('click', () => {
      const key = b.dataset.layer; show[key] = !show[key];
      b.setAttribute('aria-pressed', String(show[key]));
      if (!playing) render();
    }));
    $$('[data-jump]', stage).forEach(b => b.addEventListener('click', () => {
      if (!ready) return;
      setT(parseFloat(b.dataset.jump)); phase = 'play';
      if (t >= 15) { phase = 'hold'; phaseT0 = performance.now(); }
      if (!playing) render();
    }));
    followChip.addEventListener('click', () => {      // zoom onto one cyclone and play its fifteen days
      if (!ready) return;
      if (pinned === FEATURE) { pinned = -1; tip.hidden = true; followChip.setAttribute('aria-pressed', 'false'); goView('gulf'); return; }
      pinned = FEATURE; followChip.setAttribute('aria-pressed', 'true');
      const x = T[FEATURE * 64] / 8, y = T[FEATURE * 64 + 1] / 8, s = 120;
      goView('', [clamp(x - s / 2, 0, S - s), clamp(y - s / 2, 0, S - s), s, s]);
      setT(0); phase = 'rest'; phaseT0 = performance.now();
      wantPlay = true; play();
    });
    new IntersectionObserver(e => { if (e[0].isIntersecting) WIN.load().then(init).catch(() => { loading.textContent = 'The forecast animation could not be loaded.'; }); }, { rootMargin: '900px 0px' }).observe(stage);
    new IntersectionObserver(e => {
      visible = e[0].isIntersecting;
      if (visible && wantPlay && !document.hidden) play(); else if (!visible) { const w = wantPlay; pause(); wantPlay = w; }
    }, { threshold: 0.35 }).observe(screen);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { const w = wantPlay; pause(); wantPlay = w; } else if (visible && wantPlay) play();
    });
  })();

  /* ---------- ENSO: every test date by phase (the EZCAM data dial, re-cast for HaiRuo) ----------
     Inner ring: the 48 test dates of 2020-2022. Outer ring: their ONI phases, one tick per date (El Nino 4, neutral 10, La Nina 34).
     Hover: the phase swells out on a spring and its ticks light up. Click: the dial turns it toward the panel, a beam of light carries
     it there and the fifteen methods' bars grow in. Values: the paper's ENSO table of all fourteen methods (regions never seen in
     labelled training); neutral windows are not tabulated by method, only their tropical-Pacific margin. */
  (function ensoDial() {
    const host = $('[data-enso]');
    if (!host) return;
    const body = $('.dz-body', host), ringBox = $('.dz-ring', host), legend = $('.dz-legend', host);
    const detail = $('.dz-detail', host), beam = $('.dz-beam', host);
    const PAL = { deep: ['#4fd1ff', '#9d8bff'], nino: ['#ffb057', '#ff5c6a'], neutral: ['#d6dde8', '#7b8ba1'], nina: ['#64d2ff', '#2f7bff'] };
    const grad = k => `linear-gradient(90deg, ${PAL[k][0]}, ${PAL[k][1]})`;
    const NAMES = ['HaiRuo', 'TAU', 'PredRNN-V2', 'PhyDNet', 'SimVPv2/gSTA', 'SimVP', 'U-Net', 'ConvLSTM', 'EddyNet', 'PredFormer', 'Earthformer', 'LSTM+Informer', 'SwinLSTM-B', 'FNO-2d', 'Track Transformer'];
    const METRICS = [
      { k: 'd15', name: '15-day error', unit: ' km', dec: 2, low: true },
      { k: 'centre', name: 'Centre error', unit: ' km', dec: 2, low: true },
      { k: 'miou', name: 'mIoU', unit: '%', dec: 1, low: false },
      { k: 'field', name: 'Field skill', unit: '', dec: 3, low: false }];
    const NINO = {
      d15: [28.24, 34.12, 34.58, 34.52, 34.27, 34.28, 34.14, 34.83, 35.85, 36.41, 36.74, 37.54, 37.68, 37.99, 39.86],
      centre: [15.66, 18.61, 19.30, 19.03, 18.73, 18.71, 18.74, 19.08, 19.49, 19.79, 19.96, 20.18, 20.60, 20.82, 21.15],
      miou: [63.70, 61.64, 61.28, 61.24, 61.44, 60.20, 57.21, 61.34, 60.37, 59.10, 59.28, null, 57.13, 52.14, null],
      field: [0.714, 0.544, 0.506, 0.499, 0.556, 0.478, 0.200, 0.510, 0.397, 0.368, 0.416, null, 0.107, 0.222, null] };
    const NINA = {
      d15: [27.28, 33.20, 33.24, 33.25, 33.47, 33.54, 33.67, 33.82, 35.26, 35.58, 36.21, 36.70, 36.78, 37.42, 38.88],
      centre: [15.16, 18.03, 18.49, 18.29, 18.17, 18.19, 18.34, 18.46, 19.00, 19.25, 19.49, 19.65, 20.00, 20.39, 20.64],
      miou: [63.86, 61.71, 61.42, 61.57, 61.45, 60.25, 57.06, 61.59, 60.40, 59.00, 59.31, null, 57.17, 52.05, null],
      field: [0.723, 0.552, 0.528, 0.514, 0.565, 0.485, 0.215, 0.523, 0.416, 0.393, 0.427, null, 0.109, 0.228, null] };
    const TREE = { kids: [{ name: '2020–2022 test dates', pal: 'deep', kids: [
      { name: 'El Niño', note: 'January to March 2020', pal: 'nino', zone: 2, v: 4, gap: '−17.2%', data: NINO },
      { name: 'Neutral', note: 'neither El Niño nor La Niña', pal: 'neutral', zone: 1, v: 10, gap: '−15.8%', tropics: true },
      { name: 'La Niña', note: '2020 to 2022', pal: 'nina', zone: 0, v: 34, gap: '−17.8%', data: NINA }] }] };
    // tropical Pacific (day-0 centres 20S-20N, 120E-70W): HaiRuo's 15-day error below PredRNN-V2 in each phase (paper appendix)
    const TROPICS = [{ name: 'El Niño', pal: 'nino', km: 10.8, rel: '19.3' }, { name: 'La Niña', pal: 'nina', km: 8.9, rel: '17.0' },
      { name: 'Neutral', pal: 'neutral', km: 8.2, rel: '15.8' }];
    (function sum(n) { if (n.kids) { n.kids.forEach(k => { k.parent = n; sum(k); }); n.v = n.kids.reduce((s, k) => s + k.v, 0); } })(TREE);
    const parents = TREE.kids, parts = parents.flatMap(p => p.kids);
    let acc = 0;
    parents.forEach(p => {
      p.a0 = acc * 360 / TREE.v;
      p.kids.forEach((k, i) => { k.a0 = acc * 360 / TREE.v; acc += k.v; k.a1 = acc * 360 / TREE.v; k.first = i === 0; k.last = i === p.kids.length - 1; });
      p.a1 = acc * 360 / TREE.v;
    });
    const pctOf = (v, t) => (100 * v / t).toFixed(1) + '%';

    // ---------- the ring (geometry as on the EZCAM page) ----------
    const C = 120, P_IN = 60, P_OUT = 68, Q_IN = 73, Q_OUT = 98, POP = 111, PIN = 104, LIFT = 101;
    const pt = (r, deg) => { const a = deg * Math.PI / 180; return [C + r * Math.sin(a), C - r * Math.cos(a)]; };
    const f2 = v => v.toFixed(2);
    const sector = (r0, r1, a0, a1) => {
      const L = a1 - a0 > 180 ? 1 : 0, [x0, y0] = pt(r1, a0), [x1, y1] = pt(r1, a1), [x2, y2] = pt(r0, a1), [x3, y3] = pt(r0, a0);
      return `M${f2(x0)} ${f2(y0)}A${f2(r1)} ${f2(r1)} 0 ${L} 1 ${f2(x1)} ${f2(y1)}L${f2(x2)} ${f2(y2)}A${f2(r0)} ${f2(r0)} 0 ${L} 0 ${f2(x3)} ${f2(y3)}Z`;
    };
    const svg = el('svg', { viewBox: '0 0 240 240', 'aria-hidden': 'true' });
    const defs = el('defs', {}, svg);
    Object.entries(PAL).forEach(([k, [a, b]]) => {
      const g = el('linearGradient', { id: `ez-${k}`, gradientUnits: 'userSpaceOnUse', x1: 16, y1: 16, x2: 224, y2: 224 }, defs);
      el('stop', { offset: 0, 'stop-color': a }, g); el('stop', { offset: 1, 'stop-color': b }, g);
    });
    const dial = el('g', { class: 'dz-dial' }, svg);
    const ticks = [];
    for (let i = 0; i < TREE.v; i++) {            // one tick per test date
      const deg = (i + .5) * 360 / TREE.v, [x1, y1] = pt(112.5, deg), [x2, y2] = pt(119, deg);
      const t = el('line', { x1: f2(x1), y1: f2(y1), x2: f2(x2), y2: f2(y2), class: 'dz-tick' }, dial);
      t._deg = deg; ticks.push(t);
    }
    parents.forEach(p => { p.el = el('path', { class: 'dz-parent', fill: `url(#ez-${p.pal})` }, dial); p.ro = p.tro = P_OUT; p.vro = 0; });
    parts.forEach(n => { n.el = el('path', { class: 'dz-part', fill: `url(#ez-${n.pal})` }, dial); n.ro = n.tro = Q_OUT; n.vro = 0; });
    const center = document.createElement('div');
    center.className = 'dz-center';
    ringBox.append(svg, center);

    // ---------- drawing + spring ----------
    let grow = 0, introT0 = 0, looping = false;
    const trim = (n, a0, a1, end) => [a0 + (n.first || end ? 1.1 : .32), a1 - (n.last || end ? 1.1 : .32)];
    const drawRing = () => {
      const g1 = easeOut(Math.min(1, grow * 1.35)), g2 = easeOut(clamp(grow * 1.35 - .3));
      parents.forEach(p => {
        const [a0, a1] = trim(p, p.a0 * g1, p.a1 * g1, true);
        p.el.style.display = a1 - a0 > .15 ? '' : 'none';
        if (a1 - a0 > .15) p.el.setAttribute('d', sector(P_IN, p.ro, a0, a1));
      });
      parts.forEach(n => {
        const [a0, a1] = trim(n, n.a0 * g2, n.a1 * g2, false);
        n.el.style.display = a1 - a0 > .15 ? '' : 'none';
        if (a1 - a0 > .15) n.el.setAttribute('d', sector(Q_IN, n.ro, a0, a1));
      });
    };
    const loop = now => {
      let moving = false;
      if (grow < 1) { grow = Math.min(1, (now - introT0) / 1500); moving = true; }
      [...parents, ...parts].forEach(n => {
        if (reduced) { n.ro = n.tro; n.vro = 0; return; }
        n.vro = (n.vro + (n.tro - n.ro) * .17) * .7;
        n.ro += n.vro;
        if (Math.abs(n.tro - n.ro) < .02 && Math.abs(n.vro) < .02) { n.ro = n.tro; n.vro = 0; } else moving = true;
      });
      drawRing();
      if (moving) requestAnimationFrame(loop); else looping = false;
    };
    const kick = () => { if (!looping) { looping = true; requestAnimationFrame(loop); } };

    // ---------- state ----------
    let hot = null, sel = null, turn = 0, metric = 'd15';
    const isPart = n => n && n.parent && n.parent !== TREE;
    const targets = () => {
      parts.forEach(n => {
        n.tro = n === hot ? POP : (isPart(hot) || !hot) && n === sel ? PIN : hot && !isPart(hot) && n.parent === hot ? LIFT : Q_OUT;
        n.el.classList.toggle('on', !!hot && (n === hot || n.parent === hot));
        n.el.classList.toggle('pop', n === hot);
      });
      parents.forEach(p => {
        p.tro = hot && (p === hot || p === hot.parent) ? P_OUT + 2.5 : P_OUT;
        p.el.classList.toggle('on', !!hot && (p === hot || p === hot.parent));
      });
      ringBox.classList.toggle('has-hot', !!hot);
      ticks.forEach(t => {                          // the dates under the phase in hand light up in its colour
        const on = !!hot && t._deg >= hot.a0 && t._deg <= hot.a1;
        t.classList.toggle('lit', on);
        t.style.stroke = on ? PAL[hot.pal][0] : '';
      });
      kick();
    };
    const setCenter = () => {
      const n = hot;
      center.innerHTML = !isPart(n) ? `<b>${TREE.v}</b><span>test dates</span><small>2020–2022</small>`
        : `<b>${n.v}</b><span>${n.name}</span><small>${pctOf(n.v, TREE.v)} of the dates</small>`;
    };
    const hover = n => {
      hot = n; targets(); setCenter();
      $$('[data-k]', legend).forEach(b => b.classList.toggle('on', !!n && b._n === n));
    };

    // ---------- the panel: fifteen methods in that phase ----------
    const bars = n => {
      const m = METRICS.find(x => x.k === metric), vals = n.data[metric];
      const rows = NAMES.map((name, i) => ({ name, v: vals[i], us: i === 0 })).filter(r => r.v != null);
      rows.sort((a, b) => m.low ? a.v - b.v : b.v - a.v);
      const max = Math.max(...rows.map(r => r.v));
      return rows.map((r, i) => `<li class="${r.us ? 'us' : ''}" style="--w:${(100 * r.v / max).toFixed(2)}%;--d:${140 + i * 40}ms">`
        + `<span class="dz-name">${r.name}</span><b>${r.v.toFixed(m.dec)}${m.unit}</b><i></i></li>`).join('');
    };
    // the Oceanic Nino Index scale: where this phase sits (thresholds -0.5 and +0.5 C); the marker drifts inside its zone
    const oni = n => `<div class="oni" style="--d:70ms" data-zone="${n.zone}">`
      + `<div class="oni-bar"><i class="z0"></i><i class="z1"></i><i class="z2"></i><b class="oni-dot" style="--x:${[16.7, 50, 83.3][n.zone]}%"></b></div>`
      + `<div class="oni-ticks"><span>−1.5</span><span>−0.5</span><span>0</span><span>+0.5</span><span>+1.5 °C</span></div>`
      + `<p class="oni-cap">Oceanic Niño Index: La Niña at −0.5 °C or below, El Niño at +0.5 °C or above, neutral in between.</p></div>`;
    const render = n => {
      detail.style.setProperty('--g', grad(n.pal));
      let h = `<p class="dz-path" style="--d:0ms">2020–2022 · ${TREE.v} test dates</p>`
        + `<h4 class="dz-title" style="--d:40ms"><i></i>${n.name}<span>${n.v} dates · ${n.note}</span></h4>`;
      if (n.data) {
        h += `<p class="dz-big" style="--d:90ms"><b>${n.gap}</b><span>15-day error against TAU, the strongest of fourteen</span></p>` + oni(n)
          + `<div class="seg seg-sm dz-seg" role="group" aria-label="Endpoint" style="--d:120ms">${METRICS.map(m => `<button type="button" data-m="${m.k}" aria-pressed="${m.k === metric}">${m.name} <i class="dir">${m.low ? '↓' : '↑'}</i></button>`).join('')}</div>`
          + `<ol class="dz-bars dz-mbars">${bars(n)}</ol>`;
      } else {
        const max = Math.max(...TROPICS.map(r => r.km));
        h += `<p class="dz-big" style="--d:90ms"><b>${n.gap}</b><span>15-day error against PredRNN-V2, tropical Pacific</span></p>` + oni(n)
          + `<p class="dz-sub" style="--d:120ms">Tropical Pacific · km below PredRNN-V2 in each phase <i class="dir" title="higher is better">↑</i></p>`
          + `<ol class="dz-bars dz-mbars dz-tbars">${TROPICS.map((r, i) => `<li class="${r.pal === n.pal ? 'us' : ''}" style="--w:${(100 * r.km / max).toFixed(1)}%;--d:${160 + i * 60}ms;--g:${grad(r.pal)}">`
            + `<span class="dz-name">${r.name}</span><b>−${r.km.toFixed(1)} km <small>(−${r.rel}%)</small></b><i></i></li>`).join('')}</ol>`
          + `<p class="dz-leaf" style="--d:360ms">ENSO swings eastern-Pacific eddy energy by 38%; HaiRuo's lead holds in every phase.</p>`;
      }
      detail.innerHTML = h;
      detail.classList.remove('in'); void detail.offsetWidth; detail.classList.add('in');
      $$('[data-m]', detail).forEach(b => b.addEventListener('click', () => {
        metric = b.dataset.m;
        $$('[data-m]', detail).forEach(x => x.setAttribute('aria-pressed', String(x === b)));
        $('.dz-bars', detail).innerHTML = bars(n);
      }));
    };

    // ---------- beam from the turned phase to the panel ----------
    const stacked = () => matchMedia('(max-width: 760px)').matches;
    const face = () => stacked() ? 180 : 90;      // the panel sits right of the ring, or below it
    const beamPts = () => {
      if (!sel) return null;
      const br = body.getBoundingClientRect(), sr = svg.getBoundingClientRect(), dr = detail.getBoundingClientRect(), s = sr.width / 240;
      const F = face(), half = Math.max(.8, Math.min((sel.a1 - sel.a0) / 2 - .6, 170)), R = PIN + 1;
      const at = deg => { const [x, y] = pt(R, deg); return [sr.left - br.left + x * s, sr.top - br.top + y * s]; };
      const wt = clamp((half - 30) / 60);
      const dir = (deg, sign) => {
        const a = deg * Math.PI / 180, r = [Math.sin(a), -Math.cos(a)], tg = [sign * Math.cos(a), sign * Math.sin(a)];
        const x = r[0] * (1 - wt) + tg[0] * wt, y = r[1] * (1 - wt) + tg[1] * wt, nn = Math.hypot(x, y) || 1;
        return [x / nn, y / nn];
      };
      const A = at(F - half), B = at(F + half), X1 = dr.left - br.left - 10;
      const TA = [X1, dr.top - br.top + 20], TB = [X1, Math.min(dr.bottom - br.top - 20, dr.top - br.top + 150)];
      return { A, B, r: R * s, half, da: dir(F - half, 1), db: dir(F + half, -1), TA, TB, w: br.width, h: br.height };
    };
    const drawBeam = animate => {
      if (stacked()) { beam.innerHTML = ''; return; }
      const q = beamPts(); if (!q) return;
      const [c0, c1] = PAL[sel.pal], P = p => `${f2(p[0])} ${f2(p[1])}`;
      const lim = y => Math.min(q.h - 6, Math.max(6, y));
      const ctrl = (S, d, T) => { const k = Math.hypot(T[0] - S[0], T[1] - S[1]) * .42; return [[S[0] + d[0] * k, lim(S[1] + d[1] * k)], [T[0] - k, T[1]]]; };
      const [a1, a2] = ctrl(q.A, q.da, q.TA), [b1, b2] = ctrl(q.B, q.db, q.TB);
      const cone = `M${P(q.A)}C${P(a1)} ${P(a2)} ${P(q.TA)}L${P(q.TB)}C${P(b2)} ${P(b1)} ${P(q.B)}A${f2(q.r)} ${f2(q.r)} 0 ${q.half * 2 > 180 ? 1 : 0} 0 ${P(q.A)}Z`;
      const up = `M${P(q.A)}C${P(a1)} ${P(a2)} ${P(q.TA)}`, dn = `M${P(q.B)}C${P(b1)} ${P(b2)} ${P(q.TB)}`;
      beam.setAttribute('viewBox', `0 0 ${f2(q.w)} ${f2(q.h)}`);
      beam.innerHTML = `<defs><linearGradient id="ez-beam-g" gradientUnits="userSpaceOnUse" x1="${f2(q.A[0])}" y1="${f2(q.A[1])}" x2="${f2(q.TB[0])}" y2="${f2(q.TB[1])}">`
        + `<stop offset="0" stop-color="${c0}" stop-opacity=".3"/><stop offset="1" stop-color="${c1}" stop-opacity=".04"/></linearGradient>`
        + `<linearGradient id="ez-ray-g" gradientUnits="userSpaceOnUse" x1="${f2(q.A[0])}" y1="${f2(q.A[1])}" x2="${f2(q.TA[0])}" y2="${f2(q.TA[1])}">`
        + `<stop offset="0" stop-color="${c0}" stop-opacity=".9"/><stop offset="1" stop-color="${c1}" stop-opacity=".25"/></linearGradient></defs>`
        + `<path class="cone" d="${cone}" fill="url(#ez-beam-g)"/>`
        + `<path class="ray" pathLength="1" d="${up}" stroke="url(#ez-ray-g)"/><path class="ray" pathLength="1" d="${dn}" stroke="url(#ez-ray-g)"/>`;
      beam.classList.remove('draw');
      if (animate) { void beam.getBoundingClientRect(); beam.classList.add('draw'); }
    };
    let beamTimer = 0;
    const select = n => {
      if (!isPart(n)) n = n.kids[0];
      sel = n;
      $$('[data-k]', legend).forEach(b => { if (isPart(b._n)) b.setAttribute('aria-pressed', String(b._n === n)); });
      const mid = (n.a0 + n.a1) / 2, target = face() - mid;
      turn += ((target - turn) % 360 + 540) % 360 - 180;
      dial.style.transform = `rotate(${f2(turn)}deg)`;
      beam.innerHTML = '';
      render(n); targets();
      clearTimeout(beamTimer);
      beamTimer = setTimeout(() => drawBeam(true), reduced ? 0 : 700);
    };
    new ResizeObserver(() => {
      if (!sel) return;
      const t = face() - (sel.a0 + sel.a1) / 2, d = ((t - turn) % 360 + 540) % 360 - 180;
      if (Math.abs(d) > .01) { turn += d; dial.style.transform = `rotate(${f2(turn)}deg)`; }
      drawBeam(false);
    }).observe(body);

    // ---------- legend ----------
    parents.forEach(p => {
      const g = document.createElement('div'); g.className = 'dz-group'; g.style.setProperty('--g', grad(p.pal));
      const h = document.createElement('button'); h.type = 'button'; h.className = 'dz-head'; h.dataset.k = ''; h._n = p;
      h.innerHTML = `<i></i>${p.name}<span>${p.v}</span>`;
      const chips = document.createElement('div'); chips.className = 'dz-chips';
      p.kids.forEach(n => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'dz-chip'; b.dataset.k = ''; b._n = n;
        b.style.setProperty('--g', grad(n.pal)); b.setAttribute('aria-pressed', 'false');
        b.innerHTML = `<i></i>${n.name}<span>${n.v}</span>`;
        chips.append(b);
      });
      g.append(h, chips); legend.append(g);
    });
    const wire = (elm, n) => {
      elm.addEventListener('pointerenter', e => { if (e.pointerType !== 'touch') hover(n); });
      elm.addEventListener('pointerleave', e => { if (e.pointerType !== 'touch') hover(null); });
      elm.addEventListener('focus', () => hover(n));
      elm.addEventListener('blur', () => hover(null));
      elm.addEventListener('click', () => select(n));
    };
    $$('[data-k]', legend).forEach(b => wire(b, b._n));
    [...parents, ...parts].forEach(n => wire(n.el, n));

    // ---------- start: the ring grows in, then El Nino turns to the panel ----------
    setCenter(); drawRing();
    const start = () => {
      introT0 = performance.now(); kick();
      setTimeout(() => { if (!sel) select(parts[0]); }, reduced ? 0 : 1250);
    };
    if (reduced) { grow = 1; drawRing(); select(parts[0]); }
    else {
      const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); start(); } }, { threshold: .3 });
      io.observe(ringBox);
    }
    host._dz = { select: name => select(parts.find(n => n.name === name) || parts[0]), finish: () => { grow = 1; [...parents, ...parts].forEach(n => { n.ro = n.tro; n.vro = 0; }); drawRing(); } };
  })();

  /* ---------- Architecture: inside one forecast (HaiRuo-1B + XuanJi, drawn natively, as the EZCAM page does for its policy) ----------
     Four bands, every label from the paper's method section: HaiRuo-1B's forward pass, XuanJi's object readout, the label-free
     pretraining (data, three objectives with their formulas) and the joint fine-tuning. The thumbnails are real: the held-out
     North Atlantic window of "In motion" (observed sea level, currents and atlas masks on day 0, HaiRuo's masks and tracks on
     days 1, 8, 15). One cycle lights the data path; the pretraining band keeps sampling tiles and masks on its own clock;
     dashed lines never move. */
  (function archDiagram() {
    const svg = $('#archh-svg'), card = $('#archh');
    if (!svg || !card) return;
    const T = (x, y, s, cls = '', anchor = 'start', parent = svg) => { const t = el('text', { x, y, class: cls, 'text-anchor': anchor }, parent); t.textContent = s; return t; };
    const R = (x, y, w, h, cls, rx = 4, parent = svg) => el('rect', { x: +x.toFixed(2), y: +y.toFixed(2), width: +w.toFixed(2), height: +h.toFixed(2), rx, class: cls }, parent);
    const G = (cls, parent = svg) => el('g', cls ? { class: cls } : {}, parent);
    const MT = (x, y, src, cls = 'ah-math', anchor = 'start', parent = svg) => {   // math with _{sub} and ^{sup}
      const t = el('text', { x, y, class: cls, 'text-anchor': anchor }, parent);
      let shift = 0;
      src.split(/(_\{[^}]*\}|\^\{[^}]*\})/).forEach(p => {
        if (!p) return;
        const m = p.match(/^([_^])\{(.*)\}$/), ts = el('tspan', {}, t);
        if (m) { const d = m[1] === '_' ? 4 : -6; ts.setAttribute('dy', d - shift); shift = d; ts.setAttribute('font-size', '72%'); ts.textContent = m[2]; }
        else { if (shift) { ts.setAttribute('dy', -shift); shift = 0; } ts.textContent = p; }
      });
      return t;
    };
    const box = (x, y, w, h, title, tag, cls = 'ah-box') => { R(x, y, w, h, cls, 14); T(x + 16, y + 28, title, 'ah-t'); return tag ? T(x + w - 14, y + 28, tag, 'ah-tag', 'end') : null; };
    const pill = (x, y, s, cls = 'ah-pill') => { const w = s.length * 5.9 + 14; R(x, y - 14, w, 20, cls, 10); T(x + 7, y, s, 'ah-pill-t'); return x + w + 6; };
    const arrow = (d, cls = 'ah-ar') => el('path', { d, class: cls }, svg);
    const img = (x, y, w, h, label) => { const g = G('ah-img'); R(x, y, w, h, 'ah-ph', 6, g); const im = el('image', { x, y, width: w, height: h, preserveAspectRatio: 'none', class: 'ah-pic' }, g); R(x, y, w, h, 'ah-frame', 6, g); if (label) T(x + 6, y + 14, label, 'ah-on', 'start', g); g._im = im; return g; };
    const defs = el('defs', {}, svg);
    defs.innerHTML = '<marker id="ahh" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" fill="#8ea2b9"/></marker>'
      + '<marker id="ahv" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" fill="#c4b3ff"/></marker>'
      + '<marker id="ahw" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" fill="#ff8a5c"/></marker>'
      + '<linearGradient id="ahbb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d2f68"/><stop offset="1" stop-color="#11224a"/></linearGradient>'
      + '<linearGradient id="ahxj" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1b1f52"/><stop offset="1" stop-color="#2a1a4f"/></linearGradient>'
      + '<linearGradient id="ahstroke" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#4fd1ff"/><stop offset=".6" stop-color="#7a8cff"/><stop offset="1" stop-color="#d48cff"/></linearGradient>'
      + '<radialGradient id="ahwarm"><stop offset="0" stop-color="#ff8a5c" stop-opacity=".55"/><stop offset="1" stop-color="#ff8a5c" stop-opacity="0"/></radialGradient>'
      + '<radialGradient id="ahcold"><stop offset="0" stop-color="#40d6ff" stop-opacity=".5"/><stop offset="1" stop-color="#40d6ff" stop-opacity="0"/></radialGradient>';

    // ================= band 1: HaiRuo-1B, one forward pass =================
    T(24, 34, 'Inference · HaiRuo-1B', 'ah-row');
    // A1. 30 days of altimetry, 10 channels (real thumbnails of day 0)
    box(24, 46, 206, 266, 'Altimetry', '30 days × 10 ch');
    const cards = [img(40, 84, 96, 96, 'masks'), img(62, 98, 96, 96, '|u|'), img(84, 112, 96, 96, 'SLA')];
    R(84, 112, 96, 96, 'ah-now', 6);
    T(186, 206, 't', 'ah-tag');
    const days = [];
    for (let i = 0; i < 30; i++) days.push(R(40 + i * 6.2, 226, 4.6, 16, 'ah-day' + (i >= 23 ? ' exp' : ''), 1.5));
    el('path', { d: 'M40 248 L40 252 L180.6 252 L180.6 248', class: 'ah-brace lav' }, svg);
    el('path', { d: 'M182.6 248 L182.6 252 L224 252 L224 248', class: 'ah-brace sky' }, svg);
    T(40, 268, '23 days → 8 slots', 'ah-tag ah-lav');
    T(224, 268, '7 explicit', 'ah-tag ah-sky', 'end');
    // A2. spherical stem and dual-rate time
    box(244, 46, 186, 266, 'Spherical stem', 'patch 4');
    const toks = [];
    for (let i = 0; i < 81; i++) { const r = R(258 + (i % 9) * 13.4, 84 + Math.floor(i / 9) * 13.4, 10.6, 10.6, 'ah-tok', 2); r.style.setProperty('--i', (i % 9) + Math.floor(i / 9)); toks.push(r); }
    T(384, 100, '0.5°', 'ah-tag'); T(384, 116, 'tokens', 'ah-tag'); T(384, 180, 'quality', 'ah-tag'); T(384, 194, 'gate', 'ah-tag');
    T(258, 224, 'Dual-rate time', 'ah-m2');
    const steps = [];
    for (let i = 0; i < 15; i++) steps.push(R(258 + i * 10.8, 234, 8, 24, 'ah-step' + (i >= 8 ? ' exp' : ''), 2));
    T(258, 276, '8 slots + 7 days = 15 steps', 'ah-tag');
    // A3. the backbone: three-level pyramid, 36 eddy-focused blocks
    R(444, 46, 336, 266, 'ah-box ah-bb', 14); T(460, 74, 'HaiRuo-1B', 'ah-t'); T(766, 74, '1.05 B parameters', 'ah-tag', 'end');
    const levels = [[], [], []];
    [[6, 6], [10, 4], [20, 3]].forEach(([n, gap], lv) => {
      const y = 88 + lv * 40, w = (218 - (n - 1) * gap) / n;
      T(460, y + 19, ['0.5°', '1°', '2°'][lv], 'ah-tag');
      for (let i = 0; i < n; i++) levels[lv].push(R(500 + i * (w + gap), y, w, 26, 'ah-blk', 3));
      T(766, y + 19, '×' + n, 'ah-tag', 'end');
      if (lv) arrow(`M486 ${y - 12} L486 ${y - 2}`, 'ah-ar ah-small');
    });
    let x = 460; ['shifted windows', 'vorticity focus', 'day-age QKV'].forEach(s => { x = pill(x, 236, s); });
    x = 460; ['core–ring deformable', 'chirality-gated'].forEach(s => { x = pill(x, 259, s); });
    x = 460; ['longitude-periodic'].forEach(s => { x = pill(x, 282, s); });
    // A4. field decoder: 240 route-memory tokens and global latents, residuals from the last day
    box(794, 46, 186, 266, 'Field decoder', '');
    const dots = [];
    for (let i = 0; i < 240; i++) dots.push(el('circle', { cx: 810 + (i % 20) * 7.7, cy: 86 + Math.floor(i / 20) * 7.7, r: 1.9, class: 'ah-dot' }, svg));
    T(810, 190, '240 route-memory tokens', 'ah-tag');
    const lat = []; for (let i = 0; i < 8; i++) lat.push(R(810 + i * 19, 200, 15, 10, 'ah-lat', 2));
    T(810, 226, 'global latents', 'ah-tag');
    MT(810, 262, 'F̂_{l} = F_{0} + δ_{l} ⊙ r_{l}', 'ah-math ah-big');
    T(810, 286, 'starts as persistence', 'ah-tag');
    // A5. the forecast: six fields × fifteen leads
    box(994, 46, 206, 266, 'Forecast', '6 fields × 15 days');
    const FCOL = ['#64d2ff', '#64d2ff', '#b3a6f0', '#b3a6f0', '#9fe3c3', '#9fe3c3'];
    const fc = [];
    ['SLA', 'ADT', 'u′', 'v′', 'u', 'v'].forEach((name, r) => {
      T(1008, 100 + r * 25, name, 'ah-tag');
      for (let c = 0; c < 15; c++) { const cell = R(1036 + c * 10.6, 86 + r * 25, 8, 19, 'ah-fc', 2); cell.style.setProperty('--c', FCOL[r]); (fc[c] = fc[c] || []).push(cell); }
    });
    T(1036, 250, 'day 1', 'ah-tag'); T(1192, 250, '15', 'ah-tag', 'end');
    T(1008, 280, 'one forward pass', 'ah-tag');
    [[230, 244], [430, 444], [780, 794], [980, 994]].forEach(([a, b]) => arrow(`M${a} 180 L${b} 180`));
    arrow('M1097 312 L1097 328 L210 328 L210 354');
    el('path', { d: 'M612 312 L612 328', class: 'ah-ar ah-nohead' }, svg);
    MT(628, 323, 'F̂_{l} and per-lead features Z_{l}', 'ah-math ah-small-m');
    const courier = R(0, 0, 14, 14, 'ah-cour', 3);

    // ================= band 2: XuanJi, eddies as objects =================
    T(24, 346, 'Inference · XuanJi', 'ah-row');
    // B1. spatial stem
    R(24, 358, 206, 254, 'ah-box ah-xj', 14); T(40, 386, 'Spatial stem', 'ah-t'); T(216, 386, 'stride 4', 'ah-tag', 'end');
    const ins = [['7 days altimetry', 'sky'], ['past masks', 'warm'], ['ocean mask', 'grey'], ['forecast F̂', 'sky'], ['features Z', 'lav']].map(([s, k], i) => {
      const y = 400 + i * 25; const r = R(36, y, 182, 20, 'ah-chip ' + k, 6); T(46, y + 14, s, 'ah-chip-t'); return r;
    });
    const feat = [0, 1, 2].map(i => R(70 + i * 12, 548 - i * 9, 70, 44, 'ah-feat', 6));
    T(160, 580, 'per lead', 'ah-tag');
    // B2. three heads
    R(244, 358, 186, 254, 'ah-box ah-xj', 14); T(260, 386, 'Three heads', 'ah-t'); T(416, 386, 'zero-init', 'ah-tag', 'end');
    const heads = [['Fields', 'residual'], ['Masks', 'refined'], ['Proposal', 'GRU']].map(([s, tag], i) => {
      const y = 398 + i * 70; const r = R(256, y, 162, 62, 'ah-mini', 10); T(268, y + 19, s, 'ah-m2'); T(406, y + 19, tag, 'ah-tag', 'end'); return r;
    });
    const headFields = []; for (let i = 0; i < 11; i++) { const c = R(268 + i * 13.4, 424, 10.4, 16, 'ah-fc', 2); c.style.setProperty('--c', '#64d2ff'); headFields.push(c); }
    const headMasks = []; [0, 1, 0, 2, 2, 0, 1, 0, 2, 0, 1].forEach((k, i) => headMasks.push(R(268 + i * 13.4, 494, 10.4, 16, 'ah-mk k' + k, 2)));
    const prop = el('path', { d: 'M272 578 L404 560', class: 'ah-prop' }, svg);
    el('circle', { cx: 272, cy: 578, r: 3.5, class: 'ah-core' }, svg);
    // B3. object attention
    R(444, 358, 536, 254, 'ah-box ah-xj', 14); T(460, 386, 'Object attention', 'ah-t');
    const roundTag = T(966, 386, 'round 1 of 3', 'ah-tag ah-round', 'end');
    R(456, 398, 204, 168, 'ah-field', 12);
    el('ellipse', { cx: 532, cy: 500, rx: 92, ry: 58, fill: 'url(#ahwarm)' }, svg);
    el('ellipse', { cx: 620, cy: 436, rx: 70, ry: 48, fill: 'url(#ahcold)' }, svg);
    const P0 = [472, 536], P1 = [644, 476];
    el('path', { d: `M${P0[0]} ${P0[1]} L${P1[0]} ${P1[1]}`, class: 'ah-cv' }, svg);
    const pathK = el('path', { d: '', class: 'ah-path' }, svg);
    const RADII = [2.5, 5, 7.5, 10, 15];
    const rings = [1, 8, 15].map(l => {
      const gr = G('ah-ring');
      RADII.forEach(r => { el('circle', { r, class: 'ah-rc' }, gr); for (let a = 0; a < 16; a++) { const t = a / 16 * 2 * Math.PI; el('circle', { cx: (r * Math.cos(t)).toFixed(2), cy: (r * Math.sin(t)).toFixed(2), r: .8, class: 'ah-az' }, gr); } });
      el('circle', { r: 2.6, class: 'ah-core' }, gr); gr._l = l; return gr;
    });
    T(456, 590, '5 rings × 16 azimuths, co-moving', 'ah-tag');
    const WARM = '#ff8a5c', VIO = '#a58cff';
    const arcd = (cx, cy, r, a0, a1) => { const p = a => [cx + r * Math.cos(a), cy + r * Math.sin(a)]; const [x0, y0] = p(a0), [x1, y1] = p(a1); return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`; };
    const modes = [[[0, 2 * Math.PI - .001, WARM]], [[-Math.PI / 2, Math.PI / 2, WARM], [Math.PI / 2, 3 * Math.PI / 2, VIO]], [0, 1, 2, 3].map(q => [q * Math.PI / 2 - Math.PI / 4, (q + 1) * Math.PI / 2 - Math.PI / 4, q % 2 ? VIO : WARM])].map((segs, m) => {
      const gr = G('ah-mode'), cx = 692 + m * 44, cy = 410;
      el('circle', { cx, cy, r: 12, class: 'ah-mbg' }, gr);
      segs.forEach(([a0, a1, c]) => el('path', { d: arcd(cx, cy, 12, a0, a1), stroke: c, class: 'ah-mseg' }, gr));
      T(cx, cy + 28, ['mean', 'dipole', 'strain'][m], 'ah-tag', 'middle', gr);
      return gr;
    });
    const ltoks = [], atts = [];
    for (let i = 0; i < 15; i++) ltoks.push(R(676 + i * 18, 474, 13, 18, 'ah-lt', 3));
    [[0, 7], [3, 14], [7, 14], [1, 10], [5, 12]].forEach(([a, b]) => { const xa = 682.5 + a * 18, xb = 682.5 + b * 18, h = 5 + (b - a) * .9; atts.push(el('path', { d: `M${xa} 472 Q ${(xa + xb) / 2} ${472 - 2 * h} ${xb} 472`, class: 'ah-att' }, svg)); });
    T(966, 430, '15 lead tokens', 'ah-tag ah-vio', 'end');
    const REFN = ['rings', 'orbit', 'life cycle', 'core–outer'];
    const refs = ['g₁', 'g₂', 'g₃', 'g₄'].map((s, i) => { const r = R(676 + i * 64, 506, 56, 18, 'ah-ref', 5); T(704 + i * 64, 519, s, 'ah-ref-t', 'middle'); T(704 + i * 64, 538, REFN[i], 'ah-tag', 'middle'); return r; });
    el('circle', { cx: 952, cy: 515, r: 11, class: 'ah-mu' }, svg); T(952, 519, 'μ', 'ah-mu-t', 'middle');
    T(952, 498, 'Δv', 'ah-m2', 'middle'); T(952, 542, 'ω = ¼', 'ah-tag', 'middle');
    MT(676, 566, 'p̂^{(k+1)} = p̂^{(0)} ⊕ K⁄(k+1) · D^{(k+1)}', 'ah-math');
    el('path', { d: 'M952 527 L952 578 L669 578 L669 482 L663 482', class: 'ah-loop' }, svg);
    T(676, 598, 'K = 3 look-ahead rounds', 'ah-tag ah-vio');
    // B4. outputs (real: HaiRuo's masks and tracks on days 1, 8, 15)
    R(994, 358, 206, 254, 'ah-box ah-xj', 14); T(1010, 386, 'Outputs', 'ah-t'); T(1186, 386, 'one pass', 'ah-tag', 'end');
    const outs = [1, 8, 15].map((d, i) => { const g = img(1008 + i * 62, 398, 56, 56, ''); T(1036 + i * 62, 468, 'day ' + d, 'ah-tag', 'middle'); g._d = d; return g; });
    T(1008, 490, 'masks + tracks', 'ah-tag');
    const outF = []; for (let r = 0; r < 6; r++) for (let c = 0; c < 15; c++) { const cell = R(1008 + c * 12, 502 + r * 7, 9.6, 5, 'ah-fc', 1.5); cell.style.setProperty('--c', FCOL[r]); cell._c = c; outF.push(cell); }
    T(1008, 562, 'fields', 'ah-tag');
    [[230, 244], [430, 444], [980, 994]].forEach(([a, b]) => arrow(`M${a} 485 L${b} 485`));

    // ================= band 3: pretraining HaiRuo-1B without labels =================
    T(24, 644, 'Pretraining · HaiRuo-1B, no labels', 'ah-row');
    // P0. the data: every daily window of 24 years, an area-uniform random tile on the globe
    box(24, 656, 206, 226, '24 years of maps', '');
    R(38, 694, 178, 89, 'ah-globe', 6);
    for (let i = 1; i < 6; i++) el('line', { x1: 38 + i * 178 / 6, x2: 38 + i * 178 / 6, y1: 694, y2: 783, class: 'ah-grat' }, svg);
    for (let i = 1; i < 3; i++) el('line', { x1: 38, x2: 216, y1: 694 + i * 89 / 3, y2: 694 + i * 89 / 3, class: 'ah-grat' }, svg);
    const tile = R(90, 714, 31.6, 31.6, 'ah-tile', 3);
    T(38, 810, '8,722 windows, 1993–2016', 'ah-tag');
    T(38, 828, 'random 512² tiles', 'ah-tag');
    T(38, 864, '93 epochs · batch 64', 'ah-m2');
    // P1. future prediction
    box(244, 656, 300, 226, 'Future prediction', 'all 15 leads');
    [0, 1, 2].forEach(i => R(260 + i * 6, 694 + i * 6, 50, 50, 'ah-day exp on', 5));
    T(285, 772, '30 days', 'ah-tag', 'middle');
    arrow('M334 723 L356 723');
    const fut = []; for (let l = 0; l < 15; l++) { const r = R(362 + l * 11.4, 694, 9, 62, 'ah-futl', 2); r.style.setProperty('--o', (1 - l / 20).toFixed(2)); fut.push(r); }
    T(362, 772, 'day 1', 'ah-tag'); T(530, 772, '15', 'ah-tag', 'end');
    MT(260, 808, 'ℒ_{fut} = Σ_{l} w_{A} · Huber((F̂_{l} − F_{l}) ⁄ δ_{l})', 'ah-math');
    T(260, 834, 'area-weighted, every lead', 'ah-tag');
    // P2. multi-axis masked reconstruction
    box(558, 656, 300, 226, 'Masked reconstruction', 'swath-aware');
    const mk = { tok: [], day: [], ch: [] };
    for (let i = 0; i < 30; i++) { const hid = [2, 7, 9, 13, 16, 20, 22, 27, 4, 25, 11, 18].includes(i); const r = R(572 + (i % 6) * 13, 694 + Math.floor(i / 6) * 13, 10.6, 10.6, 'ah-tk' + (hid ? ' m' : ''), 2); mk.tok.push(r); }
    for (let d = 0; d < 7; d++) for (let r = 0; r < 5; r++) { const c = R(668 + d * 12, 694 + r * 13, 9.6, 10.6, 'ah-tk' + (d === 4 ? ' m' : ''), 2); mk.day.push(c); }
    for (let c = 0; c < 5; c++) { const r = R(764 + 0, 694 + c * 13, 80, 10.6, 'ah-tk' + (c === 2 ? ' m' : ''), 2); mk.ch.push(r); }
    const mkLab = [T(610, 778, '40% tokens', 'ah-tag', 'middle'), T(706, 778, '≤ 15% days', 'ah-tag', 'middle'), T(804, 778, '≤ 20% channels', 'ah-tag', 'middle')];
    const mkGroups = [mk.tok, mk.day, mk.ch];
    MT(572, 808, 'ρ_{tok} = 0.40 · ρ_{day} ≤ 0.15 · ρ_{ch} ≤ 0.20', 'ah-math');
    T(572, 834, 'tokens, whole days, whole variables', 'ah-tag');
    // P3. geostrophic flow-advected contrast (real: day 0 and day 1 of the window)
    box(872, 656, 328, 226, 'Flow-aligned contrast', 'InfoNCE');
    const cIm = [img(888, 692, 100, 100, 'day t'), img(1012, 692, 100, 100, 'day t+1')];
    const posA = R(921, 725, 18, 18, 'ah-pos', 3), posB = R(1050, 718, 18, 18, 'ah-pos', 3);
    const negs = [[1028, 700], [1086, 758], [1020, 768], [1090, 706]].map(([a, b]) => R(a, b, 12, 12, 'ah-neg', 2));
    el('path', { d: 'M939 744 C 965 790, 1020 790, 1050 736', class: 'ah-flowc', 'marker-end': 'url(#ahw)' }, svg);
    T(1124, 720, 'positive:', 'ah-tag ah-warm'); T(1124, 734, 'moved by', 'ah-tag'); T(1124, 748, 'the current', 'ah-tag');
    T(1124, 778, 'negatives', 'ah-tag ah-dim');
    MT(888, 824, 'p̃_{t+1} = Exp_{pₜ}(u_{g}(pₜ) Δt)', 'ah-math');
    MT(888, 852, 'ℒ_{con} = −log exp(s^{+}⁄τ) ⁄ Σ exp(s⁄τ)', 'ah-math');

    // ================= band 4: joint fine-tuning with XuanJi =================
    T(24, 914, 'Fine-tuning · with XuanJi', 'ah-row');
    R(24, 926, 1176, 118, 'ah-box', 14);
    T(40, 954, 'Joint training', 'ah-t'); T(1186, 954, '1,024 labelled windows', 'ah-tag', 'end');
    const losses = [['sky', 'Fields', 'Huber(F̂_{l} − F_{l})', 'six fields, 15 leads'], ['warm', 'Masks', 'focal–Dice + boundary + soft-Jaccard', '3 classes, 15 days'], ['vio', 'Tracks', 'smooth-ℓ_{1}(p̂ − p) + smooth-ℓ_{1}(Δp̂ − Δp)', 'positions and daily steps']].map(([k, s, f, tag], i) => {
      const x0 = 40 + i * 384; const r = R(x0, 968, 368, 60, 'ah-loss ' + k, 10);
      el('circle', { cx: x0 + 18, cy: 988, r: 5, class: 'ah-ldot ' + k }, svg); T(x0 + 32, 992, s, 'ah-m2'); T(x0 + 356, 992, tag, 'ah-tag', 'end');
      MT(x0 + 18, 1016, f, 'ah-math'); return r;
    });

    // ================= real thumbnails from the held-out window =================
    const SX = 40, SY = 150, SZ = 128;   // Gulf Stream crop of the North Atlantic tile, data pixels
    const mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
    const SEA_N = [[244, 246, 251], [74, 155, 216], [29, 63, 143]], SEA_P = [[244, 246, 251], [240, 138, 91], [163, 23, 45]];
    const seaCol = g => { const s = (g - 127.5) / 127.5, a = Math.min(1, Math.abs(s) * 1.6), st = s < 0 ? SEA_N : SEA_P; return a < .5 ? mix(st[0], st[1], a / .5) : mix(st[1], st[2], (a - .5) / .5); };
    const toURL = (n, fn) => { const c = document.createElement('canvas'); c.width = c.height = n; const o = c.getContext('2d'), im = o.createImageData(n, n); for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const v = fn(x, y), k = (y * n + x) * 4; im.data[k] = v[0]; im.data[k + 1] = v[1]; im.data[k + 2] = v[2]; im.data[k + 3] = 255; } o.putImageData(im, 0, 0); return c; };
    const LAND = [26, 42, 64];
    let thumbsDone = false;
    async function thumbs() {
      if (thumbsDone) return; thumbsDone = true;
      const D = await WIN.load(), S = WIN.S;
      const at = (d, x, y) => (SY + y) * S + SX + x;
      const sla = d => toURL(SZ, (x, y) => D.MK[d][at(d, x, y)] >= 9 ? LAND : seaCol(D.SLA[d][at(d, x, y)])).toDataURL();
      const atlas = toURL(SZ, (x, y) => { const c = D.MK[0][at(0, x, y)]; return c >= 9 ? LAND : [[13, 35, 64], [64, 214, 255], [255, 138, 92]][c % 3]; }).toDataURL();
      cards[2]._im.setAttribute('href', sla(0)); cards[0]._im.setAttribute('href', atlas);
      cIm[0]._im.setAttribute('href', sla(0)); cIm[1]._im.setAttribute('href', sla(1));
      outThumbs(D, at);
      const fl = new Image(); await new Promise(r => { fl.onload = fl.onerror = r; fl.src = 'assets/data/flow_t0.png'; setTimeout(r, 8000); });
      if (fl.naturalWidth) {
        const c = document.createElement('canvas'); c.width = c.height = 256; const o = c.getContext('2d', { willReadFrequently: true }); o.drawImage(fl, 0, 0);
        const px = o.getImageData(SX / 2, SY / 2, SZ / 2, SZ / 2).data;
        cards[1]._im.setAttribute('href', toURL(SZ / 2, (x, y) => { const k = (y * SZ / 2 + x) * 4; if (!px[k + 2]) return LAND; const sp = Math.hypot((px[k] - 128) / 127 * 2, (px[k + 1] - 128) / 127 * 2), t = Math.min(1, sp / 1.1); return t < .5 ? mix([8, 24, 52], [38, 150, 190], t / .5) : mix([38, 150, 190], [235, 250, 255], (t - .5) / .5); }).toDataURL());
      }
    }
    function outThumbs(D, at) {
      outs.forEach(g => {   // HaiRuo's masks on that day + its forecast tracks up to that day
        const d = g._d, c = toURL(SZ, (x, y) => { const v = D.MK[d][at(d, x, y)]; if (v >= 9) return LAND; const p = Math.floor(v / 3) % 3; return [[10, 30, 58], [40, 170, 215], [222, 112, 78]][p]; });
        const o = c.getContext('2d'); o.lineWidth = 1.4; o.strokeStyle = 'rgba(255,255,255,.95)'; o.fillStyle = '#fff';
        for (let i = 0; i < D.nE; i++) {
          if (!WIN.alive(i, 0)) continue;
          const P = j => [D.T[i * 64 + j * 4 + 2] / 8 - SX, D.T[i * 64 + j * 4 + 3] / 8 - SY];
          const [x0, y0] = P(0); if (x0 < 0 || y0 < 0 || x0 > SZ || y0 > SZ) continue;
          o.beginPath(); o.moveTo(x0, y0); for (let j = 1; j <= d; j++) { const [a, b] = P(j); o.lineTo(a, b); } o.stroke();
          const [a, b] = P(d); o.beginPath(); o.arc(a, b, 1.8, 0, 6.2832); o.fill();
        }
        g._im.setAttribute('href', c.toDataURL());
      });
    }

    // ================= the cycle =================
    const STOP = {};
    let running = false, id = 0;
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const on = (list, v = true) => list.forEach(n => n.classList.toggle('on', v));
    const lerp = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
    const refined = (l, f) => { const p = lerp(P0, P1, l / 15); return [p[0] - 6 * f * l / 15, p[1] - 34 * f * Math.sin(Math.PI * l / 30)]; };
    const drawPath = f => {
      const pts = []; for (let l = 0; l <= 15; l++) pts.push(refined(l, f));
      pathK.setAttribute('d', 'M' + pts.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L'));
      rings.forEach(r => { const p = refined(r._l, f); r.setAttribute('transform', `translate(${p[0].toFixed(1)} ${p[1].toFixed(1)})`); });
    };
    const ROUTE = [[1097, 312], [1097, 328], [210, 328], [210, 354]];
    const RL = [0]; for (let i = 1; i < ROUTE.length; i++) RL.push(RL[i - 1] + Math.hypot(ROUTE[i][0] - ROUTE[i - 1][0], ROUTE[i][1] - ROUTE[i - 1][1]));
    const place = k => { let s = k * RL[RL.length - 1], i = 1; while (i < ROUTE.length - 1 && RL[i] < s) i++; const p = lerp(ROUTE[i - 1], ROUTE[i], (s - RL[i - 1]) / (RL[i] - RL[i - 1] || 1)); courier.setAttribute('x', (p[0] - 7).toFixed(1)); courier.setAttribute('y', (p[1] - 7).toFixed(1)); };
    const reset = () => {
      [cards, days, toks, steps, ...levels, dots, lat, ...fc, ins, feat, heads, headFields, headMasks, modes, ltoks, atts, refs, outs, outF].forEach(l => on(l, false));
      prop.classList.remove('on'); courier.classList.remove('on'); rings.forEach(r => r.classList.remove('on'));
      roundTag.textContent = 'round 1 of 3'; drawPath(0);
    };
    const finalState = () => {
      on(cards); on(days); on(steps); on(toks); on(levels.flat()); on(lat); fc.forEach(c => on(c)); on(ins); on(feat); on(heads); on(headFields); on(headMasks);
      prop.classList.add('on'); drawPath(1); rings.forEach(r => r.classList.add('on')); on(modes); on(ltoks); on(atts); on(refs);
      on(outs); on(outF); courier.classList.remove('on'); roundTag.textContent = 'refined path';
    };
    async function cycle() {
      const my = ++id;
      const step = async ms => { await wait(ms); if (!running || my !== id) throw STOP; };
      const tween = (ms, fn) => new Promise((res, rej) => { const t0 = performance.now(); const f = now => { if (!running || my !== id) return rej(STOP); const k = clamp((now - t0) / ms); fn(ease(k)); if (k < 1) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
      try {
        for (;;) {
          reset();
          for (const c of cards) { c.classList.add('on'); await step(180); }
          for (let i = 0; i < 30; i++) { days[i].classList.add('on'); await step(32); }
          on(steps.slice(0, 8)); await step(220); on(steps.slice(8)); await step(160);
          on(toks); await step(900);
          for (const lv of [0, 1, 2, 1, 0]) { on(levels[lv]); await step(300); on(levels[lv], false); }
          on(levels.flat());
          for (let i = 0; i < 6; i++) { dots.forEach(d => d.classList.toggle('on', Math.random() < .3)); await step(110); }
          on(dots, false); on(lat); await step(200);
          for (let c = 0; c < 15; c++) { on(fc[c]); await step(70); }
          courier.classList.add('on'); await tween(1100, place); courier.classList.remove('on');
          for (const c of ins) { c.classList.add('on'); await step(110); }
          on(feat); await step(300);
          heads[0].classList.add('on'); on(headFields); await step(320);
          heads[1].classList.add('on'); on(headMasks); await step(320);
          heads[2].classList.add('on'); prop.classList.add('on'); await step(420);
          for (let k = 1; k <= 3; k++) {
            roundTag.textContent = `round ${k} of 3`;
            rings.forEach(r => r.classList.add('on')); await step(260);
            for (const m of modes) { m.classList.add('on'); await step(140); }
            for (const t of ltoks) { t.classList.add('on'); await step(22); }
            on(atts); await step(200);
            for (const r of refs) { r.classList.add('on'); await step(90); }
            const f0 = [0, .55, .85][k - 1], f1 = [.55, .85, 1][k - 1];
            await tween(700, e => drawPath(f0 + (f1 - f0) * e));
            await step(200);
            on(modes, false); on(ltoks, false); on(atts, false); on(refs, false); rings.forEach(r => r.classList.remove('on'));
          }
          roundTag.textContent = 'refined path';
          for (const g of outs) { g.classList.add('on'); await step(260); }
          for (let c = 0; c < 15; c++) { outF.filter(x => x._c === c).forEach(x => x.classList.add('on')); await step(40); }
          await step(2800);
        }
      } catch (e) { if (e !== STOP) throw e; }
    }
    // the pretraining band on its own clock: a new random tile, the next kind of mask, the next loss
    let pk = 0;
    const bandTick = () => {
      tile.setAttribute('x', (38 + Math.random() * (178 - 31.6)).toFixed(1));
      tile.setAttribute('y', (694 + 4 + Math.random() * (89 - 31.6 - 8)).toFixed(1));
      mkGroups.forEach((g, i) => g.forEach(r => r.classList.toggle('show', i === pk % 3)));
      mkLab.forEach((t, i) => t.classList.toggle('ah-hot', i === pk % 3));
      losses.forEach((c, i) => c.classList.toggle('on', i === pk % 3));
      pk++;
    };
    let bandTimer = 0;
    function start() { if (running || reduced) return; running = true; card.classList.remove('paused'); thumbs(); cycle(); bandTick(); bandTimer = setInterval(bandTick, 1500); }
    function stop() { running = false; id++; card.classList.add('paused'); clearInterval(bandTimer); }
    drawPath(0);
    if (reduced) { finalState(); bandTick(); new IntersectionObserver((e, o) => { if (e[0].isIntersecting) { thumbs(); o.disconnect(); } }).observe(card); }
    else {
      new IntersectionObserver(e => { if (e[0].isIntersecting && !document.hidden) start(); else stop(); }, { threshold: .1 }).observe(card);
      document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
    }
    card._ah = { finalState, start, stop, thumbs };
  })();

  /* ---------- Leaderboard (Table 1, three-seed means) ---------- */
  const BOARD = [
    ['HaiRuo', [25.20, 22.74, 27.64], 'us'],
    ['PredRNN-V2', [30.58, 27.53, 33.61]],
    ['PhyDNet', [30.59, 27.54, 33.63]],
    ['TAU', [30.64, 27.73, 33.52]],
    ['SimVPv2/gSTA', [30.85, 27.91, 33.77]],
    ['SimVP', [30.96, 28.11, 33.80]],
    ['U-Net', [31.00, 28.09, 33.88]],
    ['ConvLSTM', [31.19, 28.24, 34.13]],
    ['EddyNet', [32.88, 30.27, 35.47]],
    ['PredFormer', [33.20, 30.56, 35.82]],
    ['Earthformer', [33.41, 30.38, 36.43]],
    ['LSTM+Informer', [34.05, 31.21, 36.89], 'trk'],
    ['SwinLSTM-B', [34.28, 31.53, 37.02]],
    ['FNO-2d', [34.90, 32.14, 37.65]],
    ['Track Transformer', [36.66, 34.05, 39.24], 'trk']
  ];
  const board = $('#board');
  const SCALE = 42;
  board.innerHTML = BOARD.map(([name, v, cls], i) =>
    `<div class="brow${cls ? ' ' + cls : ''}" style="--i:${i}"><span>${name}${cls === 'trk' ? ' <small>tracks</small>' : ''}</span><div class="track"><i class="fill" style="--w:${(v[0] / SCALE * 100).toFixed(2)}"></i></div><b>${v[0].toFixed(2)}</b></div>`).join('');
  const rows = $$('.brow', board);
  function setRegion(k) {
    rows.forEach((r, i) => {
      const v = BOARD[i][1][k];
      $('.fill', r).style.setProperty('--w', (v / SCALE * 100).toFixed(2));
      $('b', r).textContent = v.toFixed(2);
    });
    $$('[data-region]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.region) === k)));
  }
  $$('[data-region]').forEach(b => b.addEventListener('click', () => setRegion(Number(b.dataset.region))));
  new IntersectionObserver((e, o) => { if (e[0].isIntersecting) { requestAnimationFrame(() => board.classList.remove('pre')); o.disconnect(); } }, { threshold: 0.2 }).observe(board);

  /* ---------- Gain ladder by backbone scale (Table 3, top) ---------- */
  const ladder = $('#scale-ladder');
  if (ladder) {
    const M = {
      field: { vals: [0.014, 0.059, 0.095, 0.141], max: 0.15, lab: v => '+' + v.toFixed(3), ticks: ['0', '+0.05', '+0.10', '+0.15'], note: '0 = decoder alone (field skill 0.63).' },
      miou: { vals: [0.06, 0.34, 0.51, 1.09], max: 1.2, lab: v => '+' + v.toFixed(2), ticks: ['0', '+0.4', '+0.8', '+1.2 pts'], note: '0 = decoder alone. mIoU points.' },
      d15: { vals: [0.04, -0.06, -0.45, -1.19], max: 1.2, lab: v => (v > 0 ? '+' : '−') + Math.abs(v).toFixed(2) + ' km', ticks: ['0', '−0.4', '−0.8', '−1.2 km'], note: '0 = decoder alone (25.07 km).' }
    };
    const lrows = $$('.gl-row', ladder), ticks = $$('#gl-ticks span'), note = $('#gl-note');
    const setMetric = key => {
      const m = M[key];
      lrows.forEach((r, i) => {
        const v = m.vals[i], g = key === 'd15' ? -v : v, bar = $('i', r);
        bar.classList.toggle('neg', g < 0);
        bar.style.setProperty('--g', Math.min(1, Math.abs(g) / m.max).toFixed(4));
        $('b', r).textContent = m.lab(v);
      });
      ticks.forEach((s, i) => { s.textContent = m.ticks[i]; });
      note.textContent = m.note;
      $$('[data-metric]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.metric === key)));
    };
    $$('[data-metric]').forEach(b => b.addEventListener('click', () => setMetric(b.dataset.metric)));
    setMetric('field');
  }

  /* ---------- Glints over the star chart ---------- */
  const glints = $('#glints');
  if (glints && !reduced) {
    let html = '';
    for (let i = 0; i < 28; i++) {
      const a = Math.random() * 2 * Math.PI, r = Math.sqrt(Math.random()) * 44;
      const x = 50 + r * Math.cos(a), y = 50 + r * Math.sin(a);
      html += `<i style="left:${x.toFixed(1)}%;top:${y.toFixed(1)}%;--s:${(1.4 + Math.random() * 2.4).toFixed(1)}px;--d:${(3.6 + Math.random() * 5).toFixed(1)}s;--delay:${(Math.random() * 8).toFixed(1)}s"></i>`;
    }
    glints.innerHTML = html;
  }

  /* ---------- Spotlight that follows the pointer on cards ---------- */
  if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
    document.addEventListener('pointermove', e => {
      const c = e.target.closest && e.target.closest('.pillar, .tile');
      if (!c) return;
      const r = c.getBoundingClientRect();
      c.style.setProperty('--mx', (e.clientX - r.left).toFixed(0) + 'px');
      c.style.setProperty('--my', (e.clientY - r.top).toFixed(0) + 'px');
    }, { passive: true });
  }

  /* ---------- The film card: the film's own globe turns behind the title (a silent 10 s loop of the clean plate,
     fetched when the card comes near, paused whenever it is off screen or the player is open) ---------- */
  const filmLoop = (() => {
    const stage = $('#film-stage');
    if (!stage) return { resume() {}, pause() {} };
    const v = $('video', stage), sat = $('svg', stage);
    const still = reduced || (navigator.connection && navigator.connection.saveData);
    let near = false, loaded = false;
    const pause = () => { v.pause(); if (sat.pauseAnimations) sat.pauseAnimations(); };
    const resume = () => {
      if (!near || document.hidden || still) return;
      if (!loaded) {
        loaded = true;
        v.src = 'assets/film/film-loop-' + (stage.clientWidth > 900 ? '900' : '720') + '.mp4?v=1122a';
        v.addEventListener('playing', () => stage.classList.add('live'), { once: true });
      }
      v.play().catch(() => {});
      if (sat.unpauseAnimations) sat.unpauseAnimations();
    };
    if (still && sat.pauseAnimations) sat.pauseAnimations();
    new IntersectionObserver(e => { near = e[0].isIntersecting; if (near) resume(); else pause(); }, { rootMargin: '300px 0px' }).observe(stage);
    document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); else resume(); });
    return { resume, pause };
  })();

  /* ---------- Dialog: the film and the paper figures ---------- */
  const dialog = $('#fig-dialog');
  /* Where the film comes from.
     Public site (GitHub Pages): HLS from the media repo, two playlists: 2560 x 1440 AV1 and 1920 x 1080 H.264 (the film's web
     files re-wrapped, not re-encoded). Apple browsers play HLS themselves; the others use hls.js (vendored, fetched on the first click).
     Lab server (10.x): the progressive MP4s next to the film's own page.
     MEDIA_BASE is the only address in this file; window.HAIRUO_MEDIA_BASE overrides it for a mock. */
  const MEDIA_BASE = 'https://xkqin.github.io/HaiRuo-media/';
  const HLS_JS = 'vendor/hls.js-1.7.4/hls.min.js';
  const AV1_TYPE = 'video/mp4; codecs="av01.0.12M.08"';
  const FILM_DIR = '/web_assets/films/hairuo-intro-v1/';
  const mediaBase = () => window.HAIRUO_MEDIA_BASE || MEDIA_BASE;
  const onLab = () => !window.HAIRUO_MEDIA_BASE && /^10\./.test(location.hostname);
  const FILMS = {
    orbit: {
      title: 'HaiRuo, the film',
      hls: { hq: 'film/2k/master.m3u8', lo: 'film/1080p/master.m3u8' },
      hq: [[FILM_DIR + 'orbit/HaiRuo-Orbit-v1-av1.mp4?v=1119c', 'video/mp4; codecs="av01.0.12M.08, mp4a.40.2"'], [FILM_DIR + 'orbit/HaiRuo-Orbit-v1.mp4?v=1119c', 'video/mp4']],
      lo: [[FILM_DIR + 'orbit/HaiRuo-Orbit-v1-1080p.mp4?v=1119c', 'video/mp4']],
      poster: 'assets/film/film-poster.jpg?v=1122a',
      caption: 'HaiRuo end to end, narrated. Every ocean plate is rendered from real DUACS altimetry; every number is from the paper. Music: “Adventure” by Alexander Nakarada (CC BY 4.0); narration: Kokoro-82M.',
      credits: 'assets/film/MUSIC-CREDITS.txt'
    }
  };
  let hlsLib = null, hls = null;
  const loadHls = () => hlsLib || (hlsLib = new Promise((ok, no) => {
    if (window.Hls) { ok(window.Hls); return; }
    const s = document.createElement('script');
    s.src = HLS_JS; s.async = true;
    s.onload = () => (window.Hls ? ok(window.Hls) : no(new Error('hls.js')));
    s.onerror = () => { hlsLib = null; s.remove(); no(new Error('hls.js')); };
    document.head.append(s);
  }));
  const dropHls = () => { if (hls) { hls.destroy(); hls = null; } };
  const filmFailed = v => {
    if (!v.isConnected) return;
    const p = document.createElement('p');
    p.className = 'dialog-caption';
    p.textContent = 'The film could not be loaded. Please reload the page in a moment, or try a current Chrome, Edge, Firefox or Safari.';
    v.replaceWith(p);
  };
  // play quality k ('hq' = 2K, 'lo' = 1080p) from `start` seconds; tell(k, has2k) reports what is really playing
  function playFilm(v, f, k, start, autoplay, tell) {
    dropHls();
    const seek = () => { if (start > 0) v.addEventListener('loadedmetadata', () => { v.currentTime = start; }, { once: true }); };
    const go = () => { if (autoplay) v.play().catch(() => {}); };
    if (onLab()) { v.removeAttribute('src'); setSources(v, f[k]); v.load(); seek(); tell(k, true); go(); return; }
    const apple = !!v.canPlayType('application/vnd.apple.mpegurl') && /Apple/.test(navigator.vendor || '');
    const mse = window.ManagedMediaSource || window.MediaSource;
    const av1 = apple ? !!v.canPlayType(AV1_TYPE) : !!(mse && mse.isTypeSupported && mse.isTypeSupported(AV1_TYPE));
    if (k === 'hq' && !av1) k = 'lo';
    tell(k, av1);
    const url = mediaBase() + f.hls[k];
    let done = false;
    const lower = () => {            // 2K failed: drop to 1080p once; 1080p failed: say so
      if (done || !v.isConnected) return;
      done = true;
      if (k === 'hq') playFilm(v, f, 'lo', v.currentTime || start, autoplay, (q) => tell(q, false)); else { dropHls(); filmFailed(v); }
    };
    if (apple) {                      // Safari, and every browser on iOS
      v.src = url; seek();
      v.addEventListener('error', lower, { once: true });
      go(); return;
    }
    loadHls().then(Hls => {
      if (!v.isConnected || done) return;
      if (!Hls.isSupported()) { filmFailed(v); return; }
      const h = hls = new Hls({ startPosition: start > 0 ? start : -1, maxBufferLength: 30, maxMaxBufferLength: 60 });
      let healed = false;
      h.on(Hls.Events.MANIFEST_PARSED, go);
      h.on(Hls.Events.ERROR, (e, d) => {
        if (!d.fatal || h !== hls) return;
        if (d.type === Hls.ErrorTypes.MEDIA_ERROR && !healed) { healed = true; h.recoverMediaError(); } else lower();
      });
      h.loadSource(url);
      h.attachMedia(v);
    }, () => filmFailed(v));
  }
  function openDialog(title, node, caption, film) {
    $('#dialog-title').textContent = title;
    $('#dialog-content').replaceChildren(node);
    $('#dialog-caption').textContent = caption;
    dialog.classList.toggle('is-film', !!film);
    document.body.classList.add('modal-open');
    dialog.showModal();
  }
  // a swell as the film opens: three rings leave the centre (CSS only, gone in 1.9 s)
  const swell = host => {
    if (reduced) return;
    const s = document.createElement('span');
    s.className = 'swell'; s.setAttribute('aria-hidden', 'true'); s.innerHTML = '<i></i><i></i><i></i>';
    host.append(s);
    setTimeout(() => s.remove(), 1900);
  };
  const setSources = (v, list) => v.replaceChildren(...list.map(([src, type]) => { const s = document.createElement('source'); s.src = src; s.type = type; return s; }));
  $$('[data-film]').forEach(b => b.addEventListener('click', () => {
    const f = FILMS[b.dataset.film];
    const v = document.createElement('video');
    v.controls = true; v.playsInline = true; v.preload = 'metadata'; v.poster = f.poster;
    v.setAttribute('controlslist', 'nodownload'); v.disablePictureInPicture = true;
    v.setAttribute('aria-label', f.title);
    const start = Number(b.dataset.start) || 0;
    filmLoop.pause();
    openDialog(f.title, v, f.caption, true);
    swell($('#dialog-content'));
    if (f.credits) {
      const a = document.createElement('a');
      a.href = f.credits; a.target = '_blank'; a.rel = 'noopener'; a.textContent = ' Credits ›';
      $('#dialog-caption').append(a);
    }
    // 2K is the default; 1080p is there for a slow link and keeps the place in the film
    const q = document.createElement('span');
    q.className = 'dialog-q'; q.setAttribute('role', 'group'); q.setAttribute('aria-label', 'Picture quality');
    const tell = (k, has2k) => {     // what is really playing; no switch where the browser cannot decode the 2K stream
      $$('button', q).forEach(x => x.setAttribute('aria-pressed', String(x.dataset.q === k)));
      if (!has2k) q.hidden = true;
    };
    [['hq', '2K'], ['lo', '1080p']].forEach(([k, label]) => {
      const qb = document.createElement('button');
      qb.type = 'button'; qb.textContent = label; qb.dataset.q = k; qb.setAttribute('aria-pressed', String(k === 'hq'));
      qb.addEventListener('click', () => {
        if (qb.getAttribute('aria-pressed') === 'true') return;
        playFilm(v, f, k, v.currentTime, !v.paused, tell);
      });
      q.append(qb);
    });
    $('.dialog-bar').insertBefore(q, $('.dialog-close'));
    playFilm(v, f, 'hq', start, true, tell);
  }));
  // no "Save video as…" on any video of the page (the player hides its own Download item through controlslist)
  document.addEventListener('contextmenu', e => { if (e.target instanceof Element && e.target.closest('video')) e.preventDefault(); });
  const FIGS = {
    teaser: { title: 'Figure 1 · HaiRuo', src: 'assets/fig/fig1_teaser.png', caption: 'Fields, eddy masks and every eddy’s trajectory, 15 days in one forward pass.' },
    overview: { title: 'Figure 2 · HaiRuo-1B and XuanJi', src: 'assets/fig/fig2_overview.png', caption: 'XuanJi reads the HaiRuo-1B forecast into fields, masks and trajectories, refining every path in three look-ahead rounds.' },
    xuanji: { title: 'XuanJi · Lagrangian object attention', src: 'assets/fig/fig3_xuanji.png', caption: 'Rings sample the forecast and the backbone; modes m = 0, 1, 2; four refiners over three look-ahead rounds.' },
    map: { title: 'Global 15-day improvement over PredRNN-V2', src: 'assets/fig/fig4_global_map.png', caption: '114,546 eddy forecasts, 2020–2022. Blue: HaiRuo has the lower error.' },
    case: { title: 'Case study · Kuroshio Extension, 12 August 2022', src: 'assets/fig/fig9_case_grid.png', caption: 'Observed (top) and HaiRuo (bottom). The forecast centre ends 5.7 km from the observed one on day 15 (PredRNN-V2: 8.4 km).' }
  };
  $$('[data-figure]').forEach(b => b.addEventListener('click', () => {
    const f = FIGS[b.dataset.figure];
    const img = new Image(); img.src = f.src; img.alt = f.title;
    openDialog(f.title, img, f.caption, false);
  }));
  $('.dialog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', e => {
    if (e.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => {
    dropHls();
    $('#dialog-content').replaceChildren();
    $$('.dialog-q', dialog).forEach(n => n.remove());
    document.body.classList.remove('modal-open');
    filmLoop.resume();
  });

  /* ---------- Copy buttons (download command, BibTeX) ---------- */
  [['#copy-cmd', '#dl-cmd'], ['#copy-bib', '#bib']].forEach(([b, src]) => {
    const btn = $(b);
    if (!btn) return;
    btn.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText($(src).textContent); btn.textContent = 'Copied'; }
      catch (_) { btn.textContent = 'Select and copy'; }
      setTimeout(() => { btn.textContent = 'Copy'; }, 1600);
    });
  });

  /* ---------- Scroll-linked effects (one rAF per frame) ---------- */
  const hero = $('#top'), deepBand = $('#xuanji');
  const waves = $('.sec-bg-waves');
  const wavesImg = waves && $('img', waves);
  const prog = n => { const r = n.getBoundingClientRect(); const t = r.height - innerHeight; return t > 0 ? clamp(-r.top / t) : (r.top < 0 ? 1 : 0); };
  let ticking = false;
  function onScroll() {
    ticking = false;
    const navH = nav.offsetHeight || 52;
    const xr = deepBand.getBoundingClientRect();
    nav.classList.toggle('solid', scrollY > 24);
    nav.classList.toggle('on-deep', hero.getBoundingClientRect().bottom > navH || (xr.top < navH && xr.bottom > navH));
    sweepPassed();
    const max = document.documentElement.scrollHeight - innerHeight;
    navProgress.style.setProperty('--sp', (max > 0 ? clamp(scrollY / max) : 0).toFixed(4));
    if (!reduced) {
      if (wavesImg) {
        const wr = waves.getBoundingClientRect();
        if (wr.top < innerHeight && wr.bottom > 0) wavesImg.style.setProperty('--py', (wr.top * -0.12).toFixed(1));
      }
      const mr = manifesto.getBoundingClientRect();
      if (mr.top < innerHeight && mr.bottom > 0) {
        const p = clamp((prog(manifesto) - 0.05) / 0.8);
        const lit = Math.round(p * wordEls.length);
        if (lit !== litCount) { litCount = lit; wordEls.forEach((w, k) => w.classList.toggle('on', k < lit)); }
      }
    } else if (litCount < 0) { litCount = wordEls.length; wordEls.forEach(w => w.classList.add('on')); }
  }
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  addEventListener('resize', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } });
  onScroll();
})();
