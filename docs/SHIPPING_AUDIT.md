# Space Junkers: final polish pass and shipping audit

This pass did not add systems. It took what existed and made it feel deliberate:
animation, weapon feel, sound, light, transitions, set dressing, and the rough edges
found by playing it.

## What changed

**Animation.** Everyone who carries a gun now uses one weapon-handling rig
(`src/game/entities/ActorView.ts`). Poses are computed in the actor's facing space and
blended with springs, so poses never make the actual aim lag.
- **Body:** idle sway and breathing, a footfall dip, a crouch when sneaking or working
  low, a two-frame turn, and the shoulder shoved by heavy guns.
- **Carry:** sprint carries the gun across the chest. Guns come up from low when drawn,
  and recoil climbs per weapon type.
- **Reloads are choreographed per mechanism:**
  - Magazine guns cant, drop the old magazine (it clatters on the floor), bring a fresh
    one from the belt, seat it, and rack only when run dry.
  - The sawn-off breaks open and spills its shells.
  - Pump and bolt guns thumb rounds in, then rack.
- **Hands:** grenades have a wind-up, treatment ends with a visible heal, searching
  keeps the hands low.
- **Enemies** share the rig: unaware guards carry the gun low, alert ones raise it, and
  their reloads are seen and heard.

**Weapon feel.**
- **Flashes:** shaped pixel muzzle flashes per weapon type that ride the muzzle through
  the recoil.
- **Smoke:** pushed out along the barrel, then rising.
- **Brass:** tumbles toward the camera and bounces twice. Bolt and pump guns eject when
  worked; the sawn-off keeps its shells until opened.
- **Impacts:** rounds chip visible wall faces and sometimes ricochet with a whine.
- **Gunshots are layered:** snap, crack, body, a sub punch for big calibres, the action
  cycling, and the room's reverb.

**Audio** (`src/engine/audio.ts`, all synthesized).
- **Space:** a procedural convolution reverb per place (steel ship, concrete plant, ice
  halls, dead station). Distance and walls shift sound from direct to reflected, so far
  away is heard, not just quieter.
- **Footsteps:** they know the floor (deck, ringing plate, rattling grate), and other
  people's boots are louder to you than your own.
- **Soundscapes:** every world has its own bed, with lulls into near-silence and rare
  distant firefights.
- **Machinery:** reactors, servers and vents hum where they stand.
- **Information cues:**
  - Unaware guards mutter into radios.
  - The extraction klaxon quickens toward the end.
  - A heartbeat plays below 30% health.
  - Each crew member has a sound at work.
- **Mix:** balanced by measuring the actual output. Gunshots peak near 0 dB, your own
  steps sit about 20 dB under them, and the room tone bed is well below everything.

**Light and life.**
- **Brightness:** a higher ambient floor (darkness is doubt, not blindness) plus a
  brightness setting.
- **Rooms and fixtures:**
  - Rooms with the mains out get a throbbing emergency lamp.
  - Failing tubes stutter.
  - Terminals, servers and monitors cast their own colour.
- **Small life:** LEDs blink, worn machines spark, pipes vent steam, and dust hangs in
  the flashlight beam.
- **Extraction:** red hazard beacons sweep the pad while the alarm runs.

**Transitions and endings.**
- **Scene changes:** every change goes dark behind a terminal cover (day card, airlock
  and descent, docking or a recovery beacon).
- **Extraction** is a beat of relief before the report: a white-green flash and SIGNAL
  ACQUIRED.
- **Death** slows the world, drains its colour and muffles hearing. Running out of time
  is the ship leaving.
- **The report** reveals line by line and counts the haul up.

**Home and places.**
- **Crew corners:** every crew member's corner of the Lastochka is dressed with their
  things, and finished story contracts leave their mark there.
- **Facility dressing:** facility tables, desks and benches have things left on them,
  and each world has its own litter. Item icons are re-cut at world scale by the asset
  pipeline.

**Looting.**
- **Finds:** a good find chimes and is announced in the feed with its value.
- **Containers:** they jostle while searched and bump when opened.

**Accessibility.**
- **Critical health** reads without colour: a label, a pulsing bar and a heartbeat.
- **Sound cues** (optional): chevrons point toward unseen gunfire and alarms.
- **Settings:** brightness and screen-shake controls.

## Found by playing, and fixed

- A refresh during the extraction beat counted as M.I.A. Now the raid settles the
  instant extraction completes.
- The death colour filter left Pixi textures bound at teardown. The colour drain now
  comes from the compositor instead.
- A terminal reopened on the same E press that closed it.
- The ship could spawn the operator in open space.
- A broke player could be stranded with no fuel money.
- Splitting or merging your own gear laundered it into "found in raid".
- Every world paid about the same as Tikhaya. Richer worlds now roll better.
- Footsteps and hand sounds were nearly as loud as gunfire. Enemy boots were masked.

## Audit

| Area | Verdict | Notes |
|---|---|---|
| Gameplay loop | Ships | Ship → contract → loadout → deploy → raid → extract/die → report → sell → upgrade, played end to end in the browser repeatedly. |
| Combat | Ships | Armor vs penetration, bleeding, suppression, grenades; per-weapon handling and sound. |
| AI | Ships | Awareness, shouts, cover, flanking, search; readable intent (low ready vs raised). |
| Extraction | Ships | Pad with alarm and reinforcements, lift with breaker, orbit window, endings. |
| Economy | Ships | No buy/sell arbitrage (tested); crew-issue kit unsellable; fuel fallback; reward scales with risk. |
| Inventory | Ships | Grid, rotation, stacking, provenance-safe. |
| Save system | Ships | Versioned with backup and migration; refresh mid-raid is M.I.A. exactly once; extraction banked at the moment it happens. |
| Animation | Ships, with a limit | Procedural rig over painted side-view walk cycles. No 4-direction bodies in the source art. |
| Visuals | Ships | One tileset and one character sheet, differentiated by recoloured walls, lighting and props. |
| VFX | Ships | Coherent pixel language: stepped glows, shaped flashes, particles on the pixel grid. |
| Audio | Ships, with a limit | Every sound is synthesized. Recorded samples would raise the ceiling (see below). |
| UI/UX | Ships | Industrial terminal look; covers between scenes; controls in the pause menu; first-raid hint. |
| Accessibility | Ships | Brightness, shake, optional sound cues, non-colour critical state. |
| Performance | Ships | About 0.8 ms of game code per frame in a full facility; heap flat across repeated raids. |
| Asset licensing | Needs one decision | The gun pack's license is unconfirmed (`ASSET_SOURCES.md`). Nothing external was added in this pass. |
| Code quality | Ships | Rules in `src/core` with tests; view/sim/UI separated; 97 tests. |

## Known limits and next steps

- **External assets.** This pass could not reach asset sites (`kenney.nl` and
  `opengameart.org` were blocked by the environment's network policy), so every new
  visual is derived from the project's sheets or drawn procedurally, and all audio is
  synthesized. The highest-value next step is licensed recorded audio (CC0 weapon, foley
  and ambience packs), dropped in behind the same `AudioService` calls.
- **Music.** There is ambience but no score.
- **Four-direction characters.** Characters only have side-view walk cycles.
- **Performance hardware.** Measured in a headless browser with software GL. A pass on
  target hardware should confirm 60 FPS with the GPU doing real work.
