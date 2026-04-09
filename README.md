# JustMove

A browser-based "Just Dance"-style rhythm game that uses your webcam and MediaPipe pose detection to track body movements in real time.

## Features

- Real-time pose tracking via MediaPipe Holistic
- 5 built-in tracks at varying BPM/difficulty, or upload your own audio
- Beat-synced pose targets with Perfect/Great/Good/Miss scoring
- Combo system with score multipliers
- Head gesture controls (nod to start, shake to select)
- Canvas-rendered game UI with particle effects

## Tech Stack

JavaScript, HTML Canvas, CSS, MediaPipe Holistic/Camera Utils

## How to Run

Serve the project directory with any static HTTP server:

```bash
npx serve .
```

Open in a browser with webcam access. Select a track and hit START.
