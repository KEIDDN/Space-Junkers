# Space Junkers

2D top-down pixel-art extraction shooter. React + TypeScript + Vite + PixiJS + Zustand.

## Run

```
npm install
npm run dev        # http://localhost:5180
npm test           # unit tests (weapons, collision, pathfinding, maps)
npm run build      # type-check + production build
npm run assets     # rebuild the sprite atlas from /Assets (needs python3 + Pillow + numpy)
```

## Controls

WASD move · mouse aim · LMB fire · R reload · 1-5 / wheel / Q switch weapon · F flashlight ·
hold E search containers · E in the zone to signal extraction · ESC abort to menu

## The loop (build 0.2)

Deploy to a procedurally generated facility (seed shown in the menu; the same seed always
builds the same facility). It's dark. Search containers for loot (carried loot is at risk),
find the extraction room, signal extraction (an alarm pulls enemies to you) and hold the zone
for the countdown. Extract to bank loot into the ship stash; die and you lose what you carried.

## Layout

| Path | What |
|---|---|
| `Assets/` | Original art. Never modified. |
| `tools/build_assets.py` | Cuts sprites out of the painted sheets, removes the haze, snaps them to a pixel grid, packs `public/assets/sprites.{png,json}`. The source rectangles live in its manifest. |
| `src/engine/` | Engine plumbing: render constants, asset loading, input, camera, audio. |
| `src/data/` | Gameplay data: weapons, enemies, maps. Tuning happens here. |
| `src/game/` | Simulation + Pixi rendering. `Game.ts` owns the loop. |
| `src/game/world/facilityGen.ts` | Procedural facility generator (rooms, corridors, doors, roles, furnishing). |
| `src/game/render/lighting.ts` | Darkness: light buffer multiplied over the world, wall-occluded lights and flashlight. |
| `src/data/items.ts`, `src/data/loot.ts` | Loot items and container loot tables. |
| `src/state/` | Zustand stores: HUD snapshot, expedition (at-risk bag), profile (persistent stash), settings. |
| `src/ui/`, `src/app/` | React interface. It never runs per frame. |

Rendering: the world renders at 640×360 and is scaled up by whole numbers only (nearest-neighbour, rounded camera), so pixels stay crisp.
