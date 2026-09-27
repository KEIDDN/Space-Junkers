# Asset sources

Everything the game ships with, where it came from, and its license.

## Original project art (`Assets/`)

These are the project's own sheets. `tools/build_assets.py` cuts them into `public/assets/sprites.{png,json}` and never modifies the sources.

| Asset | Used for |
|---|---|
| `Main Character.png` | Operators (walk, death, portraits), scavenger variants, muzzle flash, smoke and blood FX |
| `Tileset spaceship.png` | Floors, walls, doors, crates and barrels |
| `Loot Objects.png` | Loot item icons |
| `Guns/Objects.png` | Ammunition, armor, helmets, backpacks, medical, grenades and tool icons; loot containers |
| `Guns/Guns/*.png` (Free Pixel Gun Pack) | Weapon sprites and weapon icons |
| `NPCs.png` | Crew members (ship hub) |
| `Planets.png` | Destinations |

## External assets

| Asset | Source | License | Used for |
|---|---|---|---|
| Share Tech Mono | Google Fonts via the `@fontsource/share-tech-mono` npm package | SIL Open Font License 1.1 | UI body text |
| VT323 | Google Fonts via `@fontsource/vt323` | SIL Open Font License 1.1 | CRT numerals and readouts |
| Russo One | Google Fonts via `@fontsource/russo-one` | SIL Open Font License 1.1 | Headings and Cyrillic stencil labels |

The fonts are bundled at build time, so the game needs no network access at runtime.

## Audio

All sound is synthesised at runtime with WebAudio (`src/engine/audio.ts`). No sample files are used.
