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
    generateBeats() {
      return generateBeatMap(120, 60, 'easy');
    },
  },
  'neon-nights': {
    name: 'Neon Nights',
    bpm: 140,
    duration: 60,
    difficulty: 'medium',
    generateBeats() {
      return generateBeatMap(140, 60, 'medium');
    },
  },
  'cyber-funk': {
    name: 'Cyber Funk',
    bpm: 160,
    duration: 60,
    difficulty: 'hard',
    generateBeats() {
      return generateBeatMap(160, 60, 'hard');
    },
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

function playSynthSong(bpm, duration) {
  if (!audioContext) createAudioContext();
  if (audioContext.state === 'suspended') audioContext.resume();

  const now = audioContext.currentTime;
  const beatDur = 60 / bpm;

  // Master gain
  const masterGain = audioContext.createGain();
  masterGain.gain.value = 0.3;
  masterGain.connect(audioContext.destination);

  // Bass line
  const bassNotes = [65.41, 82.41, 73.42, 87.31]; // C2, E2, D2, F2
  for (let t = 0; t < duration; t += beatDur) {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = bassNotes[Math.floor(t / beatDur) % bassNotes.length];
    gain.gain.setValueAtTime(0.15, now + t);
    gain.gain.exponentialRampToValueAtTime(0.01, now + t + beatDur * 0.8);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(now + t);
    osc.stop(now + t + beatDur * 0.9);
  }

  // Kick drum
  for (let t = 0; t < duration; t += beatDur) {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, now + t);
    osc.frequency.exponentialRampToValueAtTime(30, now + t + 0.1);
    gain.gain.setValueAtTime(0.4, now + t);
    gain.gain.exponentialRampToValueAtTime(0.01, now + t + 0.15);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(now + t);
    osc.stop(now + t + 0.2);
  }

  // Hi-hat
  for (let t = 0; t < duration; t += beatDur / 2) {
    const bufferSize = audioContext.sampleRate * 0.03;
    const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.3;
    }
    const noise = audioContext.createBufferSource();
    noise.buffer = buffer;

    const hihatFilter = audioContext.createBiquadFilter();
    hihatFilter.type = 'highpass';
    hihatFilter.frequency.value = 8000;

    const gain = audioContext.createGain();
    gain.gain.setValueAtTime(0.08, now + t);
    gain.gain.exponentialRampToValueAtTime(0.001, now + t + 0.05);

    noise.connect(hihatFilter);
    hihatFilter.connect(gain);
    gain.connect(masterGain);
    noise.start(now + t);
    noise.stop(now + t + 0.05);
  }

  // Melody (pentatonic)
  const melodyNotes = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25];
  let melodyTime = 0;
  while (melodyTime < duration) {
    const noteDur = beatDur * (Math.random() > 0.5 ? 1 : 0.5);
    const note = melodyNotes[Math.floor(Math.random() * melodyNotes.length)];

    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = 'square';
    osc.frequency.value = note;
    gain.gain.setValueAtTime(0.06, now + melodyTime);
    gain.gain.exponentialRampToValueAtTime(0.001, now + melodyTime + noteDur * 0.8);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(now + melodyTime);
    osc.stop(now + melodyTime + noteDur);

    melodyTime += noteDur;
  }

  // Chords
  const chordProgressions = [
    [261.63, 329.63, 392.0],  // C major
    [220.0, 277.18, 329.63],  // A minor
    [293.66, 369.99, 440.0],  // D major
    [246.94, 311.13, 369.99], // B minor
  ];
  let chordTime = 0;
  let chordIdx = 0;
  while (chordTime < duration) {
    const chord = chordProgressions[chordIdx % chordProgressions.length];
    const chordDur = beatDur * 4;

    chord.forEach((freq) => {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.04, now + chordTime);
      gain.gain.setValueAtTime(0.04, now + chordTime + chordDur * 0.7);
      gain.gain.exponentialRampToValueAtTime(0.001, now + chordTime + chordDur * 0.95);
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(now + chordTime);
      osc.stop(now + chordTime + chordDur);
    });

    chordTime += chordDur;
    chordIdx++;
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
    playSynthSong(song.bpm, song.duration);

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
