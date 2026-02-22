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
  const LIMB_W = 40;
  const LIMB_SHORTEN_FACTOR = 0.3;

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
  const pad = 10;

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
  const neckTopY = headY * h + 65;
  const neckBotY = shoulderY * h;
  solidLimb(headX, neckTopY, headX, neckBotY, 18);

  // --- Arms (chibi shortened forearms) ---
  if (opts.lArm) {
    const elbowX = opts.lArm[0].x * w, elbowY = opts.lArm[0].y * h;
    let wristX = opts.lArm[1].x * w, wristY = opts.lArm[1].y * h;
    // Shorten forearm by 30%
    wristX = elbowX + (wristX - elbowX) * (1 - LIMB_SHORTEN_FACTOR);
    wristY = elbowY + (wristY - elbowY) * (1 - LIMB_SHORTEN_FACTOR);
    solidLimb(lShoulderX * w, shoulderY * h, elbowX, elbowY, LIMB_W);
    solidLimb(elbowX, elbowY, wristX, wristY, LIMB_W - 6);
    // Elbow joint
    solidJoint(elbowX, elbowY, 18);
    // Mitten hand
    ctx.fillStyle = `rgba(${darkR}, ${darkG}, ${darkB}, 0.9)`;
    ctx.beginPath(); ctx.arc(wristX, wristY, 20, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.9)`;
    ctx.beginPath(); ctx.arc(wristX, wristY, 17, 0, Math.PI * 2); ctx.fill();
  }
  if (opts.rArm) {
    const elbowX = opts.rArm[0].x * w, elbowY = opts.rArm[0].y * h;
    let wristX = opts.rArm[1].x * w, wristY = opts.rArm[1].y * h;
    wristX = elbowX + (wristX - elbowX) * (1 - LIMB_SHORTEN_FACTOR);
    wristY = elbowY + (wristY - elbowY) * (1 - LIMB_SHORTEN_FACTOR);
    solidLimb(rShoulderX * w, shoulderY * h, elbowX, elbowY, LIMB_W);
    solidLimb(elbowX, elbowY, wristX, wristY, LIMB_W - 6);
    solidJoint(elbowX, elbowY, 18);
    ctx.fillStyle = `rgba(${darkR}, ${darkG}, ${darkB}, 0.9)`;
    ctx.beginPath(); ctx.arc(wristX, wristY, 20, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.9)`;
    ctx.beginPath(); ctx.arc(wristX, wristY, 17, 0, Math.PI * 2); ctx.fill();
  }

  // Shoulder joints
  solidJoint(lShoulderX * w, shoulderY * h, 20);
  solidJoint(rShoulderX * w, shoulderY * h, 20);

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
  solidLimb(hipCx, hipY * h, lKneeX, lKneeY, LIMB_W + 4);
  solidLimb(hipCx, hipY * h, rKneeX, rKneeY, LIMB_W + 4);
  // Lower legs
  solidLimb(lKneeX, lKneeY, lFootX, lFootY, LIMB_W);
  solidLimb(rKneeX, rKneeY, rFootX, rFootY, LIMB_W);

  // Hip joints
  solidJoint(hipCx, hipY * h, 22);
  // Knee joints
  solidJoint(lKneeX, lKneeY, 18);
  solidJoint(rKneeX, rKneeY, 18);

  // Shoe feet (rounded ellipses)
  for (const [fx, fy] of [[lFootX, lFootY], [rFootX, rFootY]]) {
    ctx.fillStyle = `rgba(${darkR}, ${darkG}, ${darkB}, 0.9)`;
    ctx.beginPath(); ctx.ellipse(fx, fy, 26, 16, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.9)`;
    ctx.beginPath(); ctx.ellipse(fx, fy, 22, 13, 0, 0, Math.PI * 2); ctx.fill();
  }

  // --- Cute Head (55x65 radius) ---
  const headCY = headY * h;
  const headRx = 55, headRy = 65;

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
  ctx.lineWidth = 3; ctx.lineCap = 'round';
  for (let i = -5; i <= 5; i++) {
    const hx = headX + i * 9;
    const hy = headCY - headRy - 1;
    ctx.beginPath();
    ctx.moveTo(hx, hy + 8);
    ctx.quadraticCurveTo(hx + i * 1.5, hy - 10, hx + i * 3, hy - 1);
    ctx.stroke();
  }

  // Ears (round, solid)
  const earY = headCY - 1;
  for (const side of [-1, 1]) {
    const earCx = headX + side * (headRx + 8);
    ctx.fillStyle = `rgba(${darkR}, ${darkG}, ${darkB}, 0.8)`;
    ctx.beginPath(); ctx.arc(earCx, earY, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.85)`;
    ctx.beginPath(); ctx.arc(earCx, earY, 10, 0, Math.PI * 2); ctx.fill();
  }

  // Big cute eyes (solid white with large pupils)
  const eyeOffX = 18, eyeOffY = -5, eyeW = 13, eyeH = 10;
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
  ctx.beginPath(); ctx.arc(headX - eyeOffX, headCY + eyeOffY, 6, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(headX + eyeOffX, headCY + eyeOffY, 6, 0, Math.PI * 2); ctx.fill();
  // Eye sparkle
  ctx.fillStyle = 'rgb(255, 255, 255)';
  ctx.beginPath(); ctx.arc(headX - eyeOffX + 3, headCY + eyeOffY - 3, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(headX + eyeOffX + 3, headCY + eyeOffY - 3, 2.5, 0, Math.PI * 2); ctx.fill();

  // Nose (white highlight to stand out against any character color)
  ctx.fillStyle = `rgba(255, 255, 255, 0.55)`;
  ctx.beginPath(); ctx.arc(headX, headCY + 9, 4, 0, Math.PI * 2); ctx.fill();

  // Mouth (cute smile arc)
  ctx.strokeStyle = `rgba(${darkR}, ${darkG}, ${darkB}, 0.8)`;
  ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(headX, headCY + 21, 13, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();

  // Blush (cute rosy cheeks)
  ctx.fillStyle = 'rgba(255, 150, 180, 0.35)';
  ctx.beginPath(); ctx.ellipse(headX - 33, headCY + 10, 12, 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(headX + 33, headCY + 10, 12, 7, 0, 0, Math.PI * 2); ctx.fill();
}

// ===== Song / Beat Map Definitions =====
// Audio from Pixabay (https://pixabay.com/music/) — free to use under the Pixabay Content License
const SONGS = {
  'pop-dance-beat': {
    name: "Let's Meet Michelle",
    bpm: 120,
    duration: 60,
    difficulty: 'easy',
    style: 'synthpop',
    audioUrl: 'https://cdn.pixabay.com/audio/2024/07/29/audio_4e09b35d5b.mp3',
    generateBeats() { return generateStructuredBeatMap(this.bpm, this.duration, 'easy', 'synthpop'); },
  },
  'tropical-house': {
    name: 'Breeze Groove',
    bpm: 110,
    duration: 60,
    difficulty: 'easy',
    style: 'lofi',
    audioUrl: 'https://cdn.pixabay.com/audio/2024/03/26/audio_6846775846.mp3',
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
    name: 'Hip-Hop Cypher',
    bpm: 95,
    duration: 60,
    difficulty: 'medium',
    style: 'hiphop',
    audioUrl: 'https://cdn.pixabay.com/audio/2024/07/24/audio_e449d10473.mp3',
    generateBeats() { return generateStructuredBeatMap(this.bpm, this.duration, 'medium', 'hiphop'); },
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
    name: 'Drive Breakbeat',
    bpm: 160,
    duration: 60,
    difficulty: 'hard',
    style: 'dnb',
    audioUrl: 'https://cdn.pixabay.com/audio/2023/10/24/audio_9408f7326a.mp3',
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

// ===== Audio Loading and Playback =====
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
      // Audio failed to load; game will play silently
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
