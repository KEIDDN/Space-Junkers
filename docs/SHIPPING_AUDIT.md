# Space Junkers: polish passes and shipping audit

This document covers two passes. The **final master pass** (newest, first) added controller
support, recorded sound and music, new enemy art, room signage and a lighting pass. The
**final polish pass** below it did animation, weapon feel, synthesized audio, lighting,
transitions and set dressing.

## Final master pass

### Controller support

- **Actions, not keys.** Gameplay asks for actions (fire, steady, reload, interact, sprint,
  sneak, switch, grenade, heal, quick slots, bag, map); `src/engine/actions.ts` binds them to
  keyboard/mouse and to a standard-mapping gamepad. Xbox, PlayStation and Nintendo pads are told
  apart and their own button names are shown.
- **Sticks that feel designed.** Radial deadzones with an outer ring, analogue walk speed,
  trigger hysteresis. The right stick aims with turn smoothing (small deflections turn slower
  for fine corrections, flicks snap), and how far it is pushed sets how far out the reticle sits
  (so grenades land where you push). When the aim stick rests, the aim holds, then drifts to the
  walk. A light aim assist bends the line toward a hostile you can actually see, within a few
  degrees, never through walls, and never while the stick is at rest (setting: on by default).
- **Steady aim** (LT / right mouse, new for both): slower feet, a tighter cone, the view leans
  further out.
- **Sprint** latches on L3 until the stick comes back or the gun comes up. **RB/LB** throw a
  grenade and treat wounds with the kit that fits the wound. **View** is the bag, and held it is
  the map.
- **Menus.** Every screen is a navigation scope for a spatial focus navigator
  (`src/ui/nav/PadNav.tsx`): D-pad or stick moves focus, A confirms, B backs out, LB/RB switch
  tabs or panels, the right stick scrolls, Start pauses. Inventories are fully usable. Carry an
  item with A to any grid cell, equipment slot, quick slot or the sell counter; X quick-moves;
  Y opens its actions or rotates what you carry. Tooltips follow focus. Focus is drawn as the
  terminal's own amber bracket. Picking up the pad shows focus without acting on that first press.
- **Prompts follow the device.** Prompts, hints, HUD labels and the controls list show keycaps
  or button faces, whichever you touched last.
- **Rumble.** Mixed envelopes streamed to the pad:
  - **Shots:** each gun has its own weight (a pistol snaps, a shotgun or a Mosin shoves).
  - **Weapon handling:** a magazine seating, a bolt or pump worked, a round thumbed in.
  - **Taking fire:** hits (a sharp knock when armour stops it), near misses, blasts by distance.
  - **Confirmations:** a kill, a search finishing, a breaker thrown.
  - **Extraction:** the klaxon pulses on the pad and escalates; completion rumbles.
  - **Other:** death, and a heartbeat when badly hurt.
  - **Settings:** vibration 0–100 %, aim speed and aim assist appear once a controller is
    connected.
- **The ship got a menu.** Esc or Start with nothing open shows the service record with a
  settings tab.

### Sound and music

- **Recorded gunshots.** Every gun now fires recordings from the CC0 Free Firearm Sound Library,
  matched to its real counterpart:
  - PPD-41 → PPSh, Mosin-K → Mosin-Nagant, AKR-74 → AK-47, SKV → SKS, and so on.
  - Near and far takes crossfade with distance, walls take the top off, and the room reverb
    still adds the tail. Distant fire is a dull boom rolling around the concrete.
- **Recorded foley.** Boots, impacts, falling bodies, grenade blasts, cloth, coins, reloads,
  bolts and pumps come from Kenney's CC0 packs and CC0 OpenGameArt recordings.
  - Each floor adds its own voice: a plate rings, a grate rattles.
  - Enemies are heard working their bolts and pumps.
  - Each recorded sound keeps its synthesized version as a fallback.
- **Mix.** Balanced by measuring the output again: recorded close shots peak where the
  synthesized ones did, and your own steps sit about 25 dB under them.
- **Music, used sparingly.**
  - **Title:** a theme ("Pondering the Cosmos").
  - **Ship:** a quiet, warm piece ("Sirens in Darkness").
  - **Raids:** silence until someone is hunting you or rounds are flying. Then a low, dark layer
    ("Narrow Corridors") rises, lingers, and lets go. It swells a little in the last two minutes
    and during the extraction, and fades on death or the way out. Its low register never masks
    footsteps.
  - A new music volume setting controls all of it.

### Enemies

The old enemies were the player's body recoloured with a front-facing head pasted on. Each
faction is now dressed on the side-view walk cycles at game resolution (`enemy_frame` in
`tools/build_assets.py`):

- **Scavengers:** rag hoods, gas masks and filters.
- **Raiders:** red-sprayed helmets, or scarves over their faces.
- **Garrison soldiers:** olive, with a red star on the helmet.
- **Corporate security:** black armour with a lit cyan visor.
- **Two looks per faction:** a second, smaller figure with a drawn dome helmet or hood.

Heavier hits stagger enemies longer: a rifle round rocks them, a pistol stings.

### Places and light

- **Signs.** Bilingual stencilled plates (ЦЕХ / WORKSHOP, МЕДПУНКТ / MEDICAL, СПЕЦХРАН / NO ENTRY,
  ТРЮМ / CARGO, МАШИННОЕ / ENGINES...) in a hand-cut 5-pixel Cyrillic/Latin font, placed clear of
  lamps and furniture. They mark every facility room and every compartment of the ship.
- **Lit rooms read as lit.** A soft wash under their wall lamps, emergency lamps reach further,
  and every world's ambient floor was raised about 20 %. Unlit rooms and corridors stay dark.
- **Credits** on the title screen.

### What was tested, honestly

| Check | Result |
|---|---|
| Unit tests | 116 passing (20 files). New: stick shaping and pad families, stick aim and aim assist, spatial focus, rumble mixing. |
| Type check and production build | Pass. |
| Keyboard and mouse playthrough | Automated in headless Chromium: title → ship → crew and contract → trade → stash → course → deploy → fight → loot → map → extract → results → sell → ship work → second raid → death → refresh mid-raid. No console errors. |
| Controller-only playthrough | Automated with a virtual standard-mapping gamepad (Xbox ids) injected into the page; every input came from the pad. Covered title → new game → walk → talk to Fedya, accept a contract → trade: buy with A, sell by carrying an item onto the counter → stash: equip via the action menu, carry items into the bag, quick-move → set course → deploy → move, aim, fire, reload → hold A to search → take all (RT) → map (hold View) → pause (Start) → extract → results → ship → sell from the action menu → second raid → death → results → ship. No console errors. The harness teleported between rooms to save walking time and made the player invulnerable during fights. |
| Rumble | The game's rumble calls were recorded through a mocked `vibrationActuator` (about 100–200 slices per session, envelopes as designed). Not felt on hardware. |
| Break-it | Refresh during the extraction beat counts as extracted, not M.I.A.; dying mid-search and mid-throw leave no stuck state or live grenade. |
| Performance | About 0.3 ms simulation and 0.6 ms of render submission per frame with 13 enemies (same as before the pass). Heap flat at 60 MB over six deploy/abandon cycles. |

**Not tested:**
- A physical controller, or rumble felt on real hardware.
- Browsers other than Chromium.
- Frame rate on a real GPU: headless Chromium draws with software GL, so only the code's cost
  was measured.
- The audio by ear: the mix was balanced by measuring the output, not by listening.

### Known issues and limits

- **Sound needs a first click or key.** Browsers only start sound after one. A controller
  button doesn't count everywhere, so with a pad and sound still locked, a small notice says so.
- **Ogg Vorbis recordings.** In a browser that can't decode Ogg (older Safari), the game falls
  back to its synthesized sounds and plays no music.
- **Small female-variant enemy faces.** They are only a few pixels, so their headgear is drawn
  procedurally.
- **Characters are side-view walk cycles.** There are no four-direction bodies.
- **The Free Pixel Gun Pack's license is still unconfirmed** (see `ASSET_SOURCES.md`). This is a
  private project; confirm it before any release.

---

## Final polish pass

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
| Audio | Ships | Recorded guns, boots, impacts and handling over the synthesized ambience; sparse music (master pass). |
| UI/UX | Ships | Industrial terminal look; covers between scenes; full controller navigation and device-aware prompts (master pass). |
| Accessibility | Ships | Brightness, shake, optional sound cues, non-colour critical state. |
| Performance | Ships | About 0.8 ms of game code per frame in a full facility; heap flat across repeated raids. |
| Asset licensing | Needs one decision | Every added asset is CC0 or OFL and recorded in `ASSET_SOURCES.md`; the gun pack's license is still unconfirmed. |
| Code quality | Ships | Rules in `src/core` with tests; view/sim/UI separated; 116 tests after the master pass. |

## Known limits at the end of that pass

These were the open points after the polish pass; the master pass above closed the first two
(recorded audio from CC0 packs, and sparse music). The last two still stand.

- **External assets.** That pass could not reach asset sites, so all audio was synthesized.
- **Music.** There was ambience but no score.
- **Four-direction characters.** Characters only have side-view walk cycles.
- **Performance hardware.** Measured in a headless browser with software GL. A pass on
  target hardware should confirm 60 FPS with the GPU doing real work.
