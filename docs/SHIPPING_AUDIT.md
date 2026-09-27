# Space Junkers: polish passes and shipping audit

This document covers three passes. The **character pass** (newest, first) replaced the
AI-painted characters with hand-animated layered sprites and polished controller UX, the
raid HUD, death recovery, lighting and set dressing. The **final master pass** below it added
controller support, recorded sound and music, new enemy art, room signage and a lighting
pass. The **final polish pass** did animation, weapon feel, synthesized audio, lighting,
transitions and set dressing.

## Character pass

### Characters

The old characters were AI-painted side-view frames flipped left and right, with the body
sliding under a static pose. They are replaced by hand-animated sheets from the Liberated
Pixel Cup and the Universal LPC generator (authors and licenses per file in
`Assets/LPC/CREDITS.csv`; see `ASSET_SOURCES.md`).

- **Four facings, real cycles.** Walk (8 frames, 2 steps), run (8), breathing idle, kneel,
  and the collapse. The frame follows distance walked, so feet plant instead of sliding;
  footsteps fire on the contact frames. Turning right round passes through facing the camera.
- **A body that carries a gun.** `tools/build_characters.py` builds the gun-carrying walk and
  run: the torso of the LPC two-handed hold over the legs of the walk and run cycles. The hand
  that swings below the waist in the walk is masked out (using the glove layer) and the thigh
  behind it filled. The procedural weapon rig (aim, recoil, reload choreography, sprint port
  arms, draw, throw) sits in those hands; the hands' height follows the torso bob.
- **Equipment is visible.** Each helmet, armour and pack is its own sheet, stacked at runtime
  (`src/game/entities/layers.ts`, `look.ts`) in every animation, for both operators:
  - Respirator cap: canvas wrap and filter mask. K-6: olive steel helmet. Zaslon: full-face
    assault helmet with a lit cyan grille.
  - PS-2: canvas vest. Zhuk-3: plate carrier. Granit-4: plate with pauldrons.
  - Sack, RD-54 with webbing, Turist box rucksack, Beta-7 framed raid pack.
  - Steel headgear hides the hair.
  - The weapon drawn is always the one equipped.
  - The loadout shows aboard the ship too, and changes the moment it's changed at the stash.
- **Palette.** Every layer is recoloured onto the game's ramps (worn olive, canvas, gunmetal,
  rust, Soviet red), skin and hair through the LPC artists' own ramps, so the characters sit in
  the painted world instead of looking imported.
- **Enemies** wear their faction's clothes (scavenger hoods and gas masks, raider bandanas and
  leather, garrison olive, security black) plus whatever armour they actually rolled, so a
  helmet you see is a helmet you have to beat. Head coverings give way to helmets. Hit
  flashes are white silhouettes of every layer.
- **Crew** keep their identities: Molot is bald, Black, heavy, in shades, plate and rust-red
  webbing; the smuggler is a red hood and a wrapped face; the trader an old man in a canvas hood
  with a grey beard and round glasses; the medic in a white coat; the hacker in a dark hoodie.
  Each has a small routine: the hacker hunched at the console, the medic working at the bed,
  the trader sorting stock, the smuggler glancing about, Molot going over his kit. They turn to
  you and talk with their hands.
- **Gear sounds with the body.** Packs and webbing shift, plates knock on footfalls, scaled by
  what's worn.

### Controller and HUD

- **DualSense / DS4:** the touchpad opens and closes the map, Create is the bag, Options
  pauses. Xbox and Nintendo pads keep the view button (tap: bag; hold: map). A PlayStation pad
  whose touchpad the browser doesn't report falls back to holding Create. Prompts, the pause
  menu's control list and the README follow.
- **No permanent key list in raids.** The HUD shows state (flashlight, haul, weight, ammo),
  never keys. Prompts appear where they matter (containers, doors, the pad, an empty magazine,
  a jam). Each raid opens with a one-line reminder (map, bag, controls) that fades after
  seven seconds; the operator's first raid shows the full key list for fourteen. Controls stay
  in the pause menu.

### Death and the ship's reserve

Death still takes everything carried. Back aboard with no gun that can fire (a gun with
rounds for it, anywhere) or no pack, the reserve fills the gap: a crew-issue SP-5 with a box
of rounds and a bandage, and a canvas sack, put in empty slots, with a note from Molot. Crew
issue is worth nothing to traders, it never replaces anything and never stacks up
(`src/core/reserve.ts`, tested).

### Light and place

- **Room light.** A lit room's bounce light was a point light clipped by the walls, and it cut
  hard rectangles across open floor at doorways and wall notches. It is now a feathered fill
  over the room. Lamp shadows are baked from several points across the tube (soft penumbra).
  Muzzle flashes and blasts are stopped by walls. Dying tubes stutter less often and never go
  fully dark.
- **Rooms that say what they were.** A second plate in most rooms: NO SMOKING in stores,
  RADIATION at the reactor, AMMUNITION in the armoury, STERILE in the medbay, LIGHTS OUT 22:00
  in barracks, THE PLAN IS LAW in offices. Floor litter comes mostly from the room's own work,
  dropped near the furniture: paperwork in offices, dressings and pills in medbays, ammo tins
  in armouries, drives and cable in computing, parts in workshops. Containers already matched
  their rooms (medical cabinets, ammo cases, server racks, filing cabinets). Corridors get
  scuffs, stains and the odd dropped thing underfoot.

### Money

The currency is **kosmorubli** (КР, *KR* on screen), the orbital rouble. Player-facing only;
the code keeps `credits`.

### What was tested, honestly

| Check | Result |
|---|---|
| Unit tests | 130 passing (22 files). New: the ship's reserve (6), touchpad reading and map prompts (3), the character atlas (every look, gear piece, faction and crew member has its animations) (5). |
| Type check and production build | Pass. |
| Keyboard and mouse | Automated in headless Chromium: title → ship (walk, all five crew in their routines, facing you) → range (walk, sprint, backwards, four facings, fire, reload) → facility raid (enemies of each faction seen, killed, collapse) → map → extract → results → ship. No console errors. |
| Controller only | Automated with a virtual DualSense (`054c` id, 18 buttons, mocked rumble). New game → Create opens the stash → focus the respirator cap, △ → EQUIP (it shows on the operator) → nav, □ set course → airlock, ✕ deploy → stick move, stick aim, R2 fire, □ reload → **touchpad opens the map, touchpad closes it** → Create bag, ○ close → Options pause (controls list shows CREATE Bag, TOUCHPAD Map, OPTIONS Pause) → hold ✕ to search → extract → results ✕ → ship → second raid → death → results → ship. Rumble fired (25 slices). No console errors. The harness teleported between rooms and made the player untouchable. |
| Death and recovery | Three runs: expensive kit (AKR-74, Granit, Zaslon, Beta-7, empty stash) → all lost, reserve issues SP-5 + rounds + sack; a PM-9 with no rounds anywhere counts as unarmed → SP-5 issued; cheap kit dies again → re-armed. With a usable Obrez still in the stash, only the missing sack is issued. |
| Equipment visuals | Every helmet, armour and pack checked on both operators in all four facings and the collapse (preview sheets from the atlas), and in game on the ship and in a raid. |
| Performance | Same script on `main` and on this branch, headless Chromium with software GL, a facility with 5–15 enemies: simulation 0.4–0.5 ms per frame on both; scene update 0.8–1.0 ms on both; draw submission about 1.0 ms on main and 1.4 ms here (layered sprites, a 2048² character atlas, masked flashes). Heap about 64 MB on main, 77–81 MB here. |

**Not tested:**
- A physical controller. The touchpad index (button 17) is Chromium's standard mapping for
  DualShock 4 / DualSense; other browsers may not report it (the hold-Create fallback covers
  that).
- Browsers other than Chromium; frame rate on a real GPU.
- The new foley by ear (levels set relative to the boots).

### Known issues and limits

- **LPC style.** The characters are LPC proportions (a larger head than the old painted art)
  at about 48 px tall, a little taller than before. The recolour grounds them in the world,
  but they are cleaner than the painted tileset.
- **The gun and the arms.** The hands hold a fixed two-handed carry per facing; the gun rotates
  freely around them. At diagonals the gun turns further than the shoulders do. Reloads move
  the gun and the free hand's cargo, not the arms.
- **Crouch.** Sneaking is a slower walk; LPC has no crouched walk cycle.
- **License.** LPC art is CC-BY-SA 3.0 / GPL 3.0 (with some OGA-BY, CC-BY and CC0 parts): the
  character atlas is a derivative and must be shared under a compatible license with the
  credits in `Assets/LPC/CREDITS.csv`. The gun pack's license is still unconfirmed.

---

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
  the map. (Character pass: on PlayStation pads the touchpad is the map.)
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

(Superseded by the character pass: enemies are now layered LPC characters.) The old enemies
were the player's body recoloured with a front-facing head pasted on. Each faction was
dressed on the side-view walk cycles at game resolution:

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
  procedurally. (Gone with the character pass.)
- **Characters are side-view walk cycles.** There are no four-direction bodies. (Fixed by the
  character pass.)
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
| Animation | Ships | Hand-animated four-direction LPC characters with the procedural weapon rig on top (character pass; was: side-view only). |
| Visuals | Ships | One tileset, layered character sheets on the game's palette; equipment shows on the body (character pass). |
| VFX | Ships | Coherent pixel language: stepped glows, shaped flashes, particles on the pixel grid. |
| Audio | Ships | Recorded guns, boots, impacts and handling over the synthesized ambience; sparse music (master pass). |
| UI/UX | Ships | Industrial terminal look; covers between scenes; full controller navigation and device-aware prompts (master pass). |
| Accessibility | Ships | Brightness, shake, optional sound cues, non-colour critical state. |
| Performance | Ships | About 0.8 ms of game code per frame in a full facility; heap flat across repeated raids. |
| Asset licensing | Needs one decision | Every added asset is recorded in `ASSET_SOURCES.md`: audio CC0, fonts OFL, characters LPC (CC-BY-SA 3.0 / GPL 3.0 and compatible, credited per file). The gun pack's license is still unconfirmed. |
| Code quality | Ships | Rules in `src/core` with tests; view/sim/UI separated; 116 tests after the master pass. |

## Known limits at the end of that pass

These were the open points after the polish pass; the master pass above closed the first two
(recorded audio from CC0 packs, and sparse music). The last two still stand.

- **External assets.** That pass could not reach asset sites, so all audio was synthesized.
- **Music.** There was ambience but no score.
- **Four-direction characters.** Characters only had side-view walk cycles. (Closed by the
  character pass.)
- **Performance hardware.** Measured in a headless browser with software GL. A pass on
  target hardware should confirm 60 FPS with the GPU doing real work.
