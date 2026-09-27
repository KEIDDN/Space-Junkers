# Space Junkers

A 2D top-down pixel-art extraction shooter. You're a salvage operator on the *Lastochka*, a
decommissioned Commonwealth ore tender, picking over the facilities the Commonwealth left
running when the lights went out. Prepare on the ship, drop into a dark facility, take what
you can carry, and get out before someone takes it off your body.

React + TypeScript + Vite + PixiJS + Zustand.

## Run

```
npm install
npm run dev        # http://localhost:5180
npm test           # unit tests (inventory, economy, quests, saves, combat, AI, facility generation)
npm run build      # type-check + production build
npm run assets     # rebuild the sprite atlas from /Assets (needs python3 + Pillow + numpy)
```

## The loop

1. **Ship.** Walk the *Lastochka*. Talk to the crew, take contracts, trade, sort your stash and
   loadout (TAB or the locker), install ship work at the board.
2. **Course.** Pick a destination at the nav console and pay the fuel. Broke? Fedya flies you to
   Tikhaya on his tab.
3. **Deploy** from the airlock with whatever you're wearing and carrying.
4. **Raid.** Facilities are procedural, themed by planet, and dark. Listen before you look.
   Search containers and bodies, read terminals, open the vault if you brought a keycard.
5. **Extract** on the shuttle pad (12 s, and the alarm brings company) or on the maintenance lift
   (quiet and quick, once you've thrown its breaker somewhere else). The Lastochka can only hold
   orbit so long: miss the window and you're M.I.A.
6. **Return.** Extract and everything you carry comes home. Die and it stays on your body.
   Sell, hand in contracts, upgrade, go again.

You can never be soft-locked: with no gun anywhere, the locker hands out a worthless crew-issue
kit, and the hop to Tikhaya is free when you can't pay for it.

## Controls

| Key | Raid | Ship |
|---|---|---|
| WASD | Move | Move |
| Mouse / LMB | Aim / fire | |
| Shift | Sprint (gun lowered) | |
| C | Sneak (silent steps) | |
| R | Reload, clear a jam | |
| 1 / 2 / Q | Primary / sidearm / swap | |
| 3–6 | Quick slots (meds, grenades at the cursor) | |
| F | Flashlight | |
| E | Interact; hold to search, swipe, throw breakers | Talk, use |
| TAB | Inventory | Stash |
| M | Tactical map | |
| ESC | Pause, settings, controls | Close |

Inventory: drag to move, R or Space rotates while dragging, Shift-click quick-moves,
Ctrl-click equips/uses, right-click for actions, drag outside to drop.

## World

| Destination | Theme | Hostiles |
|---|---|---|
| Tikhaya | Industrial moon: tractor plants, ore mills | Scavengers |
| Merzlota | Frozen mining world | Scavengers, raider crews |
| Krasnaya Pustosh | Red desert garrison depots | Garrison soldiers |
| Kombinat Orbital | Corporate research station | Corporate security |
| Sirin | Source of the signal | Unknown |

Crew: **Fedya** (trader, captain), **Molot** (mercenary, armour repair), **Doc** (medic),
**Shura** (hacker, keycards), **Lis** (smuggler). Trust grows with trade and contracts and
unlocks stock, lines and destinations.

## Layout

| Path | What |
|---|---|
| `Assets/` | Original art. Never modified. |
| `tools/build_assets.py` | Cuts sprites out of the painted sheets, strips the haze, snaps them to a pixel grid, builds palette variants, packs `public/assets/sprites.{png,json}`. |
| `src/core/` | Pure game rules with tests: inventory grids, transfers, profile/save, damage, economy, quests, upgrades, raid results. |
| `src/data/` | Content: items, weapons, enemies, loot tables, crew, vendors, quests, destinations, facility themes, lore. Tuning happens here. |
| `src/engine/` | Plumbing: render constants, asset loading, input, camera, synthesized audio. |
| `src/game/` | Simulation and Pixi rendering. `Game.ts` runs a raid, `ship/ShipScene.ts` the hub. |
| `src/game/world/facilityGen.ts` | Procedural facilities: rooms, corridors, doors, roles, themed furnishing, sealed vault, exits. |
| `src/game/render/lighting.ts` | Darkness: light buffer multiplied over the world, wall-occluded lights, flashlight. |
| `src/state/` | Zustand stores: profile (persisted, versioned), raid, HUD snapshot, ship UI, settings. |
| `src/ui/`, `src/app/` | React interface. It never runs per frame. |
| `docs/ROADMAP.md` | Audit of build 0.2 and the slices that took it here. |

Rendering: the world renders at 640×360 and is scaled up by whole numbers only
(nearest-neighbour, rounded camera), so pixels stay crisp. React draws only the interface;
per-frame state (positions, bullets, lights) lives in the simulation, and the UI reads
low-frequency snapshots.

Saves: `localStorage` key `space-junkers.profile`, versioned with migration from 0.2 and a
backup copy. A raid in progress is marked in the save, so closing the tab mid-raid counts as
M.I.A. exactly once.

## Testing

`npm test` covers the rules and generators. Dev builds expose hooks for automated browser
play tests: `window.__sj` (raid), `window.__ship` (hub), `window.__raid`, `window.__profile`.
