const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");
const testImg = document.getElementById("testImg");
const scoreBox = document.getElementById("score");
const detailsBox = document.getElementById("details");
const matchToast = document.getElementById("matchToast");
const referenceGrid = document.getElementById("referenceGrid");

const referenceFiles = [
  "References/ref7.jpg",
  "References/ref8.jpg",
  "References/ref9.jpg",
  "References/ref10.jpg",
  "References/ref11.jpg"
];

const MATCH_POPUP_THRESHOLD = 75;

let faceMesh;
let referenceProfiles = [];
let referenceFeatures = null;

const landmarkPairs = {
  face_width: [234, 454],
  face_height: [10, 152],
  eye_spacing: [133, 362],
  nose_width: [98, 327],
  nose_length: [6, 2],
  mouth_width: [61, 291],
  jaw_width: [172, 397],
  brow_width: [70, 300],
  chin_to_mouth: [152, 13],
  nose_to_chin: [2, 152],
  left_eye_width: [33, 133],
  right_eye_width: [362, 263],
  nose_to_left_cheek: [2, 234],
  nose_to_right_cheek: [2, 454]
};

function distance(a, b) {
  return Math.sqrt(
    Math.pow(a.x - b.x, 2) +
    Math.pow(a.y - b.y, 2) +
    Math.pow(a.z - b.z, 2)
  );
}

function extractFeatures(landmarks) {
  const faceHeight = distance(landmarks[10], landmarks[152]);
  const features = {};

  for (const [name, pair] of Object.entries(landmarkPairs)) {
    const value = distance(landmarks[pair[0]], landmarks[pair[1]]);
    features[name] = value / faceHeight;
  }

  return features;
}

function averageReferenceFeatures(profiles) {
  const average = {};

  for (const key of Object.keys(profiles[0])) {
    average[key] =
      profiles.reduce((sum, profile) => sum + profile[key], 0) / profiles.length;
  }

  return average;
}

function compareFeatures(ref, test) {
  let totalDifference = 0;
  let count = 0;
  let details = [];

  for (const key of Object.keys(ref)) {
    const difference = Math.abs(ref[key] - test[key]);
    const similarity = Math.max(0, 100 - difference * 500);

    totalDifference += difference;
    count++;

    let label = "weak";
    if (similarity >= 80) label = "strong";
    else if (similarity >= 60) label = "partial";

    details.push({
      feature: key.replaceAll("_", " "),
      similarity: similarity.toFixed(1),
      label
    });
  }

  const averageDifference = totalDifference / count;
  const overall = Math.max(0, 100 - averageDifference * 500);

  return {
    overall: overall.toFixed(1),
    details
  };
}

function showMatchToast(message) {
  matchToast.textContent = message;
  matchToast.classList.add("show");

  setTimeout(() => {
    matchToast.classList.remove("show");
  }, 3500);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => resolve(img);
    img.onerror = () => reject(`Could not load ${src}`);

    img.src = src;
  });
}

function loadImageToCanvas(img) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;

  ctx.drawImage(img, 0, 0);

  return canvas;
}

async function getLandmarksFromImage(img) {
  return new Promise((resolve) => {
    faceMesh.onResults((results) => {
      if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
        resolve(null);
        return;
      }

      resolve(results.multiFaceLandmarks[0]);
    });

    const canvas = loadImageToCanvas(img);
    faceMesh.send({ image: canvas });
  });
}

async function setupFaceMesh() {
  faceMesh = new FaceMesh({
    locateFile: (file) => {
      return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
    }
  });

  faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,
    minDetectionConfidence: 0.25,
    minTrackingConfidence: 0.25
  });
}

async function loadReferenceImages() {
  scoreBox.innerHTML = "Loading reference faces...";

  for (const file of referenceFiles) {
    try {
      const img = await loadImage(file);

      const preview = document.createElement("img");
      preview.src = file;
      referenceGrid.appendChild(preview);

      const landmarks = await getLandmarksFromImage(img);

      if (landmarks) {
        console.log("Face detected:", file);
        referenceProfiles.push(extractFeatures(landmarks));
      } else {
        console.log("FAILED:", file);
      }
    } catch (err) {
      console.warn(err);
    }
  }

  if (referenceProfiles.length === 0) {
    scoreBox.innerHTML = "No usable faces found in reference images.";
    return;
  }

  referenceFeatures = averageReferenceFeatures(referenceProfiles);
  scoreBox.innerHTML = `Loaded ${referenceProfiles.length} reference face(s). Drop an image.`;
}

async function analyzeTestImage() {
  if (!referenceFeatures) {
    scoreBox.innerHTML = "Reference faces not loaded yet.";
    return;
  }

  scoreBox.innerHTML = "Analyzing...";
  detailsBox.innerHTML = "";

  const landmarks = await getLandmarksFromImage(testImg);

  if (!landmarks) {
    scoreBox.innerHTML = "No face found in image.";
    return;
  }

  const testFeatures = extractFeatures(landmarks);
  const result = compareFeatures(referenceFeatures, testFeatures);

  let scoreClass = "low";
  if (result.overall >= 75) scoreClass = "match";
  else if (result.overall >= 55) scoreClass = "mid";

  scoreBox.innerHTML =
    `<span class="${scoreClass}">Overall Similarity: ${result.overall}%</span>`;

  if (parseFloat(result.overall) >= MATCH_POPUP_THRESHOLD) {
    showMatchToast(`Similar face structure detected (${result.overall}% match)`);
  }

  detailsBox.innerHTML = result.details.map(item => `
    <p>
      <b>${item.feature}</b>: ${item.similarity}%
      <span class="${
        item.label === "strong" ? "match" :
        item.label === "partial" ? "mid" :
        "low"
      }">
        ${item.label} match
      </span>
    </p>
  `).join("");
}

function handleFile(file) {
  const url = URL.createObjectURL(file);
  testImg.src = url;

  testImg.onload = () => {
    analyzeTestImage();
  };
}

dropZone.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", () => {
  if (fileInput.files.length > 0) {
    handleFile(fileInput.files[0]);
  }
});

dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("dragover");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("dragover");
});

dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("dragover");

  const file = e.dataTransfer.files[0];

  if (file && file.type.startsWith("image/")) {
    handleFile(file);
  }
});

async function startApp() {
  await setupFaceMesh();
  await loadReferenceImages();
}

startApp();
