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
let selectedSong = 'electric-dreams';
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

// ===== Pose Definitions =====
// Each pose is defined by expected angles/positions of key body parts
const POSES = {
  'arms-up': {
    name: 'Arms Up',
    icon: '\\u2191',
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
      });
    },
  },
  'arms-out': {
    name: 'T-Pose',
    icon: '\\u2194',
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
      });
    },
  },
  'left-arm-up': {
    name: 'Left Up',
    icon: '\\u2196',
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
      });
    },
  },
  'right-arm-up': {
    name: 'Right Up',
    icon: '\\u2197',
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
      });
    },
  },
  'hands-on-hips': {
    name: 'Hands on Hips',
    icon: '\\u25C7',
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
      });
    },
  },
  'squat': {
    name: 'Squat',
    icon: '\\u2193',
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
      });
    },
  },
  'lean-left': {
    name: 'Lean Left',
    icon: '\\u2190',
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
      });
    },
  },
  'lean-right': {
    name: 'Lean Right',
    icon: '\\u2192',
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
      });
    },
  },
  'dab-left': {
    name: 'Dab Left',
    icon: '\\u2199',
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
      });
    },
  },
  'dab-right': {
    name: 'Dab Right',
    icon: '\\u2198',
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
      });
    },
  },
};

const POSE_KEYS = Object.keys(POSES);

// ===== Helper Functions =====
function dist2d(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function drawStickFigure(ctx, w, h, opts = {}) {
  ctx.clearRect(0, 0, w, h);

  const headY = opts.squat ? 0.3 : 0.18;
  const shoulderY = opts.squat ? 0.38 : 0.32;
  const hipY = opts.squat ? 0.58 : 0.58;
  let bodyTilt = 0;
  if (opts.leanLeft) bodyTilt = -0.04;
  if (opts.leanRight) bodyTilt = 0.04;

  const cx = 0.5 + bodyTilt;

  ctx.strokeStyle = '#00c8ff';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.fillStyle = '#00c8ff';

  // Head
  ctx.beginPath();
  ctx.arc(cx * w, headY * h, 12, 0, Math.PI * 2);
  ctx.stroke();

  // Spine
  ctx.beginPath();
  ctx.moveTo(cx * w, (headY + 0.06) * h);
  ctx.lineTo((cx + bodyTilt) * w, hipY * h);
  ctx.stroke();

  // Shoulders
  const lShoulderX = cx - 0.12 + bodyTilt;
  const rShoulderX = cx + 0.12 + bodyTilt;
  ctx.beginPath();
  ctx.moveTo(lShoulderX * w, shoulderY * h);
  ctx.lineTo(rShoulderX * w, shoulderY * h);
  ctx.stroke();

  // Left arm
  if (opts.lArm) {
    ctx.beginPath();
    ctx.moveTo(lShoulderX * w, shoulderY * h);
    ctx.lineTo(opts.lArm[0].x * w, opts.lArm[0].y * h);
    ctx.lineTo(opts.lArm[1].x * w, opts.lArm[1].y * h);
    ctx.stroke();
  }

  // Right arm
  if (opts.rArm) {
    ctx.beginPath();
    ctx.moveTo(rShoulderX * w, shoulderY * h);
    ctx.lineTo(opts.rArm[0].x * w, opts.rArm[0].y * h);
    ctx.lineTo(opts.rArm[1].x * w, opts.rArm[1].y * h);
    ctx.stroke();
  }

  // Legs
  const kneeY = opts.squat ? 0.7 : 0.75;
  const footY = opts.squat ? 0.85 : 0.92;
  const legSpread = opts.squat ? 0.12 : 0.08;

  ctx.beginPath();
  ctx.moveTo((cx + bodyTilt) * w, hipY * h);
  ctx.lineTo((cx - legSpread + bodyTilt) * w, kneeY * h);
  ctx.lineTo((cx - legSpread + bodyTilt) * w, footY * h);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo((cx + bodyTilt) * w, hipY * h);
  ctx.lineTo((cx + legSpread + bodyTilt) * w, kneeY * h);
  ctx.lineTo((cx + legSpread + bodyTilt) * w, footY * h);
  ctx.stroke();
}

// ===== Song / Beat Map Definitions =====
const SONGS = {
  'electric-dreams': {
    name: 'Electric Dreams',
    bpm: 120,
    duration: 60,
    difficulty: 'easy',
    style: 'synthpop',
    generateBeats() { return generateBeatMap(120, 60, 'easy'); },
  },
  'neon-nights': {
    name: 'Neon Nights',
    bpm: 140,
    duration: 60,
    difficulty: 'medium',
    style: 'edm',
    generateBeats() { return generateBeatMap(140, 60, 'medium'); },
  },
  'cyber-funk': {
    name: 'Cyber Funk',
    bpm: 160,
    duration: 60,
    difficulty: 'hard',
    style: 'dnb',
    generateBeats() { return generateBeatMap(160, 60, 'hard'); },
  },
  'sunset-groove': {
    name: 'Sunset Groove',
    bpm: 100,
    duration: 60,
    difficulty: 'easy',
    style: 'lofi',
    generateBeats() { return generateBeatMap(100, 60, 'easy'); },
  },
  'tokyo-drift': {
    name: 'Tokyo Drift',
    bpm: 128,
    duration: 60,
    difficulty: 'medium',
    style: 'future-bass',
    generateBeats() { return generateBeatMap(128, 60, 'medium'); },
  },
  'disco-inferno': {
    name: 'Disco Inferno',
    bpm: 115,
    duration: 60,
    difficulty: 'easy',
    style: 'disco',
    generateBeats() { return generateBeatMap(115, 60, 'easy'); },
  },
  'dark-matter': {
    name: 'Dark Matter',
    bpm: 150,
    duration: 60,
    difficulty: 'hard',
    style: 'darksynth',
    generateBeats() { return generateBeatMap(150, 60, 'hard'); },
  },
  'tropical-heat': {
    name: 'Tropical Heat',
    bpm: 110,
    duration: 60,
    difficulty: 'medium',
    style: 'reggaeton',
    generateBeats() { return generateBeatMap(110, 60, 'medium'); },
  },
};

function generateBeatMap(bpm, duration, difficulty) {
  const beats = [];
  const beatInterval = 60 / bpm; // seconds per beat
  let interval;
  switch (difficulty) {
    case 'easy': interval = beatInterval * 4; break;   // every 4 beats
    case 'medium': interval = beatInterval * 2; break;  // every 2 beats
    case 'hard': interval = beatInterval * 1.5; break;  // every 1.5 beats
    default: interval = beatInterval * 4;
  }

  let lastPose = '';
  for (let time = 3; time < duration - 2; time += interval) {
    // Pick a random pose, avoid repeating
    let poseKey;
    do {
      poseKey = POSE_KEYS[Math.floor(Math.random() * POSE_KEYS.length)];
    } while (poseKey === lastPose);
    lastPose = poseKey;

    beats.push({
      time,
      pose: poseKey,
      hit: false,
      scored: false,
    });
  }
  return beats;
}

// ===== Audio Synthesis =====
// We generate music procedurally since we can't load external files
function createAudioContext() {
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
}

// --- Shared synth helpers ---
function synthKick(ctx, master, now, t, pitch, vol) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(pitch || 150, now + t);
  osc.frequency.exponentialRampToValueAtTime(30, now + t + 0.1);
  gain.gain.setValueAtTime(vol || 0.4, now + t);
  gain.gain.exponentialRampToValueAtTime(0.01, now + t + 0.15);
  osc.connect(gain); gain.connect(master);
  osc.start(now + t); osc.stop(now + t + 0.2);
}

function synthHihat(ctx, master, now, t, vol, decay) {
  const bufLen = ctx.sampleRate * (decay || 0.03);
  const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) d[i] = (Math.random() * 2 - 1) * 0.3;
  const src = ctx.createBufferSource(); src.buffer = buf;
  const filt = ctx.createBiquadFilter(); filt.type = 'highpass'; filt.frequency.value = 8000;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol || 0.08, now + t);
  gain.gain.exponentialRampToValueAtTime(0.001, now + t + (decay || 0.05));
  src.connect(filt); filt.connect(gain); gain.connect(master);
  src.start(now + t); src.stop(now + t + (decay || 0.05) + 0.01);
}

function synthSnare(ctx, master, now, t, vol) {
  // Tonal body
  const osc = ctx.createOscillator();
  const oscGain = ctx.createGain();
  osc.type = 'triangle'; osc.frequency.value = 200;
  oscGain.gain.setValueAtTime((vol || 0.2) * 0.6, now + t);
  oscGain.gain.exponentialRampToValueAtTime(0.01, now + t + 0.08);
  osc.connect(oscGain); oscGain.connect(master);
  osc.start(now + t); osc.stop(now + t + 0.1);
  // Noise
  const bufLen = ctx.sampleRate * 0.08;
  const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) d[i] = (Math.random() * 2 - 1);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const filt = ctx.createBiquadFilter(); filt.type = 'highpass'; filt.frequency.value = 3000;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol || 0.2, now + t);
  gain.gain.exponentialRampToValueAtTime(0.01, now + t + 0.1);
  src.connect(filt); filt.connect(gain); gain.connect(master);
  src.start(now + t); src.stop(now + t + 0.12);
}

function synthClap(ctx, master, now, t, vol) {
  const bufLen = ctx.sampleRate * 0.06;
  const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) d[i] = (Math.random() * 2 - 1);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2500; bp.Q.value = 1.5;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol || 0.25, now + t);
  gain.gain.exponentialRampToValueAtTime(0.01, now + t + 0.08);
  src.connect(bp); bp.connect(gain); gain.connect(master);
  src.start(now + t); src.stop(now + t + 0.1);
}

function synthNote(ctx, master, now, t, freq, dur, type, vol) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type || 'square';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(vol || 0.06, now + t);
  gain.gain.exponentialRampToValueAtTime(0.001, now + t + dur * 0.85);
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

function synthBass(ctx, master, now, t, freq, dur, type, vol) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type || 'sawtooth';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(vol || 0.15, now + t);
  gain.gain.exponentialRampToValueAtTime(0.01, now + t + dur * 0.8);
  osc.connect(gain); gain.connect(master);
  osc.start(now + t); osc.stop(now + t + dur * 0.9);
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
}

// --- Main dispatcher ---
function playSynthSong(bpm, duration, style) {
  if (!audioContext) createAudioContext();
  if (audioContext.state === 'suspended') audioContext.resume();

  const now = audioContext.currentTime;
  const masterGain = audioContext.createGain();
  masterGain.gain.value = 0.3;
  masterGain.connect(audioContext.destination);

  switch (style) {
    case 'synthpop':    playSynthpop(audioContext, masterGain, now, bpm, duration); break;
    case 'edm':         playEdm(audioContext, masterGain, now, bpm, duration); break;
    case 'dnb':         playDnb(audioContext, masterGain, now, bpm, duration); break;
    case 'lofi':        playLofi(audioContext, masterGain, now, bpm, duration); break;
    case 'future-bass': playFutureBass(audioContext, masterGain, now, bpm, duration); break;
    case 'disco':       playDisco(audioContext, masterGain, now, bpm, duration); break;
    case 'darksynth':   playDarksynth(audioContext, masterGain, now, bpm, duration); break;
    case 'reggaeton':   playReggaeton(audioContext, masterGain, now, bpm, duration); break;
    default:            playSynthpop(audioContext, masterGain, now, bpm, duration); break;
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
  // Resize canvases
  poseCanvas.width = webcam.videoWidth || 1280;
  poseCanvas.height = webcam.videoHeight || 720;

  poseCtx.clearRect(0, 0, poseCanvas.width, poseCanvas.height);

  if (results.poseLandmarks) {
    currentPoseLandmarks = results.poseLandmarks;

    // Draw skeleton on pose canvas
    drawConnectors(poseCtx, results.poseLandmarks, POSE_CONNECTIONS, {
      color: 'rgba(0, 200, 255, 0.5)',
      lineWidth: 3,
    });
    drawLandmarks(poseCtx, results.poseLandmarks, {
      color: 'rgba(0, 255, 136, 0.7)',
      lineWidth: 1,
      radius: 3,
    });
  }

  // Also draw hand landmarks for visual flair
  if (results.leftHandLandmarks) {
    drawConnectors(poseCtx, results.leftHandLandmarks, HAND_CONNECTIONS, {
      color: 'rgba(255, 200, 0, 0.3)',
      lineWidth: 1,
    });
  }
  if (results.rightHandLandmarks) {
    drawConnectors(poseCtx, results.rightHandLandmarks, HAND_CONNECTIONS, {
      color: 'rgba(255, 200, 0, 0.3)',
      lineWidth: 1,
    });
  }
}

// ===== Game Logic =====
function switchScreen(screenId) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  document.getElementById(screenId).classList.add('active');
}

function startGame() {
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

  // Setup canvases
  gameCanvas.width = window.innerWidth;
  gameCanvas.height = window.innerHeight;
  targetPoseCanvas.width = 200;
  targetPoseCanvas.height = 250;

  // Generate beat map
  const song = SONGS[selectedSong];
  beatMap = song.generateBeats();
  songDuration = song.duration;

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
}

function showRating(rating) {
  ratingPopup.textContent = rating.toUpperCase();
  ratingPopup.className = `show ${rating}`;
  setTimeout(() => {
    ratingPopup.className = '';
  }, 600);
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
  gameCanvas.width = window.innerWidth;
  gameCanvas.height = window.innerHeight;
  gameCtx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);

  // Vignette effect based on combo
  if (combo > 0) {
    const intensity = Math.min(0.3, combo * 0.02);
    const gradient = gameCtx.createRadialGradient(
      gameCanvas.width / 2, gameCanvas.height / 2,
      gameCanvas.width * 0.3,
      gameCanvas.width / 2, gameCanvas.height / 2,
      gameCanvas.width * 0.7
    );
    gradient.addColorStop(0, 'transparent');
    gradient.addColorStop(1, `rgba(0, 200, 255, ${intensity})`);
    gameCtx.fillStyle = gradient;
    gameCtx.fillRect(0, 0, gameCanvas.width, gameCanvas.height);
  }

  // Flash on high match
  if (poseMatchScore > 0.7) {
    const flash = (poseMatchScore - 0.7) / 0.3;
    gameCtx.fillStyle = `rgba(0, 255, 136, ${flash * 0.08})`;
    gameCtx.fillRect(0, 0, gameCanvas.width, gameCanvas.height);
  }

  // Particle effects for combo milestones
  if (combo > 0 && combo % 10 === 0) {
    drawComboParticles(gameCtx, elapsed);
  }
}

function drawComboParticles(ctx, elapsed) {
  const time = (elapsed * 3) % 1;
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2 + elapsed;
    const radius = 50 + time * 100;
    const x = ctx.canvas.width / 2 + Math.cos(angle) * radius;
    const y = ctx.canvas.height / 2 + Math.sin(angle) * radius;
    const alpha = 1 - time;

    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 215, 0, ${alpha})`;
    ctx.fill();
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
