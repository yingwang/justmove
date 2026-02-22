// ============================================================
// JustMove - A "Just Dance" Style Rhythm Game with MediaPipe
// ============================================================

// ===== DOM Elements =====
const startScreen = document.getElementById('start-screen');
const gameScreen = document.getElementById('game-screen');
const resultsScreen = document.getElementById('results-screen');
const loadingOverlay = document.getElementById('loading-overlay');
const loadingText = document.getElementById('loading-text');
const startBtn = document.getElementById('start-btn');
const retryBtn = document.getElementById('retry-btn');
const menuBtn = document.getElementById('menu-btn');
const webcam = document.getElementById('webcam');
const poseCanvas = document.getElementById('pose-canvas');
const gameCanvas = document.getElementById('game-canvas');
const targetPoseCanvas = document.getElementById('target-pose-canvas');
const countdownEl = document.getElementById('countdown');
const countdownNumber = document.getElementById('countdown-number');
const scoreValue = document.getElementById('score-value');
const comboValue = document.getElementById('combo-value');
const multiplierValue = document.getElementById('multiplier-value');
const ratingPopup = document.getElementById('rating-popup');
const progressBar = document.getElementById('progress-bar');
const poseNameEl = document.getElementById('pose-name');
const beatMarkersEl = document.getElementById('beat-markers');

const poseCtx = poseCanvas.getContext('2d');
const gameCtx = gameCanvas.getContext('2d');
const targetCtx = targetPoseCanvas.getContext('2d');

// ===== Game State =====
let holistic = null;
let camera = null;
let currentPoseLandmarks = null;
let gameState = 'menu'; // menu, countdown, playing, results
let selectedSong = 'pop-dance-beat';
let audioContext = null;
let gameStartTime = 0;
let lastFrameTime = 0;
let animFrameId = null;

// Score state
let score = 0;
let combo = 0;
let maxCombo = 0;
let multiplier = 1;
let ratings = { perfect: 0, great: 0, good: 0, miss: 0 };

// Beat map state
let beatMap = [];
let currentBeatIndex = 0;
let activePose = null;
let poseMatchScore = 0;

// Audio state
let audioNodes = {};
let songDuration = 0;

// Pixabay audio state
let songAudioBuffer = null;

// Custom audio state
let customAudioBuffer = null;
let customAudioBpm = 120;
let customAudioDifficulty = 'medium';
let customAudioReady = false;

// Visual effects state
let particles = [];
let lastRatingTime = 0;
let lastRating = '';
let beatPulse = 0;
let currentSongBpm = 120;

// Neon color palette based on match quality
const NEON_COLORS = {
  idle: { r: 0, g: 200, b: 255 },     // cyan
  good: { r: 0, g: 255, b: 136 },      // green
  perfect: { r: 255, g: 215, b: 0 },   // gold
  miss: { r: 255, g: 51, b: 102 },     // pink
};

// Just Dance style colors
const JUST_DANCE_COLORS = {
  perfect: { r: 255, g: 215, b: 0 },   // gold
  great: { r: 0, g: 255, b: 136 },    // green
  good: { r: 0, g: 200, b: 255 },     // cyan
  miss: { r: 255, g: 51, b: 102 },    // pink
  background: { r: 10, g: 10, b: 26 }, // dark blue
  player: { r: 0, g: 200, b: 255 },   // player outline
  target: { r: 255, g: 105, b: 180 }, // target outline
};

// ===== Pose Definitions =====
// Each pose is defined by expected angles/positions of key body parts
const POSES = {
  'arms-up': {
    name: 'Arms Up',
    icon: '\u2191',
    check(landmarks) {
      if (!landmarks) return 0;
      const lShoulder = landmarks[11];
      const rShoulder = landmarks[12];
      const lWrist = landmarks[15];
      const rWrist = landmarks[16];
      const lElbow = landmarks[13];
      const rElbow = landmarks[14];
      if (!lShoulder || !rShoulder || !lWrist || !rWrist) return 0;

      let matchScore = 0;
      // Both wrists above shoulders
      if (lWrist.y < lShoulder.y) matchScore += 0.3;
      if (rWrist.y < rShoulder.y) matchScore += 0.3;
      // Wrists above elbows
      if (lWrist.y < lElbow.y) matchScore += 0.2;
      if (rWrist.y < rElbow.y) matchScore += 0.2;
      return matchScore;
    },
    draw(ctx, w, h) {
      drawStickFigure(ctx, w, h, {
        lArm: [{ x: 0.35, y: 0.25 }, { x: 0.3, y: 0.15 }],
        rArm: [{ x: 0.65, y: 0.25 }, { x: 0.7, y: 0.15 }],
      }, 'target');
    },
  },
  'arms-out': {
    name: 'T-Pose',
    icon: '\u2194',
    check(landmarks) {
      if (!landmarks) return 0;
      const lShoulder = landmarks[11];
      const rShoulder = landmarks[12];
      const lWrist = landmarks[15];
      const rWrist = landmarks[16];
      if (!lShoulder || !rShoulder || !lWrist || !rWrist) return 0;

      let matchScore = 0;
      // Wrists at roughly shoulder height
      const tolerance = 0.08;
      if (Math.abs(lWrist.y - lShoulder.y) < tolerance) matchScore += 0.3;
      if (Math.abs(rWrist.y - rShoulder.y) < tolerance) matchScore += 0.3;
      // Wrists far from body center
      const centerX = (lShoulder.x + rShoulder.x) / 2;
      if (Math.abs(lWrist.x - centerX) > 0.2) matchScore += 0.2;
      if (Math.abs(rWrist.x - centerX) > 0.2) matchScore += 0.2;
      return matchScore;
    },
    draw(ctx, w, h) {
      drawStickFigure(ctx, w, h, {
        lArm: [{ x: 0.2, y: 0.4 }, { x: 0.1, y: 0.4 }],
        rArm: [{ x: 0.8, y: 0.4 }, { x: 0.9, y: 0.4 }],
      }, 'target');
    },
  },
  'left-arm-up': {
    name: 'Left Up',
    icon: '\u2196',
    check(landmarks) {
      if (!landmarks) return 0;
      const lShoulder = landmarks[11];
      const rShoulder = landmarks[12];
      const lWrist = landmarks[15];
      const rWrist = landmarks[16];
      const rHip = landmarks[24];
      if (!lShoulder || !rShoulder || !lWrist || !rWrist) return 0;

      let matchScore = 0;
      // Left wrist above shoulder
      if (lWrist.y < lShoulder.y) matchScore += 0.4;
      // Right arm down (near hip)
      if (rHip && Math.abs(rWrist.y - rHip.y) < 0.15) matchScore += 0.3;
      if (lWrist.y < lShoulder.y - 0.1) matchScore += 0.3;
      return matchScore;
    },
    draw(ctx, w, h) {
      drawStickFigure(ctx, w, h, {
        lArm: [{ x: 0.35, y: 0.25 }, { x: 0.3, y: 0.15 }],
        rArm: [{ x: 0.65, y: 0.5 }, { x: 0.65, y: 0.6 }],
      }, 'target');
    },
  },
  'right-arm-up': {
    name: 'Right Up',
    icon: '\u2197',
    check(landmarks) {
      if (!landmarks) return 0;
      const lShoulder = landmarks[11];
      const rShoulder = landmarks[12];
      const lWrist = landmarks[15];
      const rWrist = landmarks[16];
      const lHip = landmarks[23];
      if (!lShoulder || !rShoulder || !lWrist || !rWrist) return 0;

      let matchScore = 0;
      if (rWrist.y < rShoulder.y) matchScore += 0.4;
      if (lHip && Math.abs(lWrist.y - lHip.y) < 0.15) matchScore += 0.3;
      if (rWrist.y < rShoulder.y - 0.1) matchScore += 0.3;
      return matchScore;
    },
    draw(ctx, w, h) {
      drawStickFigure(ctx, w, h, {
        lArm: [{ x: 0.35, y: 0.5 }, { x: 0.35, y: 0.6 }],
        rArm: [{ x: 0.65, y: 0.25 }, { x: 0.7, y: 0.15 }],
      }, 'target');
    },
  },
  'hands-on-hips': {
    name: 'Hands on Hips',
    icon: '\u25C7',
    check(landmarks) {
      if (!landmarks) return 0;
      const lHip = landmarks[23];
      const rHip = landmarks[24];
      const lWrist = landmarks[15];
      const rWrist = landmarks[16];
      const lElbow = landmarks[13];
      const rElbow = landmarks[14];
      if (!lHip || !rHip || !lWrist || !rWrist) return 0;

      let matchScore = 0;
      const tolerance = 0.1;
      if (Math.abs(lWrist.y - lHip.y) < tolerance) matchScore += 0.25;
      if (Math.abs(rWrist.y - rHip.y) < tolerance) matchScore += 0.25;
      if (Math.abs(lWrist.x - lHip.x) < tolerance) matchScore += 0.25;
      if (Math.abs(rWrist.x - rHip.x) < tolerance) matchScore += 0.25;
      return matchScore;
    },
    draw(ctx, w, h) {
      drawStickFigure(ctx, w, h, {
        lArm: [{ x: 0.38, y: 0.45 }, { x: 0.4, y: 0.55 }],
        rArm: [{ x: 0.62, y: 0.45 }, { x: 0.6, y: 0.55 }],
      }, 'target');
    },
  },
  'squat': {
    name: 'Squat',
    icon: '\u2193',
    check(landmarks) {
      if (!landmarks) return 0;
      const lHip = landmarks[23];
      const rHip = landmarks[24];
      const lKnee = landmarks[25];
      const rKnee = landmarks[26];
      const lShoulder = landmarks[11];
      if (!lHip || !rHip || !lKnee || !rKnee || !lShoulder) return 0;

      let matchScore = 0;
      // Hips should be closer to knees (low position)
      const hipKneeDist = Math.abs(lHip.y - lKnee.y);
      if (hipKneeDist < 0.12) matchScore += 0.5;
      else if (hipKneeDist < 0.18) matchScore += 0.25;
      // Shoulders lowered
      if (lShoulder.y > 0.35) matchScore += 0.5;
      return matchScore;
    },
    draw(ctx, w, h) {
      drawStickFigure(ctx, w, h, {
        lArm: [{ x: 0.3, y: 0.45 }, { x: 0.2, y: 0.45 }],
        rArm: [{ x: 0.7, y: 0.45 }, { x: 0.8, y: 0.45 }],
        squat: true,
      }, 'target');
    },
  },
  'lean-left': {
    name: 'Lean Left',
    icon: '\u2190',
    check(landmarks) {
      if (!landmarks) return 0;
      const lShoulder = landmarks[11];
      const rShoulder = landmarks[12];
      const lHip = landmarks[23];
      const rHip = landmarks[24];
      if (!lShoulder || !rShoulder || !lHip || !rHip) return 0;

      let matchScore = 0;
      const shoulderCenter = (lShoulder.x + rShoulder.x) / 2;
      const hipCenter = (lHip.x + rHip.x) / 2;
      // In mirrored view, lean-left means shoulders shifted right of hips
      const lean = shoulderCenter - hipCenter;
      if (lean > 0.04) matchScore += 0.5;
      if (lean > 0.08) matchScore += 0.5;
      return matchScore;
    },
    draw(ctx, w, h) {
      drawStickFigure(ctx, w, h, {
        lArm: [{ x: 0.3, y: 0.35 }, { x: 0.2, y: 0.3 }],
        rArm: [{ x: 0.6, y: 0.45 }, { x: 0.55, y: 0.55 }],
        leanLeft: true,
      }, 'target');
    },
  },
  'lean-right': {
    name: 'Lean Right',
    icon: '\u2192',
    check(landmarks) {
      if (!landmarks) return 0;
      const lShoulder = landmarks[11];
      const rShoulder = landmarks[12];
      const lHip = landmarks[23];
      const rHip = landmarks[24];
      if (!lShoulder || !rShoulder || !lHip || !rHip) return 0;

      let matchScore = 0;
      const shoulderCenter = (lShoulder.x + rShoulder.x) / 2;
      const hipCenter = (lHip.x + rHip.x) / 2;
      const lean = hipCenter - shoulderCenter;
      if (lean > 0.04) matchScore += 0.5;
      if (lean > 0.08) matchScore += 0.5;
      return matchScore;
    },
    draw(ctx, w, h) {
      drawStickFigure(ctx, w, h, {
        lArm: [{ x: 0.4, y: 0.45 }, { x: 0.45, y: 0.55 }],
        rArm: [{ x: 0.7, y: 0.35 }, { x: 0.8, y: 0.3 }],
        leanRight: true,
      }, 'target');
    },
  },
  'dab-left': {
    name: 'Dab Left',
    icon: '\u2199',
    check(landmarks) {
      if (!landmarks) return 0;
      const lShoulder = landmarks[11];
      const rShoulder = landmarks[12];
      const lWrist = landmarks[15];
      const rWrist = landmarks[16];
      const lElbow = landmarks[13];
      if (!lShoulder || !rShoulder || !lWrist || !rWrist || !lElbow) return 0;

      let matchScore = 0;
      // Left arm extended diagonally down-left, right arm bent to face
      if (lWrist.x > lShoulder.x + 0.1 && lWrist.y > lShoulder.y) matchScore += 0.3;
      // Right wrist near face (nose area)
      const nose = landmarks[0];
      if (nose && dist2d(rWrist, nose) < 0.15) matchScore += 0.4;
      // Left arm extended
      if (dist2d(lWrist, lShoulder) > 0.2) matchScore += 0.3;
      return matchScore;
    },
    draw(ctx, w, h) {
      drawStickFigure(ctx, w, h, {
        lArm: [{ x: 0.25, y: 0.35 }, { x: 0.15, y: 0.5 }],
        rArm: [{ x: 0.55, y: 0.3 }, { x: 0.45, y: 0.2 }],
      }, 'target');
    },
  },
  'dab-right': {
    name: 'Dab Right',
    icon: '\u2198',
    check(landmarks) {
      if (!landmarks) return 0;
      const lShoulder = landmarks[11];
      const rShoulder = landmarks[12];
      const lWrist = landmarks[15];
      const rWrist = landmarks[16];
      if (!lShoulder || !rShoulder || !lWrist || !rWrist) return 0;

      let matchScore = 0;
      if (rWrist.x < rShoulder.x - 0.1 && rWrist.y > rShoulder.y) matchScore += 0.3;
      const nose = landmarks[0];
      if (nose && dist2d(lWrist, nose) < 0.15) matchScore += 0.4;
      if (dist2d(rWrist, rShoulder) > 0.2) matchScore += 0.3;
      return matchScore;
    },
    draw(ctx, w, h) {
      drawStickFigure(ctx, w, h, {
        lArm: [{ x: 0.45, y: 0.3 }, { x: 0.55, y: 0.2 }],
        rArm: [{ x: 0.75, y: 0.35 }, { x: 0.85, y: 0.5 }],
      }, 'target');
    },
  },
};

const POSE_KEYS = Object.keys(POSES);

// ===== Helper Functions =====
function dist2d(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function drawStickFigure(ctx, w, h, opts = {}, colorType = 'idle') {
  ctx.clearRect(0, 0, w, h);

  const headY = opts.squat ? 0.3 : 0.18;
  const shoulderY = opts.squat ? 0.38 : 0.32;
  const hipY = opts.squat ? 0.58 : 0.58;
  let bodyTilt = 0;
  if (opts.leanLeft) bodyTilt = -0.04;
  if (opts.leanRight) bodyTilt = 0.04;

  const cx = 0.5 + bodyTilt;
  const lShoulderX = cx - 0.12 + bodyTilt;
  const rShoulderX = cx + 0.12 + bodyTilt;
  const kneeY = opts.squat ? 0.7 : 0.75;
  const footY = opts.squat ? 0.85 : 0.92;
  const legSpread = opts.squat ? 0.12 : 0.08;

  // Get color based on type
  let color;
  if (colorType === 'player') {
    color = JUST_DANCE_COLORS.player;
  } else if (colorType === 'target') {
    color = JUST_DANCE_COLORS.target;
  } else {
    color = JUST_DANCE_COLORS[colorType] || JUST_DANCE_COLORS.player;
  }

  const r = color.r, g = color.g, b = color.b;
  const darkR = Math.max(0, r - 80), darkG = Math.max(0, g - 80), darkB = Math.max(0, b - 80);
  // Scale all pixel sizes relative to canvas size (reference design: 600×720)
  const s = Math.min(w / 600, h / 720);
  const LIMB_W = Math.max(4, Math.round(40 * s));
  const LIMB_SHORTEN_FACTOR = 0.3;
  const headRx = Math.round(55 * s);
  const headRy = Math.round(65 * s);

  // Helper: draw a solid chibi limb with dark 2px stroke border
  function solidLimb(x1, y1, x2, y2, width) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Dark border
    ctx.beginPath();
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.strokeStyle = `rgba(${darkR}, ${darkG}, ${darkB}, 0.9)`;
    ctx.lineWidth = width + 4;
    ctx.stroke();
    // Solid fill
    ctx.beginPath();
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.9)`;
    ctx.lineWidth = width;
    ctx.stroke();
    ctx.restore();
  }

  // Helper: draw a filled joint circle
  function solidJoint(x, y, radius) {
    ctx.fillStyle = `rgba(${darkR}, ${darkG}, ${darkB}, 0.9)`;
    ctx.beginPath();
    ctx.arc(x, y, radius + 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.9)`;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- Filled rounded torso ---
  const lsx = lShoulderX * w, lsy = shoulderY * h;
  const rsx = rShoulderX * w, rsy = shoulderY * h;
  const lhx = (cx - legSpread + bodyTilt) * w, lhy = hipY * h;
  const rhx = (cx + legSpread + bodyTilt) * w, rhy = hipY * h;
  const pad = Math.round(10 * s);

  ctx.save();
  ctx.fillStyle = `rgba(${darkR}, ${darkG}, ${darkB}, 0.9)`;
  ctx.beginPath();
  ctx.moveTo(lsx - pad - 3, lsy - 3);
  ctx.quadraticCurveTo((lsx + rsx) / 2, lsy - pad - 5, rsx + pad + 3, rsy - 3);
  ctx.quadraticCurveTo(rsx + pad + 5, (rsy + rhy) / 2, rhx + pad + 3, rhy + 3);
  ctx.quadraticCurveTo((lhx + rhx) / 2, lhy + pad + 5, lhx - pad - 3, lhy + 3);
  ctx.quadraticCurveTo(lsx - pad - 5, (lsy + lhy) / 2, lsx - pad - 3, lsy - 3);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.9)`;
  ctx.strokeStyle = `rgba(${darkR}, ${darkG}, ${darkB}, 0.95)`;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(lsx - pad, lsy);
  ctx.quadraticCurveTo((lsx + rsx) / 2, lsy - pad - 2, rsx + pad, rsy);
  ctx.quadraticCurveTo(rsx + pad + 2, (rsy + rhy) / 2, rhx + pad, rhy);
  ctx.quadraticCurveTo((lhx + rhx) / 2, lhy + pad + 2, lhx - pad, lhy);
  ctx.quadraticCurveTo(lsx - pad - 2, (lsy + lhy) / 2, lsx - pad, lsy);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // --- Neck ---
  const headX = cx * w;
  const neckTopY = headY * h + headRy;
  const neckBotY = shoulderY * h;
  solidLimb(headX, neckTopY, headX, neckBotY, Math.round(18 * s));

  // --- Arms (chibi shortened forearms) ---
  if (opts.lArm) {
    const elbowX = opts.lArm[0].x * w, elbowY = opts.lArm[0].y * h;
    let wristX = opts.lArm[1].x * w, wristY = opts.lArm[1].y * h;
    // Shorten forearm by 30%
    wristX = elbowX + (wristX - elbowX) * (1 - LIMB_SHORTEN_FACTOR);
    wristY = elbowY + (wristY - elbowY) * (1 - LIMB_SHORTEN_FACTOR);
    solidLimb(lShoulderX * w, shoulderY * h, elbowX, elbowY, LIMB_W);
    solidLimb(elbowX, elbowY, wristX, wristY, LIMB_W - Math.round(6 * s));
    // Elbow joint
    solidJoint(elbowX, elbowY, Math.round(18 * s));
    // Mitten hand
    ctx.fillStyle = `rgba(${darkR}, ${darkG}, ${darkB}, 0.9)`;
    ctx.beginPath(); ctx.arc(wristX, wristY, Math.round(20 * s), 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.9)`;
    ctx.beginPath(); ctx.arc(wristX, wristY, Math.round(17 * s), 0, Math.PI * 2); ctx.fill();
  }
  if (opts.rArm) {
    const elbowX = opts.rArm[0].x * w, elbowY = opts.rArm[0].y * h;
    let wristX = opts.rArm[1].x * w, wristY = opts.rArm[1].y * h;
    wristX = elbowX + (wristX - elbowX) * (1 - LIMB_SHORTEN_FACTOR);
    wristY = elbowY + (wristY - elbowY) * (1 - LIMB_SHORTEN_FACTOR);
    solidLimb(rShoulderX * w, shoulderY * h, elbowX, elbowY, LIMB_W);
    solidLimb(elbowX, elbowY, wristX, wristY, LIMB_W - Math.round(6 * s));
    solidJoint(elbowX, elbowY, Math.round(18 * s));
    ctx.fillStyle = `rgba(${darkR}, ${darkG}, ${darkB}, 0.9)`;
    ctx.beginPath(); ctx.arc(wristX, wristY, Math.round(20 * s), 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.9)`;
    ctx.beginPath(); ctx.arc(wristX, wristY, Math.round(17 * s), 0, Math.PI * 2); ctx.fill();
  }

  // Shoulder joints
  solidJoint(lShoulderX * w, shoulderY * h, Math.round(20 * s));
  solidJoint(rShoulderX * w, shoulderY * h, Math.round(20 * s));

  // --- Legs (chibi shortened lower legs) ---
  const hipCx = (cx + bodyTilt) * w;
  const lKneeX = (cx - legSpread + bodyTilt) * w, lKneeY = kneeY * h;
  const rKneeX = (cx + legSpread + bodyTilt) * w, rKneeY = kneeY * h;
  let lFootX = lKneeX, lFootY = footY * h;
  let rFootX = rKneeX, rFootY = footY * h;
  // Shorten lower legs by 30%
  lFootX = lKneeX + (lFootX - lKneeX) * (1 - LIMB_SHORTEN_FACTOR);
  lFootY = lKneeY + (lFootY - lKneeY) * (1 - LIMB_SHORTEN_FACTOR);
  rFootX = rKneeX + (rFootX - rKneeX) * (1 - LIMB_SHORTEN_FACTOR);
  rFootY = rKneeY + (rFootY - rKneeY) * (1 - LIMB_SHORTEN_FACTOR);

  // Upper legs
  solidLimb(hipCx, hipY * h, lKneeX, lKneeY, LIMB_W + Math.round(4 * s));
  solidLimb(hipCx, hipY * h, rKneeX, rKneeY, LIMB_W + Math.round(4 * s));
  // Lower legs
  solidLimb(lKneeX, lKneeY, lFootX, lFootY, LIMB_W);
  solidLimb(rKneeX, rKneeY, rFootX, rFootY, LIMB_W);

  // Hip joints
  solidJoint(hipCx, hipY * h, Math.round(22 * s));
  // Knee joints
  solidJoint(lKneeX, lKneeY, Math.round(18 * s));
  solidJoint(rKneeX, rKneeY, Math.round(18 * s));

  // Shoe feet (rounded ellipses)
  for (const [fx, fy] of [[lFootX, lFootY], [rFootX, rFootY]]) {
    ctx.fillStyle = `rgba(${darkR}, ${darkG}, ${darkB}, 0.9)`;
    ctx.beginPath(); ctx.ellipse(fx, fy, Math.round(26 * s), Math.round(16 * s), 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.9)`;
    ctx.beginPath(); ctx.ellipse(fx, fy, Math.round(22 * s), Math.round(13 * s), 0, 0, Math.PI * 2); ctx.fill();
  }

  // --- Cute Head (headRx × headRy radius) ---
  const headCY = headY * h;

  // Head border
  ctx.save();
  ctx.translate(headX, headCY);
  ctx.scale(1, headRy / headRx);
  ctx.fillStyle = `rgba(${darkR}, ${darkG}, ${darkB}, 0.9)`;
  ctx.beginPath(); ctx.arc(0, 0, headRx + 3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // Head shape (solid filled oval)
  ctx.save();
  ctx.translate(headX, headCY);
  ctx.scale(1, headRy / headRx);
  ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.9)`;
  ctx.strokeStyle = `rgba(${darkR}, ${darkG}, ${darkB}, 0.95)`;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, headRx, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  ctx.restore();

  // Hair (cute spiky strokes)
  ctx.strokeStyle = `rgba(${darkR}, ${darkG}, ${darkB}, 0.85)`;
  ctx.lineWidth = Math.max(1, Math.round(3 * s)); ctx.lineCap = 'round';
  for (let i = -5; i <= 5; i++) {
    const hx = headX + i * 9 * s;
    const hy = headCY - headRy - 1;
    ctx.beginPath();
    ctx.moveTo(hx, hy + 8 * s);
    ctx.quadraticCurveTo(hx + i * 1.5 * s, hy - 10 * s, hx + i * 3 * s, hy - 1);
    ctx.stroke();
  }

  // Ears (round, solid)
  const earY = headCY - 1;
  for (const side of [-1, 1]) {
    const earCx = headX + side * (headRx + Math.round(8 * s));
    ctx.fillStyle = `rgba(${darkR}, ${darkG}, ${darkB}, 0.8)`;
    ctx.beginPath(); ctx.arc(earCx, earY, Math.round(12 * s), 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.85)`;
    ctx.beginPath(); ctx.arc(earCx, earY, Math.round(10 * s), 0, Math.PI * 2); ctx.fill();
  }

  // Big cute eyes (solid white with large pupils)
  const eyeOffX = Math.round(18 * s), eyeOffY = -Math.round(5 * s), eyeW = Math.round(13 * s), eyeH = Math.round(10 * s);
  // Eye whites
  ctx.fillStyle = 'rgb(255, 255, 255)';
  ctx.beginPath(); ctx.ellipse(headX - eyeOffX, headCY + eyeOffY, eyeW, eyeH, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(headX + eyeOffX, headCY + eyeOffY, eyeW, eyeH, 0, 0, Math.PI * 2); ctx.fill();
  // Eye outlines
  ctx.strokeStyle = `rgba(${darkR}, ${darkG}, ${darkB}, 0.7)`;
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.ellipse(headX - eyeOffX, headCY + eyeOffY, eyeW, eyeH, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(headX + eyeOffX, headCY + eyeOffY, eyeW, eyeH, 0, 0, Math.PI * 2); ctx.stroke();
  // Large pupils
  ctx.fillStyle = `rgb(${darkR}, ${darkG}, ${darkB})`;
  ctx.beginPath(); ctx.arc(headX - eyeOffX, headCY + eyeOffY, Math.round(6 * s), 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(headX + eyeOffX, headCY + eyeOffY, Math.round(6 * s), 0, Math.PI * 2); ctx.fill();
  // Eye sparkle
  ctx.fillStyle = 'rgb(255, 255, 255)';
  const sp = Math.round(3 * s), sr = Math.max(1, Math.round(2.5 * s));
  ctx.beginPath(); ctx.arc(headX - eyeOffX + sp, headCY + eyeOffY - sp, sr, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(headX + eyeOffX + sp, headCY + eyeOffY - sp, sr, 0, Math.PI * 2); ctx.fill();

  // Nose (white highlight to stand out against any character color)
  ctx.fillStyle = `rgba(255, 255, 255, 0.55)`;
  ctx.beginPath(); ctx.arc(headX, headCY + Math.round(9 * s), Math.max(2, Math.round(4 * s)), 0, Math.PI * 2); ctx.fill();

  // Mouth (cute smile arc)
  ctx.strokeStyle = `rgba(${darkR}, ${darkG}, ${darkB}, 0.8)`;
  ctx.lineWidth = Math.max(1, Math.round(2.5 * s)); ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(headX, headCY + Math.round(21 * s), Math.round(13 * s), 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();

  // Blush (cute rosy cheeks)
  ctx.fillStyle = 'rgba(255, 150, 180, 0.35)';
  ctx.beginPath(); ctx.ellipse(headX - Math.round(33 * s), headCY + Math.round(10 * s), Math.round(12 * s), Math.round(7 * s), 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(headX + Math.round(33 * s), headCY + Math.round(10 * s), Math.round(12 * s), Math.round(7 * s), 0, 0, Math.PI * 2); ctx.fill();
}

// ===== Song / Beat Map Definitions =====
// Audio from Pixabay (https://pixabay.com/music/) — free to use under the Pixabay Content License
const SONGS = {
  'pop-dance-beat': {
    name: 'Pop Dance Beat',
    bpm: 120,
    duration: 60,
    difficulty: 'easy',
    style: 'synthpop',
    audioUrl: 'https://cdn.pixabay.com/audio/2024/11/29/audio_90a07a6412.mp3',
    generateBeats() { return generateStructuredBeatMap(this.bpm, this.duration, 'easy', 'synthpop'); },
  },
  'tropical-house': {
    name: 'Tropical House',
    bpm: 110,
    duration: 60,
    difficulty: 'easy',
    style: 'lofi',
    audioUrl: 'https://cdn.pixabay.com/audio/2022/05/27/audio_14c81d3222.mp3',
    generateBeats() { return generateStructuredBeatMap(this.bpm, this.duration, 'easy', 'lofi'); },
  },
  'funky-groove': {
    name: 'Funky Groove',
    bpm: 115,
    duration: 60,
    difficulty: 'easy',
    style: 'disco',
    audioUrl: 'https://cdn.pixabay.com/audio/2024/09/24/audio_e4a5da2ff3.mp3',
    generateBeats() { return generateStructuredBeatMap(this.bpm, this.duration, 'easy', 'disco'); },
  },
  'edm-drop': {
    name: 'EDM Drop',
    bpm: 128,
    duration: 60,
    difficulty: 'medium',
    style: 'edm',
    audioUrl: 'https://cdn.pixabay.com/audio/2024/06/06/audio_48e9cf2ffa.mp3',
    generateBeats() { return generateStructuredBeatMap(this.bpm, this.duration, 'medium', 'edm'); },
  },
  'house-beat': {
    name: 'House Beat',
    bpm: 124,
    duration: 60,
    difficulty: 'medium',
    style: 'house',
    audioUrl: 'https://cdn.pixabay.com/audio/2024/08/06/audio_69a61c5e14.mp3',
    generateBeats() { return generateStructuredBeatMap(this.bpm, this.duration, 'medium', 'house'); },
  },
  'afrobeats-rhythm': {
    name: 'Afrobeats Rhythm',
    bpm: 110,
    duration: 60,
    difficulty: 'medium',
    style: 'reggaeton',
    audioUrl: 'https://cdn.pixabay.com/audio/2024/01/18/audio_cb73ddb46e.mp3',
    generateBeats() { return generateStructuredBeatMap(this.bpm, this.duration, 'medium', 'reggaeton'); },
  },
  'upbeat-funk': {
    name: 'Upbeat Funk',
    bpm: 120,
    duration: 60,
    difficulty: 'medium',
    style: 'future-bass',
    audioUrl: 'https://cdn.pixabay.com/audio/2023/04/23/audio_87b3225287.mp3',
    generateBeats() { return generateStructuredBeatMap(this.bpm, this.duration, 'medium', 'future-bass'); },
  },
  'energetic-beat': {
    name: 'Energetic Beat',
    bpm: 140,
    duration: 60,
    difficulty: 'hard',
    style: 'edm',
    audioUrl: 'https://cdn.pixabay.com/audio/2024/07/30/audio_13d732e545.mp3',
    generateBeats() { return generateStructuredBeatMap(this.bpm, this.duration, 'hard', 'edm'); },
  },
  'dnb-breakbeat': {
    name: 'DnB Breakbeat',
    bpm: 160,
    duration: 60,
    difficulty: 'hard',
    style: 'dnb',
    audioUrl: 'https://cdn.pixabay.com/audio/2024/02/07/audio_d9eb886306.mp3',
    generateBeats() { return generateStructuredBeatMap(this.bpm, this.duration, 'hard', 'dnb'); },
  },
  'high-energy-trap': {
    name: 'High Energy Trap',
    bpm: 150,
    duration: 60,
    difficulty: 'hard',
    style: 'hiphop',
    audioUrl: 'https://cdn.pixabay.com/audio/2022/05/27/audio_1808fbf07a.mp3',
    generateBeats() { return generateStructuredBeatMap(this.bpm, this.duration, 'hard', 'hiphop'); },
  },
  'custom-audio': {
    name: 'Custom Audio',
    bpm: 120,
    duration: 60,
    difficulty: 'medium',
    style: 'custom',
    generateBeats() {
      const bpm = customAudioBpm || 120;
      const dur = customAudioBuffer ? customAudioBuffer.duration : 60;
      const diff = customAudioDifficulty || 'medium';
      // Use hiphop style for choreography since it's versatile
      return generateStructuredBeatMap(bpm, dur, diff, 'hiphop');
    },
  },
};

// --- Song structure: each song has sections (intro, verse, chorus, drop, etc.) ---
// Beats are placed ON musical accents for tight sync
function generateStructuredBeatMap(bpm, duration, difficulty, style) {
  const beats = [];
  const b = 60 / bpm; // beat duration in seconds
  const bar = b * 4;   // bar duration

  // Determine section layout based on style
  const sections = buildSongSections(duration, bar, style);

  // Difficulty controls density
  const densityMap = { easy: 1, medium: 2, hard: 3 };
  const density = densityMap[difficulty] || 1;

  // AIST++ dataset-inspired choreography patterns
  // Maps dance genres from AIST++ (breaking, pop, lock, hip-hop, house, waack, krump, street jazz, ballet jazz)
  // to the game's pose system for authentic dance sequences
  const choreo = {
    // Breaking-inspired: power moves with level changes
    breaking: ['squat', 'arms-out', 'arms-up', 'squat', 'lean-left', 'arms-up', 'lean-right', 'squat'],
    // Pop/lock-inspired: sharp isolations and hits
    pop: ['arms-out', 'arms-up', 'hands-on-hips', 'arms-out', 'right-arm-up', 'arms-out', 'left-arm-up', 'arms-out'],
    // Hip-hop-inspired: bounce and groove
    hiphop: ['squat', 'arms-up', 'hands-on-hips', 'lean-left', 'squat', 'arms-up', 'hands-on-hips', 'lean-right'],
    // House-inspired: fluid footwork and jacking
    house: ['squat', 'arms-up', 'lean-left', 'arms-out', 'squat', 'arms-up', 'lean-right', 'arms-out'],
    // Waack-inspired: dramatic arm movements
    waack: ['right-arm-up', 'arms-out', 'left-arm-up', 'arms-up', 'dab-right', 'arms-out', 'dab-left', 'arms-up'],
    // Krump-inspired: aggressive energy and chest pops
    krump: ['arms-up', 'squat', 'dab-right', 'arms-up', 'squat', 'dab-left', 'arms-up', 'hands-on-hips'],
    // Street jazz-inspired: expressive full-body
    jazz: ['lean-left', 'arms-up', 'lean-right', 'dab-left', 'lean-left', 'arms-up', 'lean-right', 'dab-right'],
    // Wave flow: smooth transitions
    wave: ['left-arm-up', 'arms-up', 'right-arm-up', 'arms-out', 'left-arm-up', 'arms-up', 'right-arm-up', 'hands-on-hips'],
    // Hype: audience engagement moves
    hype: ['arms-up', 'dab-right', 'arms-up', 'dab-left', 'arms-up', 'hands-on-hips', 'arms-up', 'squat'],
  };
  const choreoKeys = Object.keys(choreo);

  let lastPose = '';
  let choreoIdx = 0;
  let currentChoreo = choreo[choreoKeys[0]];

  for (const section of sections) {
    const sectionStart = section.start;
    const sectionEnd = section.start + section.duration;

    // Pick AIST++ choreography pattern matched to music style and section energy
    if (section.type === 'chorus' || section.type === 'drop') {
      // High energy: use style-matched intense choreography
      const dropMap = {
        'synthpop': choreo.pop, 'edm': choreo.hype, 'dnb': choreo.krump,
        'lofi': choreo.wave, 'future-bass': choreo.waack, 'disco': choreo.jazz,
        'darksynth': choreo.krump, 'reggaeton': choreo.hiphop,
        'hiphop': choreo.hiphop, 'house': choreo.house,
      };
      currentChoreo = dropMap[style] || choreo.hype;
    } else if (section.type === 'verse') {
      // Moderate energy: cycle through AIST++ patterns
      const versePatterns = [choreo.wave, choreo.pop, choreo.house, choreo.jazz];
      currentChoreo = versePatterns[choreoIdx % versePatterns.length];
      choreoIdx++;
    } else if (section.type === 'breakdown') {
      currentChoreo = choreo.wave;
    } else if (section.type === 'buildup') {
      // Building energy: use progressive patterns
      currentChoreo = choreo.pop;
    }

    // Determine beat placement based on section type
    let beatTimes = [];
    if (section.type === 'intro' || section.type === 'outro') {
      // Sparse - every 2 bars
      for (let t = sectionStart + bar; t < sectionEnd - b; t += bar * 2) {
        beatTimes.push(t);
      }
    } else if (section.type === 'buildup') {
      // Accelerating: starts slow, gets faster
      let interval = bar * 2;
      let t = sectionStart;
      while (t < sectionEnd - b) {
        beatTimes.push(t);
        interval = Math.max(b, interval * 0.8);
        t += interval;
      }
    } else if (section.type === 'verse') {
      // On downbeats, density determines extra hits
      for (let t = sectionStart; t < sectionEnd - b; t += bar) {
        beatTimes.push(t); // beat 1
        if (density >= 2) beatTimes.push(t + b * 2); // beat 3
        if (density >= 3) beatTimes.push(t + b); // beat 2
      }
    } else if (section.type === 'chorus') {
      // Every other beat, strong groove
      for (let t = sectionStart; t < sectionEnd - b; t += b * 2) {
        beatTimes.push(t);
        if (density >= 3) beatTimes.push(t + b);
      }
    } else if (section.type === 'drop') {
      // Dense! Every beat in hard, every 2 in medium, every bar in easy
      const dropInterval = density >= 3 ? b : density >= 2 ? b * 2 : bar;
      for (let t = sectionStart; t < sectionEnd - b; t += dropInterval) {
        beatTimes.push(t);
      }
    } else if (section.type === 'breakdown') {
      // Slow, flowing
      for (let t = sectionStart; t < sectionEnd - b; t += bar) {
        beatTimes.push(t);
        if (density >= 2) beatTimes.push(t + b * 2);
      }
    }

    // Map beat times to poses from choreography
    let poseIdx = 0;
    for (const time of beatTimes) {
      if (time < 2 || time > duration - 2) continue;
      const pose = currentChoreo[poseIdx % currentChoreo.length];
      poseIdx++;
      if (pose === lastPose && POSE_KEYS.length > 1) {
        // Avoid immediate repeat
        const alt = currentChoreo[(poseIdx) % currentChoreo.length];
        beats.push({ time, pose: alt, hit: false, scored: false, section: section.type });
        lastPose = alt;
      } else {
        beats.push({ time, pose, hit: false, scored: false, section: section.type });
        lastPose = pose;
      }
    }
  }

  // Sort by time and deduplicate close beats
  beats.sort((a, b2) => a.time - b2.time);
  const filtered = [];
  for (const beat of beats) {
    if (filtered.length === 0 || beat.time - filtered[filtered.length - 1].time >= b * 0.8) {
      filtered.push(beat);
    }
  }
  return filtered;
}

function buildSongSections(duration, bar, style) {
  // Build a dynamic arrangement
  const sections = [];
  if (style === 'edm' || style === 'future-bass' || style === 'house') {
    // EDM structure: intro → buildup → drop → breakdown → buildup → drop → outro
    sections.push({ type: 'intro', start: 0, duration: bar * 2 });
    sections.push({ type: 'verse', start: bar * 2, duration: bar * 4 });
    sections.push({ type: 'buildup', start: bar * 6, duration: bar * 2 });
    sections.push({ type: 'drop', start: bar * 8, duration: bar * 4 });
    sections.push({ type: 'breakdown', start: bar * 12, duration: bar * 2 });
    sections.push({ type: 'buildup', start: bar * 14, duration: bar * 2 });
    sections.push({ type: 'drop', start: bar * 16, duration: bar * 4 });
    // Fill remaining with chorus/outro
    const remaining = duration - bar * 20;
    if (remaining > bar * 2) {
      sections.push({ type: 'chorus', start: bar * 20, duration: remaining - bar * 2 });
      sections.push({ type: 'outro', start: duration - bar * 2, duration: bar * 2 });
    } else if (remaining > 0) {
      sections.push({ type: 'outro', start: bar * 20, duration: remaining });
    }
  } else if (style === 'dnb' || style === 'darksynth' || style === 'hiphop') {
    // High energy: short intro → verse → drop → breakdown → drop → outro
    sections.push({ type: 'intro', start: 0, duration: bar * 2 });
    sections.push({ type: 'buildup', start: bar * 2, duration: bar * 2 });
    sections.push({ type: 'drop', start: bar * 4, duration: bar * 4 });
    sections.push({ type: 'breakdown', start: bar * 8, duration: bar * 2 });
    sections.push({ type: 'verse', start: bar * 10, duration: bar * 2 });
    sections.push({ type: 'buildup', start: bar * 12, duration: bar * 2 });
    sections.push({ type: 'drop', start: bar * 14, duration: bar * 4 });
    const remaining = duration - bar * 18;
    if (remaining > bar * 2) {
      sections.push({ type: 'chorus', start: bar * 18, duration: remaining - bar });
      sections.push({ type: 'outro', start: duration - bar, duration: bar });
    } else if (remaining > 0) {
      sections.push({ type: 'outro', start: bar * 18, duration: remaining });
    }
  } else {
    // Pop/disco/reggaeton/lofi: intro → verse → chorus → verse → chorus → outro
    sections.push({ type: 'intro', start: 0, duration: bar * 2 });
    sections.push({ type: 'verse', start: bar * 2, duration: bar * 4 });
    sections.push({ type: 'chorus', start: bar * 6, duration: bar * 4 });
    sections.push({ type: 'verse', start: bar * 10, duration: bar * 4 });
    sections.push({ type: 'chorus', start: bar * 14, duration: bar * 4 });
    const remaining = duration - bar * 18;
    if (remaining > 0) {
      sections.push({ type: 'outro', start: bar * 18, duration: remaining });
    }
  }
  return sections;
}

// Legacy wrapper for compatibility
function generateBeatMap(bpm, duration, difficulty) {
  return generateStructuredBeatMap(bpm, duration, difficulty, 'synthpop');
}

// ===== Audio Synthesis Engine v2 =====
// Advanced procedural music with vocals, structured arrangements, and effects
function createAudioContext() {
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
}

// ===== Pixabay Audio Loading =====
async function loadSongFromUrl(url) {
  songAudioBuffer = null;
  const response = await fetch(url);
  if (!response.ok) throw new Error('Failed to fetch audio');
  const arrayBuffer = await response.arrayBuffer();
  const tempCtx = new (window.AudioContext || window.webkitAudioContext)();
  songAudioBuffer = await tempCtx.decodeAudioData(arrayBuffer);
  tempCtx.close();
  return songAudioBuffer;
}

function playSongAudioBuffer(ctx, masterGain, now, duration) {
  if (!songAudioBuffer) return;
  const source = ctx.createBufferSource();
  source.buffer = songAudioBuffer;
  source.connect(masterGain);
  source.start(now);
  if (songAudioBuffer.duration > duration + 1) {
    source.stop(now + duration + 1);
  }
  audioNodes.songSource = source;
}

// ===== Custom Audio Loading & BPM Detection =====
async function loadCustomAudio(file) {
  const statusEl = document.getElementById('audio-loading-status');
  const fileNameEl = document.getElementById('audio-file-name');
  const optionsEl = document.getElementById('custom-audio-options');
  const uploadLabel = document.getElementById('upload-label');

  statusEl.classList.remove('hidden');
  statusEl.textContent = 'Loading audio...';

  try {
    const arrayBuffer = await file.arrayBuffer();
    const tempCtx = new (window.AudioContext || window.webkitAudioContext)();
    customAudioBuffer = await tempCtx.decodeAudioData(arrayBuffer);
    tempCtx.close();

    statusEl.textContent = 'Detecting BPM...';
    customAudioBpm = detectBPM(customAudioBuffer);

    // Update the custom song entry
    SONGS['custom-audio'].bpm = customAudioBpm;
    SONGS['custom-audio'].duration = customAudioBuffer.duration;

    fileNameEl.textContent = file.name;
    uploadLabel.classList.add('loaded');
    statusEl.textContent = `Ready! Detected ${customAudioBpm} BPM · ${Math.round(customAudioBuffer.duration)}s`;
    optionsEl.classList.remove('hidden');
    customAudioReady = true;

    // Auto-select custom audio song
    document.querySelectorAll('.song-btn').forEach((b) => b.classList.remove('selected'));
    selectedSong = 'custom-audio';
  } catch (err) {
    statusEl.textContent = 'Error loading audio file. Please try another file.';
    customAudioReady = false;
  }
}

function detectBPM(audioBuffer) {
  // Downsample to mono for analysis
  const rawData = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;

  // Use onset detection via spectral energy flux
  const windowSize = Math.round(sampleRate * 0.02); // 20ms windows
  const hopSize = Math.round(windowSize / 2);

  // Calculate energy for each window
  const energies = [];
  for (let i = 0; i + windowSize < rawData.length; i += hopSize) {
    let energy = 0;
    for (let j = 0; j < windowSize; j++) {
      energy += rawData[i + j] * rawData[i + j];
    }
    energies.push(energy / windowSize);
  }

  // Detect onsets: peaks in energy difference
  const onsets = [];
  const threshold = 1.5;
  const windowAvg = 8;
  for (let i = windowAvg; i < energies.length; i++) {
    let avg = 0;
    for (let j = 1; j <= windowAvg; j++) avg += energies[i - j];
    avg /= windowAvg;
    if (avg > 0 && energies[i] / avg > threshold) {
      onsets.push(i * hopSize / sampleRate); // time in seconds
    }
  }

  // Calculate intervals between onsets
  const intervals = [];
  for (let i = 1; i < onsets.length; i++) {
    const interval = onsets[i] - onsets[i - 1];
    if (interval > 0.2 && interval < 2.0) { // between 30 and 300 BPM
      intervals.push(interval);
    }
  }

  if (intervals.length === 0) return 120; // fallback

  // Cluster intervals to find most common tempo
  const bpmCounts = {};
  for (const interval of intervals) {
    const bpm = Math.round(60 / interval);
    // Also consider double and half time
    for (const candidate of [bpm, bpm * 2, Math.round(bpm / 2)]) {
      if (candidate >= 60 && candidate <= 200) {
        const rounded = Math.round(candidate / 2) * 2; // round to even
        bpmCounts[rounded] = (bpmCounts[rounded] || 0) + 1;
      }
    }
  }

  // Find the most common BPM
  let bestBpm = 120;
  let bestCount = 0;
  for (const [bpm, count] of Object.entries(bpmCounts)) {
    if (count > bestCount) {
      bestCount = count;
      bestBpm = parseInt(bpm);
    }
  }

  return bestBpm;
}

function playCustomAudio(ctx, masterGain, now, duration) {
  if (!customAudioBuffer) return;
  const source = ctx.createBufferSource();
  source.buffer = customAudioBuffer;
  source.connect(masterGain);
  source.start(now);
  // Stop at duration if audio is longer
  if (customAudioBuffer.duration > duration + 1) {
    source.stop(now + duration + 1);
  }
  audioNodes.customSource = source;
}

// ===== Beat Accent Sound for 卡点 (Beat-sync emphasis) =====
function scheduleBeatAccents(ctx, masterGain, now, bpm, duration) {
  const beatInterval = 60 / bpm;
  // Play a subtle tick/accent on every beat for strong rhythmic feel
  for (let t = 0; t < duration; t += beatInterval) {
    // Subtle click accent
    const click = ctx.createOscillator();
    const clickGain = ctx.createGain();
    click.type = 'sine';
    click.frequency.setValueAtTime(1200, now + t);
    click.frequency.exponentialRampToValueAtTime(800, now + t + 0.015);
    clickGain.gain.setValueAtTime(0.03, now + t);
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + t + 0.03);
    click.connect(clickGain);
    clickGain.connect(masterGain);
    click.start(now + t);
    click.stop(now + t + 0.05);

    // On downbeats (every 4 beats), add a stronger accent
    const beatNum = Math.round(t / beatInterval);
    if (beatNum % 4 === 0) {
      const accent = ctx.createOscillator();
      const accentGain = ctx.createGain();
      accent.type = 'triangle';
      accent.frequency.setValueAtTime(600, now + t);
      accentGain.gain.setValueAtTime(0.04, now + t);
      accentGain.gain.exponentialRampToValueAtTime(0.001, now + t + 0.06);
      accent.connect(accentGain);
      accentGain.connect(masterGain);
      accent.start(now + t);
      accent.stop(now + t + 0.08);
    }
  }
}

// Shared noise buffer (created once, reused)
let noiseBuffer = null;
function getNoiseBuffer(ctx) {
  if (!noiseBuffer || noiseBuffer.sampleRate !== ctx.sampleRate) {
    const len = ctx.sampleRate * 2;
    noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

// --- Enhanced synth primitives ---
function synthKick(ctx, master, now, t, pitch, vol) {
  // Sub oscillator for deep punch
  const sub = ctx.createOscillator();
  const subG = ctx.createGain();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(pitch || 150, now + t);
  sub.frequency.exponentialRampToValueAtTime(35, now + t + 0.08);
  subG.gain.setValueAtTime((vol || 0.4) * 1.2, now + t);
  subG.gain.exponentialRampToValueAtTime(0.01, now + t + 0.18);
  sub.connect(subG); subG.connect(master);
  sub.start(now + t); sub.stop(now + t + 0.25);
  // Click transient for attack
  const click = ctx.createOscillator();
  const clickG = ctx.createGain();
  click.type = 'square';
  click.frequency.setValueAtTime(800, now + t);
  click.frequency.exponentialRampToValueAtTime(100, now + t + 0.015);
  clickG.gain.setValueAtTime((vol || 0.4) * 0.3, now + t);
  clickG.gain.exponentialRampToValueAtTime(0.001, now + t + 0.02);
  click.connect(clickG); clickG.connect(master);
  click.start(now + t); click.stop(now + t + 0.03);
}

function synthHihat(ctx, master, now, t, vol, decay) {
  const src = ctx.createBufferSource();
  src.buffer = getNoiseBuffer(ctx);
  src.playbackRate.value = 1 + Math.random() * 0.1;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 10000; bp.Q.value = 1;
  const gain = ctx.createGain();
  const d = decay || 0.05;
  gain.gain.setValueAtTime(vol || 0.08, now + t);
  gain.gain.exponentialRampToValueAtTime(0.001, now + t + d);
  src.connect(hp); hp.connect(bp); bp.connect(gain); gain.connect(master);
  src.start(now + t); src.stop(now + t + d + 0.01);
}

function synthOpenHat(ctx, master, now, t, vol) {
  const src = ctx.createBufferSource();
  src.buffer = getNoiseBuffer(ctx);
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 6000;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol || 0.1, now + t);
  gain.gain.exponentialRampToValueAtTime(0.001, now + t + 0.2);
  src.connect(hp); hp.connect(gain); gain.connect(master);
  src.start(now + t); src.stop(now + t + 0.25);
}

function synthSnare(ctx, master, now, t, vol) {
  const v = vol || 0.2;
  // Body
  const osc = ctx.createOscillator();
  const oscG = ctx.createGain();
  osc.type = 'triangle'; osc.frequency.value = 220;
  oscG.gain.setValueAtTime(v * 0.7, now + t);
  oscG.gain.exponentialRampToValueAtTime(0.01, now + t + 0.06);
  osc.connect(oscG); oscG.connect(master);
  osc.start(now + t); osc.stop(now + t + 0.08);
  // Noise rattle
  const src = ctx.createBufferSource();
  src.buffer = getNoiseBuffer(ctx);
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2000;
  const bp = ctx.createBiquadFilter(); bp.type = 'peaking'; bp.frequency.value = 4500; bp.gain.value = 6;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(v, now + t);
  gain.gain.exponentialRampToValueAtTime(0.01, now + t + 0.12);
  src.connect(hp); hp.connect(bp); bp.connect(gain); gain.connect(master);
  src.start(now + t); src.stop(now + t + 0.15);
}

function synthClap(ctx, master, now, t, vol) {
  const v = vol || 0.25;
  // Multi-layer clap (3 short bursts)
  for (let i = 0; i < 3; i++) {
    const src = ctx.createBufferSource();
    src.buffer = getNoiseBuffer(ctx);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2200; bp.Q.value = 1.2;
    const gain = ctx.createGain();
    const offset = i * 0.008;
    gain.gain.setValueAtTime(v * (1 - i * 0.2), now + t + offset);
    gain.gain.exponentialRampToValueAtTime(0.01, now + t + offset + 0.04);
    src.connect(bp); bp.connect(gain); gain.connect(master);
    src.start(now + t + offset); src.stop(now + t + offset + 0.06);
  }
  // Tail
  const tail = ctx.createBufferSource();
  tail.buffer = getNoiseBuffer(ctx);
  const tailBp = ctx.createBiquadFilter(); tailBp.type = 'bandpass'; tailBp.frequency.value = 1800; tailBp.Q.value = 0.8;
  const tailG = ctx.createGain();
  tailG.gain.setValueAtTime(v * 0.5, now + t + 0.025);
  tailG.gain.exponentialRampToValueAtTime(0.01, now + t + 0.12);
  tail.connect(tailBp); tailBp.connect(tailG); tailG.connect(master);
  tail.start(now + t + 0.025); tail.stop(now + t + 0.15);
}

function synthNote(ctx, master, now, t, freq, dur, type, vol) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type || 'square';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(vol || 0.06, now + t);
  gain.gain.setValueAtTime(vol || 0.06, now + t + dur * 0.6);
  gain.gain.exponentialRampToValueAtTime(0.001, now + t + dur * 0.9);
  osc.connect(gain); gain.connect(master);
  osc.start(now + t); osc.stop(now + t + dur);
}

function synthChord(ctx, master, now, t, freqs, dur, type, vol) {
  freqs.forEach((f) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'triangle';
    osc.frequency.value = f;
    gain.gain.setValueAtTime(vol || 0.04, now + t);
    gain.gain.setValueAtTime(vol || 0.04, now + t + dur * 0.7);
    gain.gain.exponentialRampToValueAtTime(0.001, now + t + dur * 0.95);
    osc.connect(gain); gain.connect(master);
    osc.start(now + t); osc.stop(now + t + dur);
  });
}

// Supersaw: multiple detuned oscillators for a fat sound
function synthSupersaw(ctx, master, now, t, freqs, dur, vol) {
  const v = vol || 0.03;
  const detunes = [-12, -5, 0, 5, 12]; // cents
  freqs.forEach(f => {
    detunes.forEach(d => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = f;
      osc.detune.value = d;
      gain.gain.setValueAtTime(v / detunes.length, now + t);
      gain.gain.setValueAtTime(v / detunes.length, now + t + dur * 0.75);
      gain.gain.exponentialRampToValueAtTime(0.001, now + t + dur * 0.95);
      osc.connect(gain); gain.connect(master);
      osc.start(now + t); osc.stop(now + t + dur);
    });
  });
}

function synthBass(ctx, master, now, t, freq, dur, type, vol) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filt = ctx.createBiquadFilter();
  osc.type = type || 'sawtooth';
  osc.frequency.value = freq;
  filt.type = 'lowpass';
  filt.frequency.setValueAtTime(freq * 6, now + t);
  filt.frequency.exponentialRampToValueAtTime(freq * 2, now + t + dur * 0.5);
  filt.Q.value = 2;
  gain.gain.setValueAtTime(vol || 0.15, now + t);
  gain.gain.exponentialRampToValueAtTime(0.01, now + t + dur * 0.8);
  osc.connect(filt); filt.connect(gain); gain.connect(master);
  osc.start(now + t); osc.stop(now + t + dur * 0.9);
}

// Slide bass for groovy bass lines
function synthSlideBass(ctx, master, now, t, freqFrom, freqTo, dur, type, vol) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filt = ctx.createBiquadFilter();
  osc.type = type || 'sawtooth';
  osc.frequency.setValueAtTime(freqFrom, now + t);
  osc.frequency.exponentialRampToValueAtTime(freqTo, now + t + dur * 0.3);
  filt.type = 'lowpass';
  filt.frequency.setValueAtTime(freqTo * 8, now + t);
  filt.frequency.exponentialRampToValueAtTime(freqTo * 2, now + t + dur * 0.6);
  filt.Q.value = 3;
  gain.gain.setValueAtTime(vol || 0.15, now + t);
  gain.gain.exponentialRampToValueAtTime(0.01, now + t + dur * 0.85);
  osc.connect(filt); filt.connect(gain); gain.connect(master);
  osc.start(now + t); osc.stop(now + t + dur);
}

// --- Vocal synthesis using formant filters ---
// Formant frequencies for vowel sounds: [F1, F2, F3]
const FORMANTS = {
  a: [800, 1200, 2500],   // "ah"
  e: [400, 2200, 2800],   // "eh"
  i: [300, 2700, 3300],   // "ee"
  o: [500, 900, 2400],    // "oh"
  u: [350, 700, 2400],    // "oo"
};

function synthVocal(ctx, master, now, t, freq, dur, vowel, vol) {
  const v = vol || 0.08;
  const formant = FORMANTS[vowel] || FORMANTS.a;

  // Source: sawtooth for vocal buzz (like vocal cords)
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = freq;

  // Add slight vibrato
  const vibrato = ctx.createOscillator();
  const vibratoG = ctx.createGain();
  vibrato.frequency.value = 5.5;
  vibratoG.gain.value = freq * 0.015;
  vibrato.connect(vibratoG);
  vibratoG.connect(osc.frequency);
  vibrato.start(now + t); vibrato.stop(now + t + dur);

  // Parallel formant filters
  const merger = ctx.createGain();
  merger.gain.value = 1;
  for (let i = 0; i < formant.length; i++) {
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = formant[i];
    bp.Q.value = i === 0 ? 5 : (i === 1 ? 8 : 10);
    const fGain = ctx.createGain();
    fGain.gain.value = i === 0 ? 0.6 : (i === 1 ? 0.3 : 0.15);
    osc.connect(bp);
    bp.connect(fGain);
    fGain.connect(merger);
  }

  // Envelope
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.001, now + t);
  env.gain.linearRampToValueAtTime(v, now + t + 0.04); // attack
  env.gain.setValueAtTime(v, now + t + dur * 0.7);
  env.gain.exponentialRampToValueAtTime(0.001, now + t + dur * 0.95);
  merger.connect(env);
  env.connect(master);

  osc.start(now + t); osc.stop(now + t + dur);
}

// Vocal chant: sequence of vowels on same pitch
function synthVocalPhrase(ctx, master, now, t, freq, totalDur, vowels, vol) {
  const syllableDur = totalDur / vowels.length;
  for (let i = 0; i < vowels.length; i++) {
    synthVocal(ctx, master, now, t + i * syllableDur, freq, syllableDur * 0.9, vowels[i], vol);
  }
}

// Vocal "hey!" shout
function synthShout(ctx, master, now, t, freq, vol) {
  const v = vol || 0.12;
  // Short, punchy vocal
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(freq, now + t);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.8, now + t + 0.15);

  const bp1 = ctx.createBiquadFilter(); bp1.type = 'bandpass'; bp1.frequency.value = 800; bp1.Q.value = 3;
  const bp2 = ctx.createBiquadFilter(); bp2.type = 'bandpass'; bp2.frequency.value = 2500; bp2.Q.value = 5;
  const mix = ctx.createGain(); mix.gain.value = 1;
  const g1 = ctx.createGain(); g1.gain.value = 0.6;
  const g2 = ctx.createGain(); g2.gain.value = 0.4;
  osc.connect(bp1); bp1.connect(g1); g1.connect(mix);
  osc.connect(bp2); bp2.connect(g2); g2.connect(mix);

  const env = ctx.createGain();
  env.gain.setValueAtTime(v, now + t);
  env.gain.exponentialRampToValueAtTime(0.01, now + t + 0.2);
  mix.connect(env); env.connect(master);
  osc.start(now + t); osc.stop(now + t + 0.25);
}

// --- Effects ---
function synthRiser(ctx, master, now, t, dur, startFreq, endFreq) {
  // Noise sweep for build-up tension
  const src = ctx.createBufferSource();
  src.buffer = getNoiseBuffer(ctx);
  const filt = ctx.createBiquadFilter();
  filt.type = 'bandpass'; filt.Q.value = 2;
  filt.frequency.setValueAtTime(startFreq || 200, now + t);
  filt.frequency.exponentialRampToValueAtTime(endFreq || 8000, now + t + dur);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.01, now + t);
  gain.gain.linearRampToValueAtTime(0.15, now + t + dur * 0.9);
  gain.gain.linearRampToValueAtTime(0, now + t + dur);
  src.connect(filt); filt.connect(gain); gain.connect(master);
  src.start(now + t); src.stop(now + t + dur + 0.1);
}

function synthImpact(ctx, master, now, t, vol) {
  // Big downbeat hit - reverse crash + sub
  const src = ctx.createBufferSource();
  src.buffer = getNoiseBuffer(ctx);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
  lp.frequency.setValueAtTime(12000, now + t);
  lp.frequency.exponentialRampToValueAtTime(200, now + t + 0.8);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol || 0.3, now + t);
  gain.gain.exponentialRampToValueAtTime(0.01, now + t + 0.8);
  src.connect(lp); lp.connect(gain); gain.connect(master);
  src.start(now + t); src.stop(now + t + 1);
  // Sub boom
  const sub = ctx.createOscillator();
  const subG = ctx.createGain();
  sub.type = 'sine'; sub.frequency.value = 50;
  subG.gain.setValueAtTime(vol || 0.3, now + t);
  subG.gain.exponentialRampToValueAtTime(0.01, now + t + 0.5);
  sub.connect(subG); subG.connect(master);
  sub.start(now + t); sub.stop(now + t + 0.6);
}

// Drum fill helper
function synthDrumFill(ctx, master, now, t, b, intensity) {
  const n = intensity || 4;
  for (let i = 0; i < n; i++) {
    const off = i * (b / n);
    synthSnare(ctx, master, now, t + off, 0.15 + i * 0.04);
    if (i % 2 === 0) synthHihat(ctx, master, now, t + off, 0.06, 0.03);
  }
  // Crash at end
  synthOpenHat(ctx, master, now, t + b * 0.9, 0.12);
}

// --- Per-style synthesizers ---

function playSynthpop(ctx, master, now, bpm, dur) {
  const b = 60 / bpm;
  const bassNotes = [65.41, 82.41, 73.42, 87.31];
  const melodyNotes = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25];
  const chords = [[261.63, 329.63, 392.0], [220.0, 277.18, 329.63], [293.66, 369.99, 440.0], [246.94, 311.13, 369.99]];

  for (let t = 0; t < dur; t += b) {
    const bi = Math.floor(t / b);
    synthBass(ctx, master, now, t, bassNotes[bi % bassNotes.length], b);
    synthKick(ctx, master, now, t);
  }
  for (let t = 0; t < dur; t += b / 2) synthHihat(ctx, master, now, t);
  let mt = 0;
  while (mt < dur) {
    const nd = b * (Math.random() > 0.5 ? 1 : 0.5);
    synthNote(ctx, master, now, mt, melodyNotes[Math.floor(Math.random() * melodyNotes.length)], nd, 'square', 0.06);
    mt += nd;
  }
  let ct = 0, ci = 0;
  while (ct < dur) { synthChord(ctx, master, now, ct, chords[ci % chords.length], b * 4); ct += b * 4; ci++; }
  // AIST++ beat-synced vocal hits
  for (let t = 0; t < dur; t += b * 8) {
    synthShout(ctx, master, now, t, 220, 0.1);
    synthVocalPhrase(ctx, master, now, t + b * 4, 330, b * 2, ['o', 'a'], 0.07);
  }
}

function playEdm(ctx, master, now, bpm, dur) {
  const b = 60 / bpm;
  const bassNotes = [55.0, 61.74, 73.42, 65.41]; // A1, B1, D2, C2
  const leadNotes = [440.0, 493.88, 523.25, 587.33, 659.25, 783.99, 880.0];
  const chords = [[440.0, 554.37, 659.25], [349.23, 440.0, 523.25], [493.88, 622.25, 739.99], [523.25, 659.25, 783.99]];

  // Four-on-the-floor with sidechain feel
  for (let t = 0; t < dur; t += b) {
    synthKick(ctx, master, now, t, 160, 0.45);
    synthBass(ctx, master, now, t, bassNotes[Math.floor(t / (b * 4)) % bassNotes.length], b * 0.7, 'sawtooth', 0.12);
  }
  // Offbeat hi-hats
  for (let t = b / 2; t < dur; t += b) synthHihat(ctx, master, now, t, 0.06);
  // Clap on 2 and 4
  for (let t = b; t < dur; t += b * 2) synthClap(ctx, master, now, t, 0.2);
  // Arpeggiated lead
  let lt = 0;
  while (lt < dur) {
    const ci = Math.floor(lt / (b * 4)) % chords.length;
    const arpNotes = chords[ci];
    for (let a = 0; a < 4 && lt < dur; a++) {
      synthNote(ctx, master, now, lt, arpNotes[a % arpNotes.length] * (a >= 3 ? 2 : 1), b * 0.4, 'sawtooth', 0.05);
      lt += b;
    }
  }
  // Supersaw chords every 4 beats
  let ct = 0, ci = 0;
  while (ct < dur) {
    synthChord(ctx, master, now, ct, chords[ci % chords.length], b * 3.5, 'sawtooth', 0.025);
    ct += b * 4; ci++;
  }
  // AIST++ beat-synced vocal drops and chants
  for (let t = 0; t < dur; t += b * 8) {
    synthShout(ctx, master, now, t, 200, 0.12);
    synthShout(ctx, master, now, t + b * 4, 250, 0.1);
    synthVocalPhrase(ctx, master, now, t + b * 2, 300, b * 2, ['e', 'a', 'o'], 0.06);
  }
}

function playDnb(ctx, master, now, bpm, dur) {
  const b = 60 / bpm;
  const bassNotes = [55.0, 58.27, 65.41, 73.42]; // A1, Bb1, C2, D2
  const leadNotes = [523.25, 587.33, 622.25, 698.46, 783.99, 880.0, 932.33];

  // Two-step breakbeat pattern
  for (let bar = 0; bar < dur; bar += b * 4) {
    synthKick(ctx, master, now, bar, 170, 0.5);
    synthSnare(ctx, master, now, bar + b * 1.5, 0.3);
    synthKick(ctx, master, now, bar + b * 2.5, 170, 0.4);
    synthSnare(ctx, master, now, bar + b * 3, 0.25);
  }
  // Rapid hi-hats
  for (let t = 0; t < dur; t += b / 4) synthHihat(ctx, master, now, t, 0.04, 0.02);
  // Reese bass
  for (let t = 0; t < dur; t += b * 2) {
    const f = bassNotes[Math.floor(t / (b * 4)) % bassNotes.length];
    synthBass(ctx, master, now, t, f, b * 1.8, 'sawtooth', 0.18);
    // Detune layer for thickness
    synthBass(ctx, master, now, t, f * 1.007, b * 1.8, 'sawtooth', 0.08);
  }
  // Staccato lead
  let lt = 0;
  while (lt < dur) {
    const nd = b * (Math.random() > 0.6 ? 0.25 : 0.5);
    synthNote(ctx, master, now, lt, leadNotes[Math.floor(Math.random() * leadNotes.length)], nd, 'square', 0.04);
    lt += nd;
  }
  // AIST++ vocal energy hits
  for (let t = 0; t < dur; t += b * 4) {
    synthShout(ctx, master, now, t, 180, 0.1);
    if (Math.floor(t / (b * 8)) % 2 === 0) {
      synthVocalPhrase(ctx, master, now, t + b * 2, 280, b, ['a', 'e'], 0.06);
    }
  }
}

function playLofi(ctx, master, now, bpm, dur) {
  const b = 60 / bpm;
  // Jazz-flavored chords: Cmaj7, Am7, Dm7, G7
  const chords = [
    [261.63, 329.63, 392.0, 493.88],
    [220.0, 261.63, 329.63, 392.0],
    [293.66, 349.23, 440.0, 523.25],
    [196.0, 246.94, 293.66, 349.23],
  ];
  const bassNotes = [65.41, 55.0, 73.42, 49.0]; // C2, A1, D2, G1
  const pentatonic = [261.63, 293.66, 329.63, 392.0, 440.0];

  // Lazy kick + snare
  for (let t = 0; t < dur; t += b) {
    const bi = Math.floor(t / b) % 4;
    if (bi === 0 || bi === 2) synthKick(ctx, master, now, t, 120, 0.3);
    if (bi === 1 || bi === 3) synthSnare(ctx, master, now, t, 0.12);
  }
  // Soft hats
  for (let t = 0; t < dur; t += b / 2) synthHihat(ctx, master, now, t, 0.03, 0.04);
  // Warm bass
  for (let t = 0; t < dur; t += b * 4) {
    const ci = Math.floor(t / (b * 4)) % bassNotes.length;
    for (let nb = 0; nb < 4; nb++) {
      synthBass(ctx, master, now, t + nb * b, bassNotes[ci], b * 0.9, 'triangle', 0.12);
    }
  }
  // Rhodes-like chords
  let ct = 0, ci = 0;
  while (ct < dur) {
    synthChord(ctx, master, now, ct, chords[ci % chords.length], b * 3.8, 'triangle', 0.035);
    ct += b * 4; ci++;
  }
  // Mellow melody with rests
  let mt = 0;
  while (mt < dur) {
    if (Math.random() > 0.3) {
      synthNote(ctx, master, now, mt, pentatonic[Math.floor(Math.random() * pentatonic.length)], b * 1.5, 'sine', 0.05);
    }
    mt += b * (Math.random() > 0.5 ? 2 : 1);
  }
  // Soft vocal hums for AIST++ vibe
  for (let t = 0; t < dur; t += b * 16) {
    synthVocalPhrase(ctx, master, now, t + b * 2, 220, b * 4, ['u', 'o', 'a', 'o'], 0.04);
  }
}

function playFutureBass(ctx, master, now, bpm, dur) {
  const b = 60 / bpm;
  const chords = [
    [349.23, 440.0, 523.25],   // F major
    [392.0, 493.88, 587.33],   // G major
    [440.0, 523.25, 659.25],   // A minor
    [329.63, 415.30, 523.25],  // E major
  ];
  const bassNotes = [87.31, 98.0, 110.0, 82.41]; // F2, G2, A2, E2

  // Punchy kick
  for (let t = 0; t < dur; t += b) synthKick(ctx, master, now, t, 140, 0.4);
  // Claps on 2 & 4
  for (let t = b; t < dur; t += b * 2) synthClap(ctx, master, now, t, 0.25);
  // Syncopated hats
  for (let t = 0; t < dur; t += b / 2) {
    const loud = (Math.floor(t / (b / 2)) % 3 === 0) ? 0.07 : 0.04;
    synthHihat(ctx, master, now, t, loud, 0.03);
  }
  // Wobbly bass (pitch sweep)
  for (let t = 0; t < dur; t += b * 2) {
    const f = bassNotes[Math.floor(t / (b * 8)) % bassNotes.length];
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f, now + t);
    osc.frequency.linearRampToValueAtTime(f * 1.5, now + t + b);
    osc.frequency.linearRampToValueAtTime(f, now + t + b * 2);
    gain.gain.setValueAtTime(0.14, now + t);
    gain.gain.exponentialRampToValueAtTime(0.01, now + t + b * 1.8);
    osc.connect(gain); gain.connect(master);
    osc.start(now + t); osc.stop(now + t + b * 2);
  }
  // Bright stab chords (the signature "future bass" chop)
  let ct = 0, ci = 0;
  while (ct < dur) {
    const ch = chords[ci % chords.length];
    // Rhythmic chops
    synthChord(ctx, master, now, ct, ch, b * 0.4, 'sawtooth', 0.04);
    synthChord(ctx, master, now, ct + b, ch, b * 0.3, 'sawtooth', 0.035);
    synthChord(ctx, master, now, ct + b * 2.5, ch, b * 0.6, 'sawtooth', 0.04);
    ct += b * 4; ci++;
  }
  // Sparkly lead
  const leadNotes = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];
  let lt = 0;
  while (lt < dur) {
    if (Math.random() > 0.25) {
      synthNote(ctx, master, now, lt, leadNotes[Math.floor(Math.random() * leadNotes.length)], b * 0.3, 'sine', 0.04);
    }
    lt += b * 0.5;
  }
  // AIST++ vocal chops on drops
  for (let t = 0; t < dur; t += b * 4) {
    synthShout(ctx, master, now, t, 260, 0.1);
    synthVocal(ctx, master, now, t + b, 330, b * 0.5, 'a', 0.07);
    synthVocal(ctx, master, now, t + b * 2, 350, b * 0.5, 'o', 0.07);
  }
}

function playDisco(ctx, master, now, bpm, dur) {
  const b = 60 / bpm;
  const bassPattern = [130.81, 130.81, 164.81, 196.0]; // C3 C3 E3 G3
  const chords = [
    [261.63, 329.63, 392.0],  // C
    [293.66, 349.23, 440.0],  // Dm
    [329.63, 415.30, 493.88], // E
    [220.0, 277.18, 329.63],  // Am
  ];
  const strings = [523.25, 659.25, 783.99]; // High string pad

  // Four-on-the-floor disco kick
  for (let t = 0; t < dur; t += b) synthKick(ctx, master, now, t, 130, 0.35);
  // Open hi-hat on every offbeat
  for (let t = b / 2; t < dur; t += b) synthHihat(ctx, master, now, t, 0.1, 0.08);
  // Clap on 2 & 4
  for (let t = b; t < dur; t += b * 2) synthClap(ctx, master, now, t, 0.18);
  // Walking bass (octave bouncing)
  for (let bar = 0; bar < dur; bar += b * 4) {
    for (let nb = 0; nb < 4; nb++) {
      const f = bassPattern[nb];
      synthBass(ctx, master, now, bar + nb * b, f, b * 0.7, 'sawtooth', 0.14);
      // Octave ghost note
      if (nb % 2 === 0) synthBass(ctx, master, now, bar + nb * b + b * 0.5, f * 2, b * 0.3, 'triangle', 0.06);
    }
  }
  // Funky rhythm guitar (staccato chords)
  let ct = 0, ci = 0;
  while (ct < dur) {
    const ch = chords[ci % chords.length];
    // 16th-note strums with gaps
    for (let s = 0; s < 4; s++) {
      const off = s * b;
      synthChord(ctx, master, now, ct + off, ch, b * 0.2, 'square', 0.025);
      if (s !== 2) synthChord(ctx, master, now, ct + off + b * 0.5, ch, b * 0.15, 'square', 0.02);
    }
    ct += b * 4; ci++;
  }
  // String pad
  let st = 0;
  while (st < dur) {
    synthChord(ctx, master, now, st, strings, b * 8, 'sine', 0.03);
    st += b * 8;
  }
  // Disco vocal call-and-response
  for (let t = 0; t < dur; t += b * 8) {
    synthShout(ctx, master, now, t, 300, 0.1);
    synthVocalPhrase(ctx, master, now, t + b * 2, 350, b * 2, ['a', 'o', 'a'], 0.06);
    synthShout(ctx, master, now, t + b * 4, 280, 0.08);
  }
}

function playDarksynth(ctx, master, now, bpm, dur) {
  const b = 60 / bpm;
  const bassNotes = [55.0, 51.91, 58.27, 48.99]; // A1, Ab1, Bb1, G1
  const leadNotes = [440.0, 466.16, 523.25, 554.37, 622.25, 659.25, 739.99];
  const chords = [
    [220.0, 261.63, 329.63],   // Am
    [207.65, 261.63, 311.13],  // Ab aug
    [233.08, 277.18, 349.23],  // Bb
    [196.0, 246.94, 293.66],   // Gm
  ];

  // Heavy kick
  for (let t = 0; t < dur; t += b) synthKick(ctx, master, now, t, 180, 0.5);
  // Distorted snare on 2 & 4
  for (let t = b; t < dur; t += b * 2) { synthSnare(ctx, master, now, t, 0.35); synthClap(ctx, master, now, t, 0.15); }
  // 16th note hats
  for (let t = 0; t < dur; t += b / 4) synthHihat(ctx, master, now, t, 0.03, 0.02);
  // Gritty bass with detuned layer
  for (let t = 0; t < dur; t += b) {
    const f = bassNotes[Math.floor(t / (b * 4)) % bassNotes.length];
    synthBass(ctx, master, now, t, f, b * 0.85, 'sawtooth', 0.2);
    synthBass(ctx, master, now, t, f * 1.01, b * 0.85, 'square', 0.08);
  }
  // Dark pad
  let ct = 0, ci = 0;
  while (ct < dur) {
    synthChord(ctx, master, now, ct, chords[ci % chords.length], b * 4, 'sawtooth', 0.03);
    ct += b * 4; ci++;
  }
  // Aggressive lead (fast arps)
  let lt = 0;
  while (lt < dur) {
    const ci2 = Math.floor(lt / (b * 4)) % chords.length;
    const pool = [...chords[ci2], ...leadNotes.slice(0, 3)];
    synthNote(ctx, master, now, lt, pool[Math.floor(Math.random() * pool.length)], b * 0.2, 'sawtooth', 0.045);
    lt += b * 0.25;
  }
  // Dark vocal stabs
  for (let t = 0; t < dur; t += b * 8) {
    synthShout(ctx, master, now, t, 150, 0.12);
    synthVocal(ctx, master, now, t + b * 4, 180, b, 'o', 0.08);
  }
}

function playReggaeton(ctx, master, now, bpm, dur) {
  const b = 60 / bpm;
  const bassNotes = [73.42, 82.41, 65.41, 87.31]; // D2, E2, C2, F2
  const chords = [
    [293.66, 369.99, 440.0],   // Dm
    [329.63, 415.30, 493.88],  // E
    [261.63, 329.63, 392.0],   // C
    [349.23, 440.0, 523.25],   // F
  ];
  const melodyNotes = [587.33, 659.25, 698.46, 783.99, 880.0];

  // Dembow rhythm: kick pattern
  for (let bar = 0; bar < dur; bar += b * 4) {
    synthKick(ctx, master, now, bar, 140, 0.4);
    synthKick(ctx, master, now, bar + b * 1.5, 140, 0.3);
    synthKick(ctx, master, now, bar + b * 2, 140, 0.4);
    synthKick(ctx, master, now, bar + b * 3.5, 140, 0.3);
  }
  // Dembow snare/rim pattern
  for (let bar = 0; bar < dur; bar += b * 4) {
    synthSnare(ctx, master, now, bar + b * 0.75, 0.2);
    synthSnare(ctx, master, now, bar + b * 1.75, 0.15);
    synthClap(ctx, master, now, bar + b * 2.75, 0.2);
    synthSnare(ctx, master, now, bar + b * 3.75, 0.15);
  }
  // Shaker hats
  for (let t = 0; t < dur; t += b / 2) synthHihat(ctx, master, now, t, 0.05, 0.03);
  // Bouncy bass
  for (let t = 0; t < dur; t += b * 2) {
    const f = bassNotes[Math.floor(t / (b * 8)) % bassNotes.length];
    synthBass(ctx, master, now, t, f, b * 0.6, 'square', 0.16);
    synthBass(ctx, master, now, t + b, f * 1.5, b * 0.4, 'square', 0.1);
  }
  // Plucked chords
  let ct = 0, ci = 0;
  while (ct < dur) {
    synthChord(ctx, master, now, ct, chords[ci % chords.length], b * 0.3, 'triangle', 0.04);
    synthChord(ctx, master, now, ct + b * 2, chords[ci % chords.length], b * 0.3, 'triangle', 0.035);
    ct += b * 4; ci++;
  }
  // Catchy vocal-like melody
  let mt = 0;
  while (mt < dur) {
    if (Math.random() > 0.2) {
      const nd = b * (Math.random() > 0.4 ? 1 : 0.5);
      synthNote(ctx, master, now, mt, melodyNotes[Math.floor(Math.random() * melodyNotes.length)], nd, 'sine', 0.055);
    }
    mt += b;
  }
  // Reggaeton vocal hooks - "hey!" and chants
  for (let t = 0; t < dur; t += b * 4) {
    synthShout(ctx, master, now, t, 250, 0.12);
    synthVocalPhrase(ctx, master, now, t + b * 2, 320, b, ['e', 'a'], 0.08);
  }
}

function playHiphop(ctx, master, now, bpm, dur) {
  const b = 60 / bpm;
  const bassNotes = [55.0, 61.74, 49.0, 65.41]; // A1, B1, G1, C2
  const chords = [
    [220.0, 277.18, 329.63],  // Am
    [196.0, 246.94, 293.66],  // Gm
    [261.63, 329.63, 392.0],  // C
    [233.08, 293.66, 349.23], // Bb
  ];
  const melodyNotes = [440.0, 493.88, 523.25, 587.33, 659.25];

  // Boom-bap kick pattern
  for (let bar = 0; bar < dur; bar += b * 4) {
    synthKick(ctx, master, now, bar, 150, 0.45);
    synthKick(ctx, master, now, bar + b * 1.75, 150, 0.35);
    synthKick(ctx, master, now, bar + b * 2.5, 150, 0.4);
  }
  // Snare on 2 and 4
  for (let t = b; t < dur; t += b * 2) synthSnare(ctx, master, now, t, 0.3);
  // Tight hi-hats with swing
  for (let t = 0; t < dur; t += b / 2) {
    const swing = (Math.floor(t / (b / 2)) % 2 === 1) ? b * 0.08 : 0;
    synthHihat(ctx, master, now, t + swing, 0.05, 0.03);
  }
  // Open hat accents
  for (let t = b * 1.5; t < dur; t += b * 4) synthOpenHat(ctx, master, now, t, 0.08);
  // Deep 808 bass
  for (let t = 0; t < dur; t += b * 2) {
    const f = bassNotes[Math.floor(t / (b * 8)) % bassNotes.length];
    synthSlideBass(ctx, master, now, t, f, f * 0.8, b * 1.5, 'triangle', 0.18);
  }
  // Pad chords
  let ct = 0, ci = 0;
  while (ct < dur) {
    synthChord(ctx, master, now, ct, chords[ci % chords.length], b * 3.5, 'triangle', 0.03);
    ct += b * 4; ci++;
  }
  // Sparse melodic hits
  let mt = 0;
  while (mt < dur) {
    if (Math.random() > 0.4) {
      synthNote(ctx, master, now, mt, melodyNotes[Math.floor(Math.random() * melodyNotes.length)], b * 0.3, 'sine', 0.05);
    }
    mt += b;
  }
  // AIST++ vocal hooks - call and response
  for (let t = 0; t < dur; t += b * 4) {
    synthShout(ctx, master, now, t, 220, 0.14);
    synthVocalPhrase(ctx, master, now, t + b * 2, 280, b * 1.5, ['e', 'a', 'o'], 0.09);
  }
  // Vocal ad-libs on drops
  for (let t = 0; t < dur; t += b * 16) {
    synthVocalPhrase(ctx, master, now, t + b * 8, 350, b * 2, ['a', 'i', 'e', 'a'], 0.07);
  }
}

function playHouse(ctx, master, now, bpm, dur) {
  const b = 60 / bpm;
  const bassNotes = [65.41, 73.42, 82.41, 87.31]; // C2, D2, E2, F2
  const chords = [
    [261.63, 329.63, 392.0],  // C
    [293.66, 369.99, 440.0],  // Dm
    [349.23, 440.0, 523.25],  // F
    [392.0, 493.88, 587.33],  // G
  ];

  // Four-on-the-floor house kick
  for (let t = 0; t < dur; t += b) synthKick(ctx, master, now, t, 135, 0.4);
  // Clap on 2 & 4
  for (let t = b; t < dur; t += b * 2) synthClap(ctx, master, now, t, 0.22);
  // Shuffled hi-hats
  for (let t = 0; t < dur; t += b / 2) {
    const accent = (Math.floor(t / (b / 2)) % 4 === 2) ? 0.08 : 0.05;
    synthHihat(ctx, master, now, t, accent, 0.04);
  }
  // Open hat on offbeats
  for (let t = b / 2; t < dur; t += b * 2) synthOpenHat(ctx, master, now, t, 0.07);
  // Pumping bass
  for (let t = 0; t < dur; t += b) {
    const f = bassNotes[Math.floor(t / (b * 4)) % bassNotes.length];
    synthBass(ctx, master, now, t, f, b * 0.6, 'sawtooth', 0.15);
  }
  // Stab chords (classic house)
  let ct = 0, ci = 0;
  while (ct < dur) {
    const ch = chords[ci % chords.length];
    synthChord(ctx, master, now, ct, ch, b * 0.3, 'sawtooth', 0.04);
    synthChord(ctx, master, now, ct + b * 1.5, ch, b * 0.25, 'sawtooth', 0.035);
    synthChord(ctx, master, now, ct + b * 3, ch, b * 0.3, 'sawtooth', 0.04);
    ct += b * 4; ci++;
  }
  // Piano-style melody
  const melodyNotes = [523.25, 587.33, 659.25, 698.46, 783.99];
  let mt = 0;
  while (mt < dur) {
    if (Math.random() > 0.3) {
      synthNote(ctx, master, now, mt, melodyNotes[Math.floor(Math.random() * melodyNotes.length)], b * 0.4, 'triangle', 0.045);
    }
    mt += b * 0.5;
  }
  // House vocal chants - "oh yeah" style
  for (let t = 0; t < dur; t += b * 8) {
    synthShout(ctx, master, now, t, 280, 0.12);
    synthVocalPhrase(ctx, master, now, t + b * 2, 330, b * 3, ['o', 'a', 'e', 'a', 'o', 'u'], 0.08);
  }
  // Call-response vocals
  for (let t = b * 4; t < dur; t += b * 8) {
    synthVocalPhrase(ctx, master, now, t, 350, b * 2, ['a', 'i', 'a'], 0.07);
    synthShout(ctx, master, now, t + b * 3, 300, 0.1);
  }
}

// --- Main dispatcher ---
function playSynthSong(bpm, duration, style) {
  if (!audioContext) createAudioContext();
  if (audioContext.state === 'suspended') audioContext.resume();

  const now = audioContext.currentTime;
  const masterGain = audioContext.createGain();
  masterGain.gain.value = 0.3;
  masterGain.connect(audioContext.destination);

  if (songAudioBuffer) {
    // Play Pixabay audio
    masterGain.gain.value = 0.7;
    playSongAudioBuffer(audioContext, masterGain, now, duration);
    scheduleBeatAccents(audioContext, masterGain, now, bpm, duration);
  } else if (style === 'custom' && customAudioBuffer) {
    // Play real audio file
    masterGain.gain.value = 0.7;
    playCustomAudio(audioContext, masterGain, now, duration);
    // Add beat accents on top for 卡点 feel
    scheduleBeatAccents(audioContext, masterGain, now, bpm, duration);
  } else {
    switch (style) {
      case 'synthpop':    playSynthpop(audioContext, masterGain, now, bpm, duration); break;
      case 'edm':         playEdm(audioContext, masterGain, now, bpm, duration); break;
      case 'dnb':         playDnb(audioContext, masterGain, now, bpm, duration); break;
      case 'lofi':        playLofi(audioContext, masterGain, now, bpm, duration); break;
      case 'future-bass': playFutureBass(audioContext, masterGain, now, bpm, duration); break;
      case 'disco':       playDisco(audioContext, masterGain, now, bpm, duration); break;
      case 'darksynth':   playDarksynth(audioContext, masterGain, now, bpm, duration); break;
      case 'reggaeton':   playReggaeton(audioContext, masterGain, now, bpm, duration); break;
      case 'hiphop':      playHiphop(audioContext, masterGain, now, bpm, duration); break;
      case 'house':       playHouse(audioContext, masterGain, now, bpm, duration); break;
      default:            playSynthpop(audioContext, masterGain, now, bpm, duration); break;
    }
    // Add beat accents for all synth songs too for better 卡点
    scheduleBeatAccents(audioContext, masterGain, now, bpm, duration);
  }

  audioNodes.masterGain = masterGain;
  songDuration = duration;
}

function playHitSound(rating) {
  if (!audioContext) return;
  const now = audioContext.currentTime;
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();

  if (rating === 'perfect') {
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, now);
  } else if (rating === 'great') {
    osc.frequency.value = 660;
    gain.gain.setValueAtTime(0.12, now);
  } else if (rating === 'good') {
    osc.frequency.value = 440;
    gain.gain.setValueAtTime(0.1, now);
  } else {
    osc.frequency.value = 200;
    gain.gain.setValueAtTime(0.08, now);
  }

  osc.type = 'sine';
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
  osc.connect(gain);
  gain.connect(audioContext.destination);
  osc.start(now);
  osc.stop(now + 0.2);
}

// ===== MediaPipe Setup =====
async function initMediaPipe() {
  loadingOverlay.classList.remove('hidden');
  loadingText.textContent = 'Loading MediaPipe Holistic...';

  holistic = new Holistic({
    locateFile: (file) => {
      return `https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5.1675471629/${file}`;
    },
  });

  holistic.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    enableSegmentation: false,
    smoothSegmentation: false,
    refineFaceLandmarks: false,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });

  holistic.onResults(onPoseResults);

  loadingText.textContent = 'Accessing camera...';

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 1280, height: 720, facingMode: 'user' },
    });
    webcam.srcObject = stream;
    await webcam.play();

    camera = new Camera(webcam, {
      onFrame: async () => {
        if (holistic) {
          await holistic.send({ image: webcam });
        }
      },
      width: 1280,
      height: 720,
    });

    await camera.start();
    loadingText.textContent = 'Ready!';
    setTimeout(() => loadingOverlay.classList.add('hidden'), 500);
  } catch (err) {
    loadingText.textContent = 'Camera access denied. Please allow camera access and reload.';
    console.error('Camera error:', err);
  }
}

function onPoseResults(results) {
  poseCanvas.width = webcam.videoWidth || 1280;
  poseCanvas.height = webcam.videoHeight || 720;
  const w = poseCanvas.width;
  const h = poseCanvas.height;

  poseCtx.clearRect(0, 0, w, h);

  if (results.poseLandmarks) {
    currentPoseLandmarks = results.poseLandmarks;
    drawNeonBody(poseCtx, results.poseLandmarks, w, h);
  }

  if (results.leftHandLandmarks) {
    drawNeonHand(poseCtx, results.leftHandLandmarks, w, h);
  }
  if (results.rightHandLandmarks) {
    drawNeonHand(poseCtx, results.rightHandLandmarks, w, h);
  }
}

// --- Cute chibi body rendering (Just Dance style) ---
// Arms and legs only (torso is drawn separately as a filled shape)
const LIMB_SEGMENTS = [
  // Left arm
  [11, 13], [13, 15],
  // Right arm
  [12, 14], [14, 16],
  // Left leg
  [23, 25], [25, 27],
  // Right leg
  [24, 26], [26, 28],
];

const DEFAULT_LIMB_WIDTH = 28;

const LIMB_WIDTHS = {
  '11-13': 38, '13-15': 32, // left arm (chunky & cute)
  '12-14': 38, '14-16': 32, // right arm
  '23-25': 44, '25-27': 38, // left leg (thick & stubby)
  '24-26': 44, '26-28': 38, // right leg
};

// Chibi shortening: which segments to shorten (endpoint pulled toward start)
const CHIBI_SHORTEN = {
  '13-15': 0.3, '14-16': 0.3, // shorten forearms 30% (stubby arms)
  '25-27': 0.25, '26-28': 0.25, // shorten lower legs 25% (stubby legs)
};

// Joint indices and sizes for smooth connections
const JOINT_INDICES = [11, 12, 13, 14, 23, 24, 25, 26];
const JOINT_SIZES = {
  11: 22, 12: 22, // shoulders
  13: 18, 14: 18, // elbows
  23: 24, 24: 24, // hips
  25: 20, 26: 20, // knees
};

function getNeonColor() {
  if (poseMatchScore >= 0.8) return JUST_DANCE_COLORS.perfect;
  if (poseMatchScore >= 0.5) return JUST_DANCE_COLORS.great;
  if (gameState === 'playing' && poseMatchScore < 0.2 && activePose) return JUST_DANCE_COLORS.miss;
  return JUST_DANCE_COLORS.player;
}

function drawNeonLimb(ctx, x1, y1, x2, y2, width, color, glowIntensity) {
  const r = color.r, g = color.g, b = color.b;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Soft outer glow (subtle)
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${0.12 * glowIntensity})`;
  ctx.lineWidth = width + 14;
  ctx.stroke();

  // Darker border/outline for cartoon definition
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = `rgba(${Math.max(0, r - 80)}, ${Math.max(0, g - 80)}, ${Math.max(0, b - 80)}, 0.9)`;
  ctx.lineWidth = width + 5;
  ctx.stroke();

  // Solid filled limb (fully opaque, cartoon body part)
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = `rgb(${r}, ${g}, ${b})`;
  ctx.lineWidth = width;
  ctx.stroke();

  // Bright center highlight (gives 3D roundness)
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = `rgba(255, 255, 255, ${0.3 * glowIntensity})`;
  ctx.lineWidth = width * 0.3;
  ctx.stroke();

  ctx.restore();
}

function drawNeonJoint(ctx, x, y, radius, color, glowIntensity) {
  const r = color.r, g = color.g, b = color.b;
  // Darker border
  ctx.fillStyle = `rgba(${Math.max(0, r - 80)}, ${Math.max(0, g - 80)}, ${Math.max(0, b - 80)}, 0.9)`;
  ctx.beginPath();
  ctx.arc(x, y, radius + 2.5, 0, Math.PI * 2);
  ctx.fill();
  // Solid joint circle (fully opaque)
  ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  // White highlight dot for 3D
  ctx.fillStyle = `rgba(255, 255, 255, ${0.35 * glowIntensity})`;
  ctx.beginPath();
  ctx.arc(x - radius * 0.2, y - radius * 0.2, radius * 0.4, 0, Math.PI * 2);
  ctx.fill();
}

function drawNeonBody(ctx, landmarks, w, h) {
  const color = getNeonColor();
  const pulse = gameState === 'playing' ? 0.8 + 0.2 * Math.sin(performance.now() * 0.005) : 1;
  const glowIntensity = gameState === 'playing' ? (0.7 + poseMatchScore * 0.3) * pulse : 0.8;
  const r = color.r, g = color.g, b = color.b;

  // --- Filled rounded torso (cute body shape) ---
  const lShoulder = landmarks[11], rShoulder = landmarks[12];
  const lHip = landmarks[23], rHip = landmarks[24];
  const shouldersVisible = lShoulder && rShoulder &&
      lShoulder.visibility > 0.5 && rShoulder.visibility > 0.5;
  const hipsVisible = lHip && rHip &&
      lHip.visibility > 0.5 && rHip.visibility > 0.5;
  if (shouldersVisible) {
    const lsx = lShoulder.x * w, lsy = lShoulder.y * h;
    const rsx = rShoulder.x * w, rsy = rShoulder.y * h;
    // Estimate hips from shoulders when not detected (e.g. person too close)
    const shoulderWidth = Math.abs(rsx - lsx);
    // 0.05 = slight inward offset to match natural body taper toward hips
    // 1.8 = approximate shoulder-to-hip vertical distance relative to shoulder width
    const lhx = hipsVisible ? lHip.x * w : lsx + shoulderWidth * 0.05;
    const lhy = hipsVisible ? lHip.y * h : Math.min(lsy + shoulderWidth * 1.8, h);
    const rhx = hipsVisible ? rHip.x * w : rsx - shoulderWidth * 0.05;
    const rhy = hipsVisible ? rHip.y * h : Math.min(rsy + shoulderWidth * 1.8, h);
    const pad = 10;

    ctx.save();
    // Darker border for torso
    ctx.fillStyle = `rgba(${Math.max(0, r - 80)}, ${Math.max(0, g - 80)}, ${Math.max(0, b - 80)}, 0.9)`;
    ctx.beginPath();
    ctx.moveTo(lsx - pad - 5, lsy - 5);
    ctx.quadraticCurveTo((lsx + rsx) / 2, lsy - pad - 9, rsx + pad + 5, rsy - 5);
    ctx.quadraticCurveTo(rsx + pad + 9, (rsy + rhy) / 2, rhx + pad + 5, rhy + 5);
    ctx.quadraticCurveTo((lhx + rhx) / 2, lhy + pad + 9, lhx - pad - 5, lhy + 5);
    ctx.quadraticCurveTo(lsx - pad - 9, (lsy + lhy) / 2, lsx - pad - 5, lsy - 5);
    ctx.closePath();
    ctx.fill();

    // Main body shape (filled rounded - solid cute outfit)
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.92)`;
    ctx.strokeStyle = `rgba(${Math.max(0, r - 60)}, ${Math.max(0, g - 60)}, ${Math.max(0, b - 60)}, 0.95)`;
    ctx.lineWidth = 3.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(lsx - pad, lsy);
    ctx.quadraticCurveTo((lsx + rsx) / 2, lsy - pad - 2, rsx + pad, rsy);
    ctx.quadraticCurveTo(rsx + pad + 4, (rsy + rhy) / 2, rhx + pad, rhy);
    ctx.quadraticCurveTo((lhx + rhx) / 2, lhy + pad + 2, lhx - pad, lhy);
    ctx.quadraticCurveTo(lsx - pad - 4, (lsy + lhy) / 2, lsx - pad, lsy);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Body highlight (white shine for 3D effect)
    ctx.fillStyle = `rgba(255, 255, 255, ${0.15 * glowIntensity})`;
    const cx = (lsx + rsx) / 2;
    const cy = (lsy + lhy) / 2 - 10;
    ctx.beginPath();
    ctx.ellipse(cx, cy, Math.abs(rsx - lsx) * 0.25, Math.abs(lhy - lsy) * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // --- Thick rounded limbs (stubby chibi arms and legs) ---
  // Track shortened endpoint positions for hands/feet
  const shortenedEndpoints = {};
  for (const [i, j] of LIMB_SEGMENTS) {
    const a = landmarks[i];
    const b = landmarks[j];
    if (!a || !b || a.visibility < 0.5 || b.visibility < 0.5) continue;
    const key = `${Math.min(i, j)}-${Math.max(i, j)}`;
    const baseWidth = LIMB_WIDTHS[key] || DEFAULT_LIMB_WIDTH;

    let ax = a.x * w, ay = a.y * h;
    let bx = b.x * w, by = b.y * h;

    // Apply chibi shortening to lower arms and lower legs
    const shorten = CHIBI_SHORTEN[key] || 0;
    if (shorten > 0) {
      // Linear interpolation: reduce segment length by shorten factor
      bx = ax + (bx - ax) * (1 - shorten);
      by = ay + (by - ay) * (1 - shorten);
      shortenedEndpoints[j] = { x: bx, y: by };
    }

    drawNeonLimb(ctx, ax, ay, bx, by, baseWidth, color, glowIntensity);
  }

  // --- Joint circles at elbows, knees, shoulders, hips for smooth connections ---
  for (const idx of JOINT_INDICES) {
    const lm = landmarks[idx];
    if (!lm || lm.visibility < 0.5) continue;
    const jr = JOINT_SIZES[idx] || 16;
    drawNeonJoint(ctx, lm.x * w, lm.y * h, jr, color, glowIntensity);
  }

  // --- Cute round mitten hands at wrists (15=left, 16=right) ---
  for (const i of [15, 16]) {
    const lm = landmarks[i];
    if (!lm || lm.visibility < 0.5) continue;
    // Use shortened position if available, otherwise original
    const hx = shortenedEndpoints[i] ? shortenedEndpoints[i].x : lm.x * w;
    const hy = shortenedEndpoints[i] ? shortenedEndpoints[i].y : lm.y * h;
    // Darker border
    ctx.fillStyle = `rgba(${Math.max(0, r - 80)}, ${Math.max(0, g - 80)}, ${Math.max(0, b - 80)}, 0.9)`;
    ctx.beginPath();
    ctx.arc(hx, hy, 24, 0, Math.PI * 2);
    ctx.fill();
    // Main round mitten (solid)
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.beginPath();
    ctx.arc(hx, hy, 21, 0, Math.PI * 2);
    ctx.fill();
    // White highlight (shiny)
    ctx.fillStyle = `rgba(255, 255, 255, ${0.35 * glowIntensity})`;
    ctx.beginPath();
    ctx.arc(hx - 5, hy - 5, 8, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- Cute round shoe feet at ankles (27=left, 28=right) ---
  for (const i of [27, 28]) {
    const lm = landmarks[i];
    if (!lm || lm.visibility < 0.5) continue;
    // Use shortened position if available, otherwise original
    const fx = shortenedEndpoints[i] ? shortenedEndpoints[i].x : lm.x * w;
    const fy = shortenedEndpoints[i] ? shortenedEndpoints[i].y : lm.y * h;
    // Darker border
    ctx.fillStyle = `rgba(${Math.max(0, r - 80)}, ${Math.max(0, g - 80)}, ${Math.max(0, b - 80)}, 0.9)`;
    ctx.beginPath();
    ctx.ellipse(fx, fy, 30, 19, 0, 0, Math.PI * 2);
    ctx.fill();
    // Main shoe shape (solid)
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.beginPath();
    ctx.ellipse(fx, fy, 26, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    // White highlight
    ctx.fillStyle = `rgba(255, 255, 255, ${0.3 * glowIntensity})`;
    ctx.beginPath();
    ctx.ellipse(fx - 4, fy - 5, 10, 6, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- Short neck (connect shoulders midpoint to head) ---
  const nose = landmarks[0];
  if (lShoulder && rShoulder && nose &&
      lShoulder.visibility > 0.5 && rShoulder.visibility > 0.5 && nose.visibility > 0.5) {
    const neckTopX = nose.x * w;
    const neckTopY = nose.y * h + 40;
    const neckBotX = (lShoulder.x + rShoulder.x) / 2 * w;
    const neckBotY = (lShoulder.y + rShoulder.y) / 2 * h;
    drawNeonLimb(ctx, neckTopX, neckTopY, neckBotX, neckBotY, 20, color, glowIntensity);
  }

  // --- Cute head with facial features ---
  if (nose && nose.visibility > 0.5) {
    const hx = nose.x * w, hy = nose.y * h;
    const headRx = 55, headRy = 65;

    // Subtle glow behind head
    ctx.save();
    ctx.translate(hx, hy);
    ctx.scale(1, headRy / headRx);
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, headRx * 1.5);
    grad.addColorStop(0, `rgba(255, 255, 255, ${0.1 * glowIntensity})`);
    grad.addColorStop(0.4, `rgba(${r}, ${g}, ${b}, ${0.1 * glowIntensity})`);
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(0, 0, headRx * 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // Head border (darker outline for cartoon definition)
    ctx.save();
    ctx.translate(hx, hy);
    ctx.scale(1, headRy / headRx);
    ctx.fillStyle = `rgba(${Math.max(0, r - 80)}, ${Math.max(0, g - 80)}, ${Math.max(0, b - 80)}, 0.9)`;
    ctx.beginPath(); ctx.arc(0, 0, headRx + 3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // Head shape (filled oval - solid cute chibi)
    ctx.save();
    ctx.translate(hx, hy);
    ctx.scale(1, headRy / headRx);
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.9)`;
    ctx.beginPath(); ctx.arc(0, 0, headRx, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // Hair (cute spiky strokes on top)
    ctx.strokeStyle = `rgba(${Math.max(0, r - 40)}, ${Math.max(0, g - 40)}, ${Math.max(0, b - 40)}, 0.85)`;
    ctx.lineWidth = 3.5; ctx.lineCap = 'round';
    for (let i = -5; i <= 5; i++) {
      const hairX = hx + i * 9;
      const hairY = hy - headRy - 1;
      ctx.beginPath();
      ctx.moveTo(hairX, hairY + 8);
      ctx.quadraticCurveTo(hairX + i * 1.5, hairY - 10, hairX + i * 3, hairY - 1);
      ctx.stroke();
    }

    // Ears (round, solid)
    const earY = hy - 1;
    for (const side of [-1, 1]) {
      const earCx = hx + side * (headRx + 8);
      // Ear border
      ctx.fillStyle = `rgba(${Math.max(0, r - 80)}, ${Math.max(0, g - 80)}, ${Math.max(0, b - 80)}, 0.8)`;
      ctx.beginPath();
      ctx.arc(earCx, earY, 12, 0, Math.PI * 2);
      ctx.fill();
      // Ear fill
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.85)`;
      ctx.beginPath();
      ctx.arc(earCx, earY, 10, 0, Math.PI * 2);
      ctx.fill();
    }

    // Big cute eyes (larger for chibi look)
    const lEye = landmarks[2], rEye = landmarks[5];
    const eyeW = 13, eyeH = 10;
    if (lEye && rEye && lEye.visibility > 0.4 && rEye.visibility > 0.4) {
      const lex = lEye.x * w, ley = lEye.y * h;
      const rex = rEye.x * w, rey = rEye.y * h;
      // Eye whites (solid)
      ctx.fillStyle = 'rgb(255, 255, 255)';
      ctx.beginPath(); ctx.ellipse(lex, ley, eyeW, eyeH, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(rex, rey, eyeW, eyeH, 0, 0, Math.PI * 2); ctx.fill();
      // Eye outline
      ctx.strokeStyle = `rgba(${Math.max(0, r - 80)}, ${Math.max(0, g - 80)}, ${Math.max(0, b - 80)}, 0.7)`;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(lex, ley, eyeW, eyeH, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(rex, rey, eyeW, eyeH, 0, 0, Math.PI * 2); ctx.stroke();
      // Big pupils
      ctx.fillStyle = `rgb(${Math.max(0, r - 60)}, ${Math.max(0, g - 60)}, ${Math.max(0, b - 60)})`;
      ctx.beginPath(); ctx.arc(lex, ley, 6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(rex, rey, 6, 0, Math.PI * 2); ctx.fill();
      // Eye sparkle (bigger)
      ctx.fillStyle = 'rgb(255, 255, 255)';
      ctx.beginPath(); ctx.arc(lex + 3, ley - 3, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(rex + 3, rey - 3, 2.5, 0, Math.PI * 2); ctx.fill();
    } else {
      // Fallback eyes at estimated positions
      ctx.fillStyle = 'rgb(255, 255, 255)';
      ctx.beginPath(); ctx.ellipse(hx - 18, hy - 8, eyeW, eyeH, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(hx + 18, hy - 8, eyeW, eyeH, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(${Math.max(0, r - 80)}, ${Math.max(0, g - 80)}, ${Math.max(0, b - 80)}, 0.7)`;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(hx - 18, hy - 8, eyeW, eyeH, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(hx + 18, hy - 8, eyeW, eyeH, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = `rgb(${Math.max(0, r - 60)}, ${Math.max(0, g - 60)}, ${Math.max(0, b - 60)})`;
      ctx.beginPath(); ctx.arc(hx - 18, hy - 8, 6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(hx + 18, hy - 8, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgb(255, 255, 255)';
      ctx.beginPath(); ctx.arc(hx - 16, hy - 10, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(hx + 20, hy - 10, 2.5, 0, Math.PI * 2); ctx.fill();
    }

    // Nose (small triangle, cuter)
    ctx.fillStyle = `rgba(255, 255, 255, ${0.55 * glowIntensity})`;
    ctx.beginPath();
    ctx.arc(hx, hy + 9, 4, 0, Math.PI * 2);
    ctx.fill();

    // Mouth (cute smile arc, thicker)
    const mouthL = landmarks[9], mouthR = landmarks[10];
    ctx.strokeStyle = `rgba(${Math.max(0, r - 60)}, ${Math.max(0, g - 60)}, ${Math.max(0, b - 60)}, 0.8)`;
    ctx.lineWidth = 3; ctx.lineCap = 'round';
    if (mouthL && mouthR && mouthL.visibility > 0.4 && mouthR.visibility > 0.4) {
      const mx = (mouthL.x + mouthR.x) / 2 * w;
      const my = (mouthL.y + mouthR.y) / 2 * h;
      const mw = Math.abs(mouthR.x - mouthL.x) * w / 2;
      ctx.beginPath();
      ctx.arc(mx, my, Math.max(mw, 13), 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(hx, hy + 21, 13, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
    }

    // Blush (cute rosy cheeks, bigger and more visible)
    ctx.fillStyle = `rgba(255, 150, 180, ${0.35 * glowIntensity})`;
    ctx.beginPath(); ctx.ellipse(hx - 33, hy + 10, 14, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(hx + 33, hy + 10, 14, 8, 0, 0, Math.PI * 2); ctx.fill();
  }
}

function drawNeonHand(ctx, landmarks, w, h) {
  const color = getNeonColor();
  // Draw simplified cute round hand at wrist (solid cartoon style)
  if (landmarks[0]) {
    const x = landmarks[0].x * w;
    const y = landmarks[0].y * h;
    // Border
    ctx.fillStyle = `rgba(${Math.max(0, color.r - 80)}, ${Math.max(0, color.g - 80)}, ${Math.max(0, color.b - 80)}, 0.9)`;
    ctx.beginPath();
    ctx.arc(x, y, 18, 0, Math.PI * 2);
    ctx.fill();
    // Solid fill
    ctx.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
    ctx.beginPath();
    ctx.arc(x, y, 15, 0, Math.PI * 2);
    ctx.fill();
    // White highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.beginPath();
    ctx.arc(x - 3, y - 3, 6, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ===== Game Logic =====
function switchScreen(screenId) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  document.getElementById(screenId).classList.add('active');
}

async function startGame() {
  gameState = 'countdown';
  switchScreen('game-screen');

  // Reset
  score = 0;
  combo = 0;
  maxCombo = 0;
  multiplier = 1;
  ratings = { perfect: 0, great: 0, good: 0, miss: 0 };
  currentBeatIndex = 0;
  poseMatchScore = 0;
  songAudioBuffer = null;

  // Setup canvases
  gameCanvas.width = window.innerWidth;
  gameCanvas.height = window.innerHeight;
  targetPoseCanvas.width = 200;
  targetPoseCanvas.height = 250;

  // Load Pixabay audio if the song has an audioUrl
  const song = SONGS[selectedSong];
  if (song.audioUrl) {
    loadingOverlay.classList.remove('hidden');
    loadingText.textContent = 'Loading music from Pixabay...';
    try {
      await loadSongFromUrl(song.audioUrl);
      // Use actual audio duration if shorter than configured
      if (songAudioBuffer) {
        song.duration = Math.min(song.duration, Math.floor(songAudioBuffer.duration));
        // Auto-detect BPM from the loaded audio for better beat sync
        const detectedBpm = detectBPM(songAudioBuffer);
        if (detectedBpm) {
          song.bpm = detectedBpm;
        }
      }
    } catch (e) {
      // Fall back to synthesized audio
      songAudioBuffer = null;
    }
    loadingOverlay.classList.add('hidden');
  }

  // Generate beat map
  beatMap = song.generateBeats();
  songDuration = song.duration;
  currentSongBpm = song.bpm;
  particles = [];

  // Create match meter
  createMatchMeter();

  updateHUD();

  // Start countdown
  runCountdown(() => {
    gameState = 'playing';
    gameStartTime = performance.now();

    // Start music
    createAudioContext();
    playSynthSong(song.bpm, song.duration, song.style);

    // Start game loop
    lastFrameTime = performance.now();
    gameLoop();
  });
}

function createMatchMeter() {
  // Remove old meter
  const old = document.querySelector('.match-meter');
  if (old) old.remove();
  const oldLabel = document.querySelector('.match-meter-label');
  if (oldLabel) oldLabel.remove();

  const meter = document.createElement('div');
  meter.className = 'match-meter';
  meter.innerHTML = '<div class="match-meter-fill" id="match-meter-fill"></div>';
  gameScreen.appendChild(meter);

  const label = document.createElement('div');
  label.className = 'match-meter-label';
  label.textContent = 'Match';
  gameScreen.appendChild(label);
}

function runCountdown(callback) {
  countdownEl.classList.remove('hidden');
  let count = 3;
  countdownNumber.textContent = count;

  const interval = setInterval(() => {
    count--;
    if (count > 0) {
      countdownNumber.textContent = count;
    } else if (count === 0) {
      countdownNumber.textContent = 'GO!';
    } else {
      clearInterval(interval);
      countdownEl.classList.add('hidden');
      callback();
    }
  }, 1000);
}

function gameLoop() {
  if (gameState !== 'playing') return;

  const now = performance.now();
  const elapsed = (now - gameStartTime) / 1000; // seconds since game start

  // Check if song is over
  if (elapsed >= songDuration) {
    endGame();
    return;
  }

  // Update progress bar
  progressBar.style.width = `${(elapsed / songDuration) * 100}%`;

  // Process beats
  processBeats(elapsed);

  // Update pose matching
  updatePoseMatch(elapsed);

  // Render beat timeline
  renderBeatTimeline(elapsed);

  // Render game effects
  renderGameEffects(elapsed);

  animFrameId = requestAnimationFrame(gameLoop);
}

function processBeats(elapsed) {
  const lookAheadWindow = 0.5; // seconds
  const missWindow = 0.8; // seconds past beat to consider a miss

  for (let i = currentBeatIndex; i < beatMap.length; i++) {
    const beat = beatMap[i];

    if (beat.scored) continue;

    // Set active pose when approaching
    if (beat.time - elapsed < 2.0 && beat.time - elapsed > -0.5) {
      if (activePose !== beat.pose) {
        activePose = beat.pose;
        poseNameEl.textContent = POSES[beat.pose].name;
        // Draw target pose
        POSES[beat.pose].draw(
          targetCtx,
          targetPoseCanvas.width,
          targetPoseCanvas.height
        );
      }
    }

    // Check if we should evaluate this beat
    if (elapsed >= beat.time - lookAheadWindow && elapsed <= beat.time + missWindow) {
      if (!beat.hit && currentPoseLandmarks) {
        const matchValue = POSES[beat.pose].check(currentPoseLandmarks);
        poseMatchScore = matchValue;

        // Update match meter
        const meterFill = document.getElementById('match-meter-fill');
        if (meterFill) {
          meterFill.style.height = `${matchValue * 100}%`;
        }

        // Score when near the beat time
        if (Math.abs(elapsed - beat.time) < lookAheadWindow) {
          if (matchValue >= 0.8) {
            scoreBeat(beat, 'perfect');
          } else if (matchValue >= 0.6) {
            scoreBeat(beat, 'great');
          } else if (matchValue >= 0.4) {
            scoreBeat(beat, 'good');
          }
        }
      }
    }

    // Miss if too late
    if (elapsed > beat.time + missWindow && !beat.scored) {
      scoreBeat(beat, 'miss');
    }

    // Move current index past scored beats
    if (beat.scored && i === currentBeatIndex) {
      currentBeatIndex = i + 1;
    }

    // Don't process far-future beats
    if (beat.time - elapsed > 3) break;
  }
}

function scoreBeat(beat, rating) {
  beat.scored = true;
  beat.hit = rating !== 'miss';
  beat.rating = rating;

  const basePoints = { perfect: 1000, great: 700, good: 400, miss: 0 };

  if (rating === 'miss') {
    combo = 0;
    multiplier = 1;
  } else {
    combo++;
    if (combo > maxCombo) maxCombo = combo;
    multiplier = Math.min(8, 1 + Math.floor(combo / 5));
  }

  score += basePoints[rating] * multiplier;
  ratings[rating]++;

  playHitSound(rating);
  showRating(rating);
  updateHUD();

  // Spawn particles on hit
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  if (rating === 'perfect') {
    spawnParticles(cx, cy, 25, JUST_DANCE_COLORS.perfect, 8, 1.2);
  } else if (rating === 'great') {
    spawnParticles(cx, cy, 15, JUST_DANCE_COLORS.great, 6, 1.0);
  } else if (rating === 'good') {
    spawnParticles(cx, cy, 8, JUST_DANCE_COLORS.good, 4, 0.8);
  } else {
    spawnParticles(cx, cy, 6, JUST_DANCE_COLORS.miss, 3, 0.6);
  }
}

function showRating(rating) {
  lastRatingTime = performance.now();
  lastRating = rating;
  ratingPopup.textContent = rating.toUpperCase();
  ratingPopup.className = `show ${rating}`;
  // Add extra text for streaks
  if (combo >= 20 && rating !== 'miss') {
    ratingPopup.textContent = rating.toUpperCase() + ' \u2605';
  }
  setTimeout(() => {
    ratingPopup.className = '';
  }, 700);
}

function updateHUD() {
  scoreValue.textContent = score.toLocaleString();
  comboValue.textContent = combo;
  multiplierValue.textContent = `x${multiplier}`;
}

function updatePoseMatch(elapsed) {
  if (!currentPoseLandmarks || !activePose) return;
  const pose = POSES[activePose];
  if (pose) {
    poseMatchScore = pose.check(currentPoseLandmarks);
  }
}

function renderBeatTimeline(elapsed) {
  // Clear old markers
  beatMarkersEl.innerHTML = '';

  const timelineWidth = beatMarkersEl.parentElement.offsetWidth;
  const visibleWindow = 4; // seconds visible ahead
  const hitZonePos = 0.1; // 10% from left

  for (let i = 0; i < beatMap.length; i++) {
    const beat = beatMap[i];
    const timeDiff = beat.time - elapsed;

    if (timeDiff < -1 || timeDiff > visibleWindow) continue;

    const progress = timeDiff / visibleWindow;
    const xPos = hitZonePos + progress * (1 - hitZonePos);

    const marker = document.createElement('div');
    marker.className = 'beat-marker';
    if (beat.scored && beat.hit) marker.className += ' hit';
    if (beat.scored && !beat.hit) marker.className += ' miss';
    marker.style.left = `${xPos * 100}%`;

    const icon = document.createElement('span');
    icon.className = 'pose-icon';
    icon.textContent = POSES[beat.pose].icon;
    marker.appendChild(icon);

    beatMarkersEl.appendChild(marker);
  }
}

function renderGameEffects(elapsed) {
  const cw = gameCanvas.width = window.innerWidth;
  const ch = gameCanvas.height = window.innerHeight;
  gameCtx.clearRect(0, 0, cw, ch);

  // --- Beat pulse (background throbs with music) ---
  const beatInterval = 60 / currentSongBpm;
  const beatPhase = (elapsed % beatInterval) / beatInterval;
  beatPulse = Math.max(0, 1 - beatPhase * 3); // sharp attack, slow decay

  // Dark vignette (always on, stronger with combo)
  const vignetteStrength = 0.15 + Math.min(0.25, combo * 0.015);
  const vig = gameCtx.createRadialGradient(cw / 2, ch / 2, cw * 0.2, cw / 2, ch / 2, cw * 0.75);
  vig.addColorStop(0, 'transparent');
  vig.addColorStop(1, `rgba(0, 0, 20, ${vignetteStrength})`);
  gameCtx.fillStyle = vig;
  gameCtx.fillRect(0, 0, cw, ch);

  // Beat pulse flash
  if (beatPulse > 0.1) {
    const color = getNeonColor();
    gameCtx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${beatPulse * 0.06})`;
    gameCtx.fillRect(0, 0, cw, ch);
  }

  // Performance glow (match quality -> screen tint)
  if (poseMatchScore > 0.5 && gameState === 'playing') {
    const intensity = (poseMatchScore - 0.5) * 0.12;
    const color = poseMatchScore >= 0.8 ? JUST_DANCE_COLORS.perfect : JUST_DANCE_COLORS.great;
    gameCtx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${intensity})`;
    gameCtx.fillRect(0, 0, cw, ch);
  }

  // --- Particle system ---
  updateAndDrawParticles(gameCtx, cw, ch, elapsed);

  // --- Edge glow lines (pulsing borders like a dance floor) ---
  if (combo >= 5) {
    const edgeAlpha = Math.min(0.5, combo * 0.02) * (0.6 + 0.4 * beatPulse);
    const color = getNeonColor();
    gameCtx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${edgeAlpha})`;
    gameCtx.lineWidth = 3;
    // Bottom edge glow
    const edgeGrad = gameCtx.createLinearGradient(0, ch - 80, 0, ch);
    edgeGrad.addColorStop(0, 'transparent');
    edgeGrad.addColorStop(1, `rgba(${color.r}, ${color.g}, ${color.b}, ${edgeAlpha * 0.3})`);
    gameCtx.fillStyle = edgeGrad;
    gameCtx.fillRect(0, ch - 80, cw, 80);
    // Top edge
    const topGrad = gameCtx.createLinearGradient(0, 0, 0, 60);
    topGrad.addColorStop(0, `rgba(${color.r}, ${color.g}, ${color.b}, ${edgeAlpha * 0.2})`);
    topGrad.addColorStop(1, 'transparent');
    gameCtx.fillStyle = topGrad;
    gameCtx.fillRect(0, 0, cw, 60);
  }

  // --- Combo fire effect (side streaks) ---
  if (combo >= 10) {
    drawComboFire(gameCtx, cw, ch, elapsed);
  }
}

// --- Particle system ---
function spawnParticles(x, y, count, color, speed, life) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const vel = speed * (0.5 + Math.random() * 0.5);
    particles.push({
      x, y,
      vx: Math.cos(angle) * vel,
      vy: Math.sin(angle) * vel - speed * 0.3,
      life: life || 1,
      maxLife: life || 1,
      r: color.r, g: color.g, b: color.b,
      size: 2 + Math.random() * 4,
    });
  }
}

function updateAndDrawParticles(ctx, cw, ch) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.15; // gravity
    p.life -= 0.016;
    if (p.life <= 0) { particles.splice(i, 1); continue; }

    const alpha = (p.life / p.maxLife);
    const size = p.size * alpha;

    // Glow
    const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size * 3);
    grad.addColorStop(0, `rgba(${p.r}, ${p.g}, ${p.b}, ${alpha * 0.6})`);
    grad.addColorStop(1, `rgba(${p.r}, ${p.g}, ${p.b}, 0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(p.x, p.y, size * 3, 0, Math.PI * 2);
    ctx.fill();

    // Core
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.8})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, size * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawComboFire(ctx, cw, ch, elapsed) {
  const fireIntensity = Math.min(1, (combo - 10) / 30);
  const color = getNeonColor();
  const time = elapsed * 2;

  // Animated streaks on left and right edges
  for (let i = 0; i < 6; i++) {
    const phase = (time + i * 0.7) % 3;
    const yBase = ch * (0.3 + i * 0.1);
    const y = yBase - phase * ch * 0.15;
    const alpha = fireIntensity * 0.3 * (1 - phase / 3);

    // Left streak
    const leftGrad = ctx.createLinearGradient(0, y, 60, y);
    leftGrad.addColorStop(0, `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`);
    leftGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = leftGrad;
    ctx.fillRect(0, y - 15, 60, 30);

    // Right streak
    const rightGrad = ctx.createLinearGradient(cw, y, cw - 60, y);
    rightGrad.addColorStop(0, `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`);
    rightGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = rightGrad;
    ctx.fillRect(cw - 60, y - 15, 60, 30);
  }
}

function endGame() {
  gameState = 'results';
  if (animFrameId) cancelAnimationFrame(animFrameId);

  // Stop audio
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
  songAudioBuffer = null;

  // Clean up match meter
  const meter = document.querySelector('.match-meter');
  if (meter) meter.remove();
  const label = document.querySelector('.match-meter-label');
  if (label) label.remove();

  // Calculate grade
  const maxPossibleScore = beatMap.length * 1000 * 8; // all perfect with max multiplier
  const percentage = maxPossibleScore > 0 ? score / maxPossibleScore : 0;

  let grade, gradeColor;
  if (percentage >= 0.95) { grade = 'S'; gradeColor = '#ffd700'; }
  else if (percentage >= 0.85) { grade = 'A'; gradeColor = '#00ff88'; }
  else if (percentage >= 0.70) { grade = 'B'; gradeColor = '#00c8ff'; }
  else if (percentage >= 0.50) { grade = 'C'; gradeColor = '#ff6b00'; }
  else { grade = 'D'; gradeColor = '#ff3366'; }

  // Populate results
  document.getElementById('final-grade').textContent = grade;
  document.getElementById('final-grade').style.color = gradeColor;
  document.getElementById('final-score').textContent = score.toLocaleString();
  document.getElementById('final-combo').textContent = maxCombo;
  document.getElementById('final-perfect').textContent = ratings.perfect;
  document.getElementById('final-great').textContent = ratings.great;
  document.getElementById('final-good').textContent = ratings.good;
  document.getElementById('final-miss').textContent = ratings.miss;

  switchScreen('results-screen');
}

// ===== Event Listeners =====
// Song selection
document.querySelectorAll('.song-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.song-btn').forEach((b) => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedSong = btn.dataset.song;
  });
});

// Custom audio upload
const audioUploadInput = document.getElementById('audio-upload');
if (audioUploadInput) {
  audioUploadInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      loadCustomAudio(file);
    }
  });
}

const customDifficultySelect = document.getElementById('custom-difficulty');
if (customDifficultySelect) {
  customDifficultySelect.addEventListener('change', (e) => {
    customAudioDifficulty = e.target.value;
    SONGS['custom-audio'].difficulty = customAudioDifficulty;
  });
}

startBtn.addEventListener('click', () => {
  if (!holistic) {
    initMediaPipe().then(() => {
      // Wait a bit for pose detection to warm up
      setTimeout(startGame, 1000);
    });
  } else {
    startGame();
  }
});

retryBtn.addEventListener('click', startGame);

menuBtn.addEventListener('click', () => {
  switchScreen('start-screen');
  gameState = 'menu';
});

// Handle resize
window.addEventListener('resize', () => {
  if (gameState === 'playing') {
    gameCanvas.width = window.innerWidth;
    gameCanvas.height = window.innerHeight;
  }
});
