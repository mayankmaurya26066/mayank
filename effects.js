/* LooksAI effects: cursor glow, face-scan overlay, before/after slider.
   Add to index.html:  <link rel="stylesheet" href="effects.css">  and  <script type="module" src="effects.js"></script> */

// ================= 1. Cursor glow =================
const GLASS = '.scan-card,.strengths,.measure,.advice article,.situations details,.rows>div,.steps li,.score-cards>*';
if (matchMedia('(hover:hover)').matches) {
  document.addEventListener('pointermove', e => {
    const el = e.target.closest && e.target.closest(GLASS);
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', (e.clientX - r.left) + 'px');
    el.style.setProperty('--my', (e.clientY - r.top) + 'px');
  });
}

// ================= 2. Live face-scan overlay =================
const frame = document.getElementById('dropzone');
const img = document.getElementById('preview');
const analyzeBtn = document.getElementById('analyzeBtn');
const resetBtn = document.getElementById('resetBtn');
const fileInput = document.getElementById('fileInput');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

if (frame && img) {
  const canvas = document.createElement('canvas');
  canvas.id = 'faceOverlay';
  frame.appendChild(canvas);

  const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
  const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
  let landmarker = null, mesh = [], oval = [];
  let face = null, detecting = null, raf = 0;

  async function getLandmarker() {
    if (landmarker) return landmarker;
    const { FaceLandmarker, FilesetResolver } = await import(MP + '/vision_bundle.mjs');
    const files = await FilesetResolver.forVisionTasks(MP + '/wasm');
    landmarker = await FaceLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: MODEL },
      runningMode: 'IMAGE',
      numFaces: 1
    });
    mesh = FaceLandmarker.FACE_LANDMARKS_TESSELLATION;
    oval = FaceLandmarker.FACE_LANDMARKS_FACE_OVAL;
    return landmarker;
  }

  function detect() {
    const src = img.src;
    if (!src) return Promise.resolve(null);
    detecting = (async () => {
      try {
        const lm = await getLandmarker();
        const res = lm.detect(img);
        const pts = res.faceLandmarks && res.faceLandmarks[0];
        if (img.src === src) face = pts || null;
        return pts || null;
      } catch (err) {
        console.warn('Face overlay unavailable:', err);
        return null;
      }
    })();
    return detecting;
  }

  // map normalized landmarks to the frame (the photo uses object-fit: cover)
  function project() {
    const w = frame.clientWidth, h = frame.clientHeight;
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const s = Math.max(w / iw, h / ih);
    const ox = (w - iw * s) / 2, oy = (h - ih * s) / 2;
    return { w, h, pts: face.map((p, i) => ({ x: ox + p.x * iw * s, y: oy + p.y * ih * s, i })) };
  }

  function draw(sweep) {
    const { w, h, pts } = project();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr; canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const lines = (list, color, width) => {
      ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = width;
      for (const { start, end } of list) {
        const a = pts[start], b = pts[end];
        if (a.y <= sweep && b.y <= sweep) { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
      }
      ctx.stroke();
    };
    lines(mesh, 'rgba(255,120,60,.22)', .6);
    lines(oval, 'rgba(255,45,45,.95)', 1.6);
    for (const p of pts) {
      if (p.y > sweep) continue;
      const fresh = sweep - p.y < 36;
      const color = p.i % 2 ? '#ff8a1f' : '#ff2d2d';
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = fresh ? 14 : 0;
      ctx.beginPath(); ctx.arc(p.x, p.y, fresh ? 3.2 : 1.8, 0, 6.2832); ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  function clear() {
    cancelAnimationFrame(raf);
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  }

  function play() {
    if (!face) return;
    cancelAnimationFrame(raf);
    const ys = project().pts.map(p => p.y);
    const from = Math.min(...ys) - 10, to = Math.max(...ys) + 40;
    if (reduceMotion) return draw(Infinity);
    const t0 = performance.now(), dur = 2200;
    const step = now => {
      const k = Math.min(1, (now - t0) / dur);
      draw(from + (to - from) * k);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  // find the face as soon as a photo is chosen, so the scan can start instantly
  img.addEventListener('load', () => { face = null; clear(); detect(); });
  fileInput && fileInput.addEventListener('change', () => { face = null; clear(); });
  resetBtn && resetBtn.addEventListener('click', () => { face = null; clear(); });
  analyzeBtn && analyzeBtn.addEventListener('click', async () => {
    if (!face) await (detecting || detect());
    play();
  });
  window.addEventListener('resize', () => { if (face && canvas.width) draw(Infinity); });
}

// ================= 3. Before / after slider =================
// To use real photos, put file names here (e.g. 'before.jpg'). Empty = drawn example.
const BEFORE_IMG = '', AFTER_IMG = '';

function drawnFace(after) {
  const skin = after ? '#d8a27e' : '#c48b69', hair = '#1b120f', id = after ? 'bgA' : 'bgB';
  const spots = ['108,176', '192,170', '170,100', '130,98', '196,192', '104,198']
    .map(s => `<circle cx="${s.split(',')[0]}" cy="${s.split(',')[1]}" r="4.5" fill="#b83a2e" opacity=".75"/>`).join('');
  const hairPath = after
    ? 'M82 128C78 74 118 52 154 52C198 52 224 80 218 128C206 100 180 88 140 92C112 94 92 106 82 128Z'
    : 'M76 140C62 78 112 36 158 46C218 50 240 96 222 140C214 112 198 98 180 108C166 92 132 96 120 116C106 108 90 118 76 140ZM96 60l-14-14 22 6zM200 54l12-16 4 22z';
  return `<svg viewBox="0 0 300 360" role="img" aria-label="${after ? 'After' : 'Before'} example">
<defs><radialGradient id="${id}" cx="50%" cy="35%" r="75%"><stop offset="0" stop-color="${after ? '#ff6a2b' : '#4a4a50'}" stop-opacity=".55"/><stop offset="1" stop-color="#0b0606"/></radialGradient></defs>
<rect width="300" height="360" fill="url(#${id})"/>
<path d="M20 360Q30 285 110 268H190Q270 285 280 360Z" fill="${after ? '#2b0b0b' : '#3a3a40'}"/>
${after ? '<path d="M110 268L150 300L190 268" stroke="#ff8a1f" stroke-width="3" fill="none"/>' : ''}
<rect x="128" y="205" width="44" height="72" rx="16" fill="${skin}"/>
<ellipse cx="80" cy="158" rx="9" ry="16" fill="${skin}"/><ellipse cx="220" cy="158" rx="9" ry="16" fill="${skin}"/>
<ellipse cx="150" cy="150" rx="70" ry="86" fill="${skin}"/>
<path d="${hairPath}" fill="${hair}"/>
<path d="M104 120Q122 ${after ? 112 : 108} 142 120M158 120Q178 ${after ? 112 : 108} 196 120" stroke="${hair}" stroke-width="${after ? 4 : 8}" stroke-linecap="round" fill="none"/>
<ellipse cx="123" cy="142" rx="11" ry="6" fill="#fff"/><ellipse cx="177" cy="142" rx="11" ry="6" fill="#fff"/>
<circle cx="123" cy="142" r="4" fill="#2a1a14"/><circle cx="177" cy="142" r="4" fill="#2a1a14"/>
${after ? '<ellipse cx="116" cy="172" rx="16" ry="9" fill="#fff" opacity=".12"/><ellipse cx="184" cy="172" rx="16" ry="9" fill="#fff" opacity=".12"/>'
        : '<ellipse cx="123" cy="154" rx="14" ry="5" fill="#5a2f4a" opacity=".4"/><ellipse cx="177" cy="154" rx="14" ry="5" fill="#5a2f4a" opacity=".4"/>' + spots}
<path d="M150 146Q144 178 138 184Q150 190 162 184" stroke="rgba(0,0,0,.28)" stroke-width="3" fill="none" stroke-linecap="round"/>
<path d="M130 206Q150 ${after ? 220 : 212} 170 206" stroke="#6b2a22" stroke-width="4" fill="none" stroke-linecap="round"/>
</svg>`;
}

const layer = (src, after) => src ? `<img src="${src}" alt="${after ? 'After' : 'Before'}">` : drawnFace(after);

const baHTML = `
<section id="before-after" class="ba-sec"><div class="wrap">
  <h2>See the difference</h2>
  <p class="sec-lead">Drag the handle to compare. A cleaner cut, tidier brows and a simple skincare routine change how a face reads.</p>
  <div class="ba">
    <div class="ba-layer after">${layer(AFTER_IMG, true)}<span class="ba-tag right">After</span></div>
    <div class="ba-layer before">${layer(BEFORE_IMG, false)}<span class="ba-tag left">Before</span></div>
    <div class="ba-handle" aria-hidden="true"><i>&lsaquo;&rsaquo;</i></div>
    <input class="ba-range" type="range" min="0" max="100" value="50" aria-label="Compare before and after">
  </div>
</div></section>`;

const anchor = document.getElementById('what');
if (anchor && !document.getElementById('before-after')) {
  anchor.insertAdjacentHTML('beforebegin', baHTML);
  const ba = document.querySelector('.ba'), range = ba.querySelector('.ba-range');
  range.addEventListener('input', () => ba.style.setProperty('--pos', range.value + '%'));
}