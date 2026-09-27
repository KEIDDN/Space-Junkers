# Space Junkers: audit and roadmap

Written at the start of the build 0.3 push. Update it when a slice lands.

## Audit of build 0.2

### Strongest systems (keep, extend, don't rewrite)
- **Gunplay core.** `WeaponState` (cadence, buffered clicks, bloom, draw/reload), swept projectiles,
  a shared `discharge()` path for player and AI, camera kick/trauma shake, hitstop, muzzle light.
  Tuned and unit-tested. This is the best part of the game.
- **Rendering discipline.** 640×360 internal resolution scaled up only by whole numbers, rounded camera,
  nearest filtering. Pixel art stays crisp.
- **Lighting.** Light buffer multiplied over the world, baked occluded static lights, a per-frame
  visibility polygon for the flashlight, and per-tile light levels that gameplay reads. Darkness already works
  as a gameplay system (you only see lit enemies in line of sight).
- **Architecture boundaries.** React never runs per frame. Zustand only gets change-diffed snapshots.
  `Game` owns the loop, the simulation is plain TS, and gameplay knows nothing about the DOM.
- **Deterministic facility generator** with a reachability test over 120 seeds.
- **Perception-based AI.** Enemies read a `Target` (position + conspicuity), not the player object. Sound
  investigation has positional error.

### Weakest systems
- **No item model.** Loot is a flat `string[]`. Weapons, ammo, armor and meds are not items, so there is
  nothing to equip, buy, lose or risk. The whole economy/loadout loop has no base to stand on.
- **Stash.** A counter of item ids with no space limit and no use. Nothing to spend it on.
- **Meta loop.** A single menu. There is no ship, crew, shops, quests, destinations or Credits.
- **Facilities read as random rooms.** Every room gets the same floor, crates and barrels. There are
  no room purposes, no storytelling and no facility identity. Walls use one repeating face tile.
- **One enemy type** (the player's body tinted, with a pasted head), and a one-frame "rotated" corpse.
- **Silent player.** Footsteps don't make noise for the AI, so stealth and movement choices don't matter.
  There is no sprint or sneak.
- **Extraction is always the same:** one zone, the deepest room, and no raid timer. There is no pressure
  to leave except enemies.
- **UI** is a single generic panel and the fonts are loaded from Google at runtime (it breaks offline).

### Technical debt / risks
- `Game.startRun` wires everything by hand. It's fine at this size but needs a scene abstraction once the
  ship exists (two Pixi scenes sharing input/audio/fit logic).
- Effects allocate a new `Sprite` per muzzle flash/smoke/decal pixel. Acceptable now, but pool it if
  profiling shows GC spikes.
- `profileStore` is persisted without a version, so any schema change would silently corrupt old saves.
  It needs a versioned schema, migration, and validation/repair on load.
- The raid is not marked in the save. Reloading mid-raid is a free escape (a duplication/exploit risk
  once loadouts cost money).
- `Enemy.hear()` runs for every enemy for every noise. That's fine at the current counts (≈12).

### Unused art (large opportunity)
- `NPCs.png`: all five crew with portraits, and idle/walk/run/talk/interact/sit rows plus props.
- `Tileset spaceship.png`: cockpit, consoles, bunks, lockers, server racks, reactor, pipes, windows.
- `Guns/Objects.png`: ammo, magazines, grenades, meds, helmets, vests, backpacks, electronics, tools.
- `Loot Objects.png`: ~200 icons, of which only 34 are used.
- `Planets.png`: 8 planets.
- `Main Character.png`: unarmed walk, aim/shoot, crouch-walk and back views are unused.

## Roadmap (vertical slices, each playable and tested)

A. **Items and save.** Unified `ItemDef` (loot, weapons, ammo, armor, helmets, backpacks, meds,
   grenades, keys) with sizes, weight and stack sizes. A grid inventory core with tests. A versioned
   profile (Credits, stash grid, loadout, crew, quests, unlocks, stats, raid-in-progress) with
   migration from 0.2 saves.
B. **Raid uses the loadout.** Calibers and reloading from carried ammo, armor/helmet, meds and
   bleeding, container and body looting windows, drops, TAB inventory, and extraction that banks what
   you carry.
C. **The ship.** A walkable Pixi hub with the five crew animated in their spaces, a stash locker,
   a nav console and the airlock. Shops (buy/sell) and a stash/loadout screen.
D. **Crew and quests.** Trust levels, dialogue with personality, data-driven quests and ship upgrades
   that physically change the ship.
E. **Combat depth.** Enemy types, cover/flank/alert/suppression, footstep noise, sprint/sneak,
   headshots, grenades, physical deaths and audio occlusion.
F. **Destinations.** Planets with themed facilities, room archetypes, storytelling props, a locked
   vault, extraction variants, and a raid timer with reinforcements.
G. **Polish and QA.** Ambience, UI sounds, title/pause/settings, a design-system pass, full-loop
   playtests, balance and exploit checks.

## Status

All seven slices are in. What each one delivered, beyond the plan above:

- **A–B.** 121 items, grid inventory with rotation/stacking/sort, versioned save with backup and
  0.2 migration, raid loadout with calibers, per-round reloads, jams, armor classes vs penetration,
  bleeding and pooled medkits.
- **C–D.** Walkable ship with five crew, typewriter dialogue with voice blips, 19 data-driven
  contracts, trust levels, vendors with daily market rotation (tested: no buy/sell arbitrage),
  ship upgrades that change the ship.
- **E.** Four enemy factions with awareness, shouts, cover, flanking, suppression, search,
  grenades; sprint/sneak/footstep noise; headshots; physical deaths; audio occlusion.
- **F.** Five themed destinations (palettes, room purposes, furniture kits, loot bias, lighting),
  sealed vaults with keycards, maintenance lift + breaker as a second exit, tactical map with
  fog of war, lore terminals, orbit-window timer with M.I.A., reinforcement squads.
- **G.** Full-loop browser playtests, exploit checks (found-in-raid provenance, crew-issue
  items unsellable, fuel fallback so nobody is stranded), settings (volume, screen shake),
  controls reference, first-raid hint.

Known limits / next candidates: the Free Pixel Gun Pack license needs confirming (see
`ASSET_SOURCES.md`); music is ambience only; facilities share one tileset, so themes lean on
palette and furniture rather than new architecture.
