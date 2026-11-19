import {
  FaceLandmarker,
  FilesetResolver,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm";

const frame = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const preview = document.getElementById("preview");
const placeholder = document.getElementById("placeholder");
const analyzeBtn = document.getElementById("analyzeBtn");
const resetBtn = document.getElementById("resetBtn");
const statusEl = document.getElementById("status");
const results = document.getElementById("results");

/* ---------- Upload handling ---------- */
function loadFile(file) {
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    statusEl.textContent = "Please choose an image file (JPG, PNG or WebP).";
    return;
  }
  if (preview.src) URL.revokeObjectURL(preview.src);
  preview.src = URL.createObjectURL(file);
  preview.hidden = false;
  placeholder.hidden = true;
  analyzeBtn.disabled = false;
  resetBtn.hidden = false;
  statusEl.textContent = "Photo ready. Click Analyze my face.";
}

function resetPhoto() {
  if (preview.src) URL.revokeObjectURL(preview.src);
  preview.removeAttribute("src");
  preview.hidden = true;
  placeholder.hidden = false;
  analyzeBtn.disabled = true;
  resetBtn.hidden = true;
  results.hidden = true;
  fileInput.value = "";
  statusEl.textContent = "";
}

frame.addEventListener("click", () => fileInput.click());
frame.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    fileInput.click();
  }
});
fileInput.addEventListener("change", (e) => loadFile(e.target.files[0]));
frame.addEventListener("dragover", (e) => {
  e.preventDefault();
  frame.classList.add("dragging");
});
frame.addEventListener("dragleave", () => frame.classList.remove("dragging"));
frame.addEventListener("drop", (e) => {
  e.preventDefault();
  frame.classList.remove("dragging");
  loadFile(e.dataTransfer.files[0]);
});
resetBtn.addEventListener("click", resetPhoto);

/* ---------- MediaPipe ---------- */
let landmarker = null;

async function getLandmarker() {
  if (landmarker) return landmarker;
  const fileset = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
  );
  landmarker = await FaceLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
    },
    runningMode: "IMAGE",
    numFaces: 1,
  });
  return landmarker;
}

function measure(points, w, h) {
  const d = (a, b) =>
    Math.hypot((points[a].x - points[b].x) * w, (points[a].y - points[b].y) * h);

  const faceLength = d(10, 152);
  const cheekWidth = d(234, 454);
  const jawWidth = d(58, 288);
  const foreheadWidth = d(54, 284);
  const eyeWidth = (d(33, 133) + d(263, 362)) / 2;
  const eyeGap = d(133, 362);

  const lengthRatio = faceLength / cheekWidth;
  const jawRatio = jawWidth / cheekWidth;
  const foreheadRatio = foreheadWidth / cheekWidth;
  const eyeRatio = eyeGap / eyeWidth;

  let shape = "Oval";
  if (lengthRatio > 1.5) shape = "Oblong";
  else if (foreheadWidth / jawWidth > 1.2 && jawRatio < 0.8) shape = "Heart";
  else if (jawRatio > 0.88 && lengthRatio < 1.4) shape = "Square";
  else if (lengthRatio < 1.3) shape = "Round";

  return {
    shape,
    jaw: jawRatio < 0.75 ? "Narrow" : jawRatio < 0.88 ? "Medium" : "Wide",
    forehead: foreheadRatio < 0.72 ? "Narrow" : foreheadRatio < 0.85 ? "Average" : "Broad",
    eyes: eyeRatio < 0.9 ? "Close-set" : eyeRatio > 1.1 ? "Wide-set" : "Balanced",
  };
}

/* ---------- AI advice ---------- */
// Shrinks the photo before sending: faster upload and cheaper AI request.
function photoToJpeg(img, maxSize = 768) {
  const scale = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

async function getAdvice(measurements) {
  const res = await fetch("/api/advice", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: photoToJpeg(preview), measurements }),
  });
  if (!res.ok) throw new Error("Advice request failed");
  return res.json();
}

/* ---------- Scores (grooming / hairstyle / style only) ---------- */
function renderScores(scores) {
  const labels = { grooming: "Grooming", hairstyle: "Hairstyle", style: "Style" };
  const entries = Object.entries(labels).map(([key, label]) => ({
    label,
    ...((scores && scores[key]) || { score: null, reason: "", improve: "" }),
  }));
  const scored = entries.filter((e) => typeof e.score === "number");

  // Overall number = average of the categories that could be scored
  const avg = scored.length
    ? scored.reduce((sum, e) => sum + e.score, 0) / scored.length
    : null;
  document.getElementById("scoreNum").textContent =
    avg === null ? "-" : avg.toFixed(1).replace(/\.0$/, "");

  // Strengths: best categories (6+), or the single best one if none reach 6
  const list = document.getElementById("strengthList");
  list.replaceChildren();
  const sorted = [...scored].sort((a, b) => b.score - a.score);
  const strengths = sorted.filter((e) => e.score >= 6);
  (strengths.length ? strengths : sorted.slice(0, 1)).forEach((e) => {
    const li = document.createElement("li");
    li.textContent = `${e.label}: ${e.reason}`;
    list.appendChild(li);
  });

  // Biggest quick win: the improve tip from the lowest-scoring category
  const lowest = sorted[sorted.length - 1];
  document.getElementById("biggestWin").textContent =
    lowest && lowest.improve ? lowest.improve : "-";

  // One small card per category
  const cards = document.getElementById("scoreCards");
  cards.replaceChildren();
  entries.forEach((e) => {
    const card = document.createElement("div");
    card.className = "score-card";

    const title = document.createElement("h4");
    title.textContent = e.label;

    const num = document.createElement("div");
    num.className = "score-card-num";
    num.textContent = typeof e.score === "number" ? `${e.score}/10` : "Not visible";

    const why = document.createElement("p");
    why.textContent = e.reason;

    const tip = document.createElement("p");
    tip.className = "score-card-tip";
    tip.textContent = e.improve ? `Try: ${e.improve}` : "";

    card.append(title, num, why, tip);
    cards.appendChild(card);
  });
}

/* ---------- Analyze ---------- */
analyzeBtn.addEventListener("click", async () => {
  analyzeBtn.disabled = true;
  frame.classList.add("scanning");
  statusEl.textContent = "Loading the face model (first time takes a few seconds)...";

  try {
    const lm = await getLandmarker();
    statusEl.textContent = "Measuring your face...";
    const out = lm.detect(preview);

    if (!out.faceLandmarks.length) {
      statusEl.textContent = "No face found. Try a front-facing photo with even lighting.";
      return;
    }

    const m = measure(out.faceLandmarks[0], preview.naturalWidth, preview.naturalHeight);
    document.getElementById("mShape").textContent = m.shape;
    document.getElementById("mJaw").textContent = m.jaw;
    document.getElementById("mForehead").textContent = m.forehead;
    document.getElementById("mEyes").textContent = m.eyes;

    statusEl.textContent = "Writing your plan...";
    const advice = await getAdvice(m);
    document.getElementById("advHair").textContent = advice.hair;
    document.getElementById("advSkin").textContent = advice.skin;
    document.getElementById("advGrooming").textContent = advice.grooming;
    document.getElementById("advStyle").textContent = advice.style;

    // Score badge, strengths list, biggest win and the three score cards
    renderScores(advice.scores);

    const skin = advice.skinCheck || {};
    document.getElementById("skinSeen").textContent = skin.visible || "";
    document.getElementById("skinRoutine").textContent = skin.routine || "";
    document.getElementById("skinDoctor").textContent = skin.seeDoctor || "";

    const productList = document.getElementById("productList");
    productList.replaceChildren(
      ...(advice.products || []).map((p) => {
        const li = document.createElement("li");
        const title = document.createElement("strong");
        title.textContent = p.type || "";
        const look = document.createElement("span");
        look.textContent = "Look for: " + (p.lookFor || "");
        const why = document.createElement("span");
        why.textContent = p.why || "";
        li.append(title, look, why);
        return li;
      })
    );

    statusEl.textContent = "Done. Your plan is below.";
    results.hidden = false;
    results.scrollIntoView({ behavior: "smooth" });
  } catch (err) {
    console.error(err);
    statusEl.textContent =
      "Something went wrong. Make sure the server is running (node server.js) and try again.";
  } finally {
    frame.classList.remove("scanning");
    analyzeBtn.disabled = false;
  }
});