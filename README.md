# KI Battle — 2 Player Hand-Tracking Game

A browser-based two-player energy battle controlled by hand gestures.

## Features
- Camera-based hand tracking with MediaPipe.
- Two players separated by screen position.
- Two hands together → charge energy.
- Full charge → launch an energy blast toward the opponent.
- One open hand → energy shield.
- Blocking creates an impact effect.
- Score system: first player to 5 wins.
- Visual effects: aura, particles, flash, shock-style impact and energy trails.
- Camera frames are processed locally in the browser.

## Run locally
Camera access usually requires a secure context. The easiest option is VS Code + Live Server, or GitHub Pages after pushing the files.

## GitHub Pages
1. Create a repository.
2. Upload `index.html`, `style.css`, `app.js`, and `README.md`.
3. Go to **Settings → Pages**.
4. Select **Deploy from a branch**.
5. Select `main` and `/root`.
6. Open the generated Pages URL.
7. Allow camera access.

## Controls
- 🤲 Two hands: charge.
- ✋ One open hand: shield.
- ⚡ Full charge: automatic blast.
- ESC: restart.

## Privacy
No application server is used by this project. Camera access is requested by the browser and frames are processed in the page. The MediaPipe JavaScript package and hand model are loaded from public CDNs/storage. If you want a completely self-contained repository, download and host those assets yourself.
