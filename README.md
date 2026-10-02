# WebCraft

A Minecraft-style voxel sandbox that runs in the browser. No build step and no install: open `index.html`.

## Play

- **Easiest:** double-click `index.html`. It works offline because Three.js is included in `lib/`.
- **Or serve it locally:** `python3 -m http.server`, then open http://localhost:8000.
- **Or host it:** turn on GitHub Pages for this repo (Settings → Pages → deploy from branch, root folder).

## Features

- Infinite procedurally generated terrain in 16×16 chunks: plains, beaches, oceans, deserts with cacti, snowy mountains, caves, and coal, iron, gold and diamond ores
- Trees whose leaves cross chunk borders without seams
- Break and place 28 kinds of block, with break particles
- Block inventory (E), a 9-slot hotbar, and pick-block on middle click
- Walking, sprinting, jumping, swimming and flying, with proper collision
- Day/night cycle with sun, moon, stars and scrolling clouds
- Ambient occlusion, face shading, see-through water, and an underwater fog effect
- Every texture is drawn by code at startup, so there are no image files
- Autosave to `localStorage`: your world edits, position, time of day and hotbar

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Move |
| Space | Jump / swim up |
| Space ×2 or F | Toggle flying |
| Space / C (flying) | Fly up / down |
| Shift | Sprint |
| Left click | Break block |
| Right click | Place block |
| Middle click | Pick block |
| 1–9 / mouse wheel | Select hotbar slot |
| E | Block inventory |
| F3 | Debug info |
| Esc | Pause menu |

## Code layout

| File | Purpose |
| --- | --- |
| `js/noise.js` | Seeded simplex noise (2D/3D) and hashing |
| `js/blocks.js` | Block definitions, procedural texture atlas, hotbar icons |
| `js/world.js` | Chunk storage, terrain generation, meshing with face culling and AO, raycasting, save data |
| `js/player.js` | Movement physics and AABB collision |
| `js/main.js` | Renderer, sky, UI, input and the game loop |

Three.js is MIT licensed; see `lib/THREE_LICENSE`.
