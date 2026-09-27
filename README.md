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
npm run assets     # rebuild the character and world atlases from /Assets (needs python3 + Pillow + numpy)
SFX_SRC=/path/to/raw python3 tools/build_sfx.py   # rebuild recorded sounds and music (see ASSET_SOURCES.md)
```

## The loop

A new operator starts with the premise typed over black and wakes at their bunk on the
Lastochka: Molot signs their kit over at the locker, Fedya gives the first job over the
cockpit radio (service station Zarya-7 on Tikhaya stopped answering), and the airlock
leads down. The ship log under the ship's name says where to go next; nothing stops you.
Until their first extraction the crew talk them through Tikhaya on the radio, and its
scavengers give them a chance to learn.

1. **Ship.** Walk the *Lastochka*. Talk to the crew, take contracts, trade, sort your stash and
   loadout (TAB or the locker), install ship work at the board.
2. **Course.** Pick a destination at the nav console and pay the fuel. Broke? Fedya flies you to
   Tikhaya on his tab.
3. **Deploy** from the airlock with whatever you're wearing and carrying.
4. **Raid.** Facilities are procedural, themed by planet, and dark. Listen before you look:
   guards mutter into radios and say it out loud when they think they heard something.
   Search containers and bodies, read terminals and the notes people left, open the vault if
   you brought a keycard.
5. **Extract** on the shuttle pad (12 s, and the alarm brings company) or on the maintenance lift
   (quiet and quick, once you've thrown its breaker somewhere else). The Lastochka can only hold
   orbit so long: miss the window and you're M.I.A.
6. **Return.** Extract and everything you carry comes home. Die and it stays on your body.
   The crew notice how it went (and what you read down there). Sell, hand in contracts,
   upgrade, go again. Everything you've read is kept in the service record's RECOVERED
   RECORDS, sorted by the threads that run through every world.

Money is **kosmorubli** (КР, *KR* on screen), the orbital rouble: the Commonwealth printed
them for its colonies, and out here nobody has anything better.

You can never be soft-locked. Death still costs you everything you carried, but the ship keeps
a reserve: come back aboard with no gun that can fire or no pack on you, and Molot issues a
crew-issue SP-5 (loaded), a box of rounds, a canvas sack and a dressing, straight onto you, on
a stamped slip that says where each piece is. Crew issue is worth nothing to traders, and the
same kit is handed back from the locker rather than issued again, so the reserve can't be
farmed. The hop to Tikhaya is free when you can't pay for it.

## Controls

Keyboard and mouse, or any standard controller (Xbox, PlayStation and Nintendo layouts are
recognised and their button names shown). Prompts follow whichever you touched last.

| Action | Keyboard / mouse | Controller |
|---|---|---|
| Move | WASD | Left stick (analogue) |
| Aim / fire | Mouse / LMB | Right stick / RT |
| Steady aim (slower, tighter, see further) | RMB | LT |
| Sprint | Shift | L3 (click, latches) |
| Sneak | C | B |
| Reload, clear a jam | R | X |
| Switch weapon | 1 / 2 / Q / wheel | Y |
| Grenade · treat wounds | G · H | RB · LB |
| Quick slots | 3–6 | D-pad |
| Flashlight | F | R3 |
| Interact; hold to search, swipe, throw breakers | E | A |
| Inventory / stash | TAB | View (PlayStation: Create) |
| Tactical map | M | Hold View (PlayStation: touchpad) |
| Pause (ship: menu and settings) | ESC | Menu (PlayStation: Options) |

Menus are fully playable on a controller: the D-pad or stick moves focus, A confirms, B goes
back, LB/RB switch tabs or panels, the right stick scrolls. In inventories A picks an item up
and puts it down anywhere (grid cells, equipment, quick slots, the sell counter), X quick-moves,
Y opens its actions (or rotates what you're carrying).

With the mouse: drag to move, R or Space rotates while dragging, Shift-click quick-moves,
Ctrl-click equips/uses, right-click for actions, drag outside to drop.

Settings (title screen, pause menu, the ship menu): volume, music, screen shake, brightness,
optional sound cues toward unseen gunfire and alarms, the film finish (vignette, grain,
grade), and with a controller connected, aim speed, aim assist and vibration.

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
| `tools/build_characters.py` | Characters: LPC bodies for the motion, recoloured, with the drawn heads, headgear and packs placed on every frame; packs `public/assets/chars.{png,json}`. |
| `tools/sj_heads.py`, `tools/sj_props.py` | Original pixel art as ASCII: every head, helmet, hood, mask and pack; the storytelling props. |
| `src/core/` | Pure game rules with tests: inventory grids, transfers, profile/save, damage, economy, quests, upgrades, raid results. |
| `src/data/` | Content: items, weapons, enemies (and per-world AI tuning), loot tables, crew and their chatter, vendors, quests, destinations, facility themes, lore and its threads, the prologue. Tuning happens here. |
| `src/engine/` | Plumbing: render constants, asset loading, action-based input (keyboard, mouse, gamepad), rumble, camera, audio (synthesized and recorded). |
| `src/ui/nav/` | Controller navigation for every menu (spatial focus, carrying items). |
| `tools/build_sfx.py` | Cuts and encodes the recorded sound effects and music. |
| `src/game/` | Simulation and Pixi rendering. `Game.ts` runs a raid, `ship/ShipScene.ts` the hub. |
| `src/game/world/facilityGen.ts` | Procedural facilities: rooms, corridors, doors, roles, themed furnishing, sealed vault, exits. |
| `src/game/render/lighting.ts` | Darkness: light buffer multiplied over the world, wall-occluded lights, flashlight. |
| `src/state/` | Zustand stores: profile (persisted, versioned), raid, HUD snapshot, ship UI, settings. |
| `src/ui/`, `src/app/` | React interface. It never runs per frame. |
| `docs/ROADMAP.md` | Audit of build 0.2 and the slices that took it here. |
| `docs/SHIPPING_AUDIT.md` | The polish passes and the shipping audit, area by area. |
| `ASSET_SOURCES.md` | Every external asset, its author, source and license. |

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
