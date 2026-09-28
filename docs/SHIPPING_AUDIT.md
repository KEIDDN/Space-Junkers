# Space Junkers: polish passes and shipping audit

The **narrative coherence and onboarding pass** (newest, first) made the practical world plain
in the first half hour (who the operator is, the arrangement with Fedya, why the crew raids, why
it flies further) while leaving the past as evidence. The **raid identity pass** made the systems that were already there talk to
each other: guns that differ in how far they're heard, hostiles who hear distance and differ in
temper, a loud shortcut in most facilities, worlds that build and behave differently, events
that make stories, and a report and a crew that tell them back. The **world, narrative, combat
and extraction depth pass** is further down. Before those, four passes: the **immersion pass** gave the characters
back the Space Junkers look, added a playable first morning aboard, made Tikhaya hard but
learnable, made the emergency kit impossible to miss, and filled the world with life,
storytelling and threads. The **character pass** replaced the AI-painted characters with
hand-animated layered sprites and polished controller UX, the raid HUD, death recovery,
lighting and set dressing. The **final master pass** added controller support, recorded sound
and music, new enemy art, room signage and a lighting pass. The **final polish pass** did
animation, weapon feel, synthesized audio, lighting, transitions and set dressing.

## Narrative coherence and onboarding pass

A content pass, not a system, and no new lore. The lore was already strong; too much of it was
background a new player had to reconstruct. Rule used throughout (now the lore bible's "north
star"): the present is said plainly and early, then the fragments raise questions about the past.

### Audit before any change

Kept as it was: the lore bible, the threads and records, the three-step first morning, the pump
contract, the radio coach (already plain), the moments system, the operator bios, the voices.
Gaps found:

- The crawl named the Commonwealth without saying what it was, never said Central stopped
  answering, never mentioned the Belt or that crews *live off* the old sites, and ended on
  "you are the one who goes down" with no reason.
- Fedya's arrangement with the operator was only implied ("you still owe me the fare").
- Nothing said why the crew can't just buy the regulator: the reason for the whole loop.
- Nothing said why Tikhaya comes first.
- Nothing in the first morning hinted that something doesn't add up; the first hook was the
  Zarya-7 log, and only for someone who read it.
- Destinations were a level select: no reason to go, no crew opinion; locked hints said "earn
  his trust" without saying how.
- "The Collapse" (Kombinat's description, a pocket watch): a term the lore never uses.
- Money never read as fuel outside the report.
- Reactions to raid moments were apt but said little about who was speaking.

### Onboarding map: what the first half hour says, and where

| When | What the player learns | Where |
|---|---|---|
| Opening (8 lines) | The Commonwealth ran the system from Central; 41 years ago the clocks stopped and Central stopped answering; the colonies left for the Belt; what they built is still there, some of it running; the Belt buys anything that works and crews bring it up; the Lastochka is one; you came from the Belt owing the fare; the last operator didn't come back; today the pump is failing and nobody sells the part. | `INTRO` |
| Walking the ship | Each crew member's first words carry their slice: Fedya (fuel, parts, food, the loan), Molot (who's down there), Doc (medicine; nobody grades bravery), Shura (the stations still run; useful, and a bit weird), Lis (other crews; what sells). Overheard: "why don't we just buy a regulator?" / "From who? With what?" / "That's what the operator is for." | crew `intro`, `CHATTER` |
| Cockpit radio | The arrangement ("you go, you come back, you get a share, you eat at my table, you work off the fare. It isn't charity. It isn't prison either"); why raid ("nobody makes them any more; if somebody did, we couldn't pay"); why Tikhaya (nearest moon, cheapest fuel, where every crew starts). | `STEP_LINES.job` |
| Airlock | Fedya: fuel's paid. Shura: Zarya-7 went quiet but its lights are still on, and nobody has paid for power in forty years: *notice things*. The first question, not an answer. | `STEP_LINES.airlock` |
| Zarya-7 | The station master's log ("never missed a shift"; batteries going missing, "not us, we counted"). | existing `ZARYA_LOG` |
| Home | Hand-in: "That's the whole life... something breaks, nobody sells it, somebody goes down and takes it." Money reads as jumps home at the trader. The nav console says why each world is worth the fuel. | `fedya_first.done`, trade, nav |

Optional depth for anyone who asks: "What exactly do I owe you?", "Why not just buy what the
ship needs?", "Why fly further out?" (Fedya); "Who else is down there?" (Molot); "What was the
Leaving?" (Doc); "Why do sealed doors open?" (Shura: the plain fact, then "why on the minute is
the part I don't like"); "Who else does what we do?" (Lis, true to her real prices).

### Also changed

| Where | Change |
|---|---|
| Nav console | Each world: WHY GO (Tikhaya keeps the ship running; Merzlota pays for going further; Krasnaya is kit good enough to come back; Kombinat the valuable salvage; Sirin "Shura wants to know what is on the other end of channel nine") and a short crew exchange. Locked hints say whose jobs open them. |
| Airlock | One crew line per raid after the first: money first ("That jump was the last of the fuel money. Come back heavy"), otherwise about the destination. |
| Trade | Credits read as jumps home; Fedya: "Good. That buys another jump" when a sale does. |
| Overheard | Also: "that's enough" / "we need the money" / "we need them more"; what a jump cost; other crews; the creditor; landing somewhere for good. |
| Raid moments | Reactions show the speaker: Molot goes back to Krasnaya and Depot 4, Doc to Kharon, Fedya counts the orbit he's paying for. |
| Canon | "The Collapse" removed. Lore bible: the north star. |

Deliberately not explained anywhere: why the clocks stopped, what nine is, what Sirin is, why
the lights stay on, who is right.

### Tested

- 282 unit tests (39 files), type check, production build. `narrative.test.ts` holds the
  contract: the opening covers the Commonwealth, Central, the Belt, the crews, the operator and
  the pump, and names nothing of nine, Sirin or the signal; lines stay short; Fedya states the
  arrangement, the reason and why Tikhaya; Shura's airlock line raises a question; each crew
  intro carries its slice; every world has a reason and crew talk; one term for the end of the
  world; the airlock line's money logic.
- Browser (headless Chromium, dev build): NEW GAME → operator → the final crawl typed out in full and
  fitting at 1280×720; the nav console with Merzlota's WHY GO and exchange; the airlock line, and Fedya's
  money line when broke; trade at 480 KR ("1 JUMP"), a sale to 988 KR ("3 JUMPS", Fedya's
  line). No console errors.

### Not verified

- How the writing reads to someone new: the real test of this pass.
- The first-morning scenes clicked through line by line in the browser (their text changed;
  the scene panel that shows them didn't).

## Raid identity pass

Goal: a raid should leave a story the operator wants to tell. Not by scripting one, but by
making the existing systems (noise, AI, level, loot, clock, crew) interact strongly enough
that situations happen.

### Audit before any change

Most of the brief was already in the game from earlier passes: the lore bible and three-layer
dialogue, contracts bound to sites with plain `intel`, zones, vaults and keycards, the lift as
a second exit, noise "attention" that brings squads sooner, four sparse raid events, crew
reactions, death debriefs. Those were kept as they were. The gaps, read from the code:

- **Every shot looked the same to the AI.** All guns were over the old 250 px "alert"
  threshold, so every listener in range ran straight at the shooter (error: 14% of distance).
  Nobody was ever "suspicious but unsure".
- **Loudness was flat.** Pistol 380, sawn-off 520, rifle 560: a shotgun was barely an
  announcement.
- **Factions differed only in numbers.** One decision tree, different stats.
- **Searches were random scatter** around the last known point, not rooms.
- **No route had a trade-off.** Loops existed; nothing made one way loud-and-fast and the
  other long-and-guarded.
- **Worlds differed in look, loot and enemy mix, not in how they played.**
- **Events were atmosphere**; none produced a "vault moment" or put someone behind you.
- **Nothing told the raid back.** The report listed items; the crew reacted to hp, rarity and
  kills.

### What changed

| Area | Change |
|---|---|
| Weapons | Loudness is part of what a gun is: pistols 330–340 (below the channel's notice, so they don't bring squads sooner), SMGs 370–420, rifles 520–580, shotguns 660–680, marksman 740–780. Each gun has a plain USE line on its tooltip ("DOORWAYS. DEVASTATING CLOSE, USELESS FAR, VERY LOUD"); NOISE reads as what it means ("QUIET · THIS ROOM AND NEXT DOOR"). Damage, rate and handling untouched. |
| Hearing | How far a sound was heard decides the response: close and loud, a run with the gun up; mid-range, a careful look; at the edge of hearing, "somewhere that way", and depending on temper they stop, face it and listen instead. The guess gets worse with distance and through walls. A quiet noise gets a spoken "who's there?". |
| Temper | `Temper` per faction (curiosity, patience, sweep, push, panic, overwatch). Scavengers freeze at distant shots, give up in ~5 s, scatter when one drops. Raiders go toward noise, search wide and long, push when you break contact. The garrison checks a noise in pairs, one covering from halfway, and holds corners. Corporate security sweeps methodically and covers. Gvozd waits. |
| Search | Room-aware: a spot or two in the room the noise came from, then the nearest rooms around it. Giving up is audible (a mutter). |
| Shortcut | Most facilities (~56%) have a **jammed shutter**: an extra link (never part of the spanning tree) from a shallow room to a much deeper one, never the landing, pad or vault. Depths and zones are measured with it shut. Forcing it takes 3.5 s, screams at halfway and bangs at the end (as loud as a marksman shot), and counts toward attention. It saves a median of 58 tiles of walking (min 18). Rust leaves, an amber lamp with a little light, JAMMED on the map. Shura explains it if asked. Never for a learning operator. |
| Worlds | `SiteRules` per destination: Merzlota cramped and darker; Krasnaya open halls, more cover, 60% of restricted/deep guards posted; Kombinat lit, 45% posted; Sirin dark. Tikhaya has no rules, so its facilities and the first job's station are byte-for-byte as before (tested). |
| Events | Two new: **patrol** (a squad walks back through rooms you've already explored; Shura hears boots on the band) and **seal** (a vault's reserve cell dies and the seal with it: the vault opens on its own, loudly, and hostiles near it go to look; only planned where a sealed vault exists). Weights per world: Krasnaya patrols, Kombinat alarms and seals, Merzlota blackouts, Sirin channel nine and never gunfire. Still 0–2 per raid, never in the first 90 s or last 4 min. |
| Story | `core/story.ts`: the raid records moments (shutter forced, seal failed, patrol, blackout, someone else's fight, alarm, channel nine, a deliberately dropped item worth 400+ KR, extracting with hostiles close, with under 90 s on the window, under 25% health). The report shows up to five lines, in order, how it ended always included. |
| Crew | Each moment belongs to one crew member: Molot (shutter, being chased out), Shura (seal, channel nine, blackout: Layer C, unexplained), Fedya (last minute, the patrol), Doc (getting out on nothing), Lis (what you left on the floor). The most recent moment is what they bring up. Molot's advice now teaches loudness in plain terms. |
| Fixes found on the way | The tactical map had no labels for security and lab rooms. |

### Tested

| Check | Result |
|---|---|
| Unit tests | 272 passing (38 files). New: hearing by distance, far-off listening vs going, worse guesses with distance, garrison overwatch vs raiders both going, scavengers giving up sooner and scattering more, room-aware search; shutter frequency, shortcut gain, long way always open, never on landing/pad/vault, none for learners; cramped vs open rooms, darker Merzlota, posted Krasnaya, Tikhaya unchanged; per-world event mixes, no seal without a vault; the story's order and cut; weapon loudness ordering and tooltips. The AI tests use real randomness; the new ones were run 60× in a row without a failure. |
| Type check, production build | Pass (the chunk-size warning is old). |
| Browser (headless Chromium, dev build, scripted) | Tikhaya seed 1259 through the real UI: title → continue → airlock → deploy. Walked (teleported) through four rooms; at the shutter the prompt read "FORCE THE SHUTTER. It will be heard"; holding E forced it, the feed said so, the nearest hostile (420 px) came to search. Fired three pistol rounds 7 tiles from a scavenger: it fought, and shouted a second into a chase. Fast-forwarded the clock to the seal (vault doors opened, hostiles near it went alert/investigating) and the patrol (14 → 20 hostiles, Shura's line). Dropped a 900 KR grenade from the bag (counted) and an overflow item (correctly not counted). Extracted at 18/100 hp with 62 s left: the report told five lines. Aboard, each of the five crew said a different, fitting line. Also Krasnaya (8 of 15 guards posted, a posted soldier not drawn out by shots from outside his room), Merzlota (cramped landing, a blackout event) and Kombinat. No console errors in any run. |
| Performance | Headless software GL, Kombinat, 10 hostiles: simulation 0.08 ms/frame (no rendering), a facility-wide noise 0.012 ms. |

The harness made the operator untouchable, teleported between rooms, set the raid clock
forward to reach events and set health for the ending. Found and fixed during these runs: the
shutter prompt promised "everyone on this level will hear it" when walls cut its reach to one
room (it's now louder and the text says only what's true); overflow drops counted as a choice;
the recap's cap crowded out the middle of the story; the shutter was invisible in the dark.

### Not verified

- **Feel, by hand.** Headless software GL runs far below real time; nothing about pacing,
  whether the new hearing makes stealth readable, or whether "one more room" lands, was judged
  by playing. This is the first thing to check with a person at the controls.
- **Balance of the new tempers.** Raiders now push harder and search longer; the garrison is
  more static. Numbers were set by reasoning and unit behaviour, not playtesting.
- **Controller.** Nothing about input changed; the new prompt uses the same hold glyph as the
  others. Not re-run on a virtual pad this pass.
- **The new crew lines and texts by ear/eye in context**, beyond the playtest's captures.

### Rejected to avoid scope creep

Fixed per-name facility layouts (strong for mastery, but the lore says every signal is a
freshly opened site, and the brief asks for stable language rather than fixed maps), a
stealth meter, visible awareness icons over heads (the "who's there?" and the gun coming up
already say it), enemy vocal barks beyond the existing ones, new enemy types, weapon mods,
persistent per-world intel, new contracts (the contract layer already does what the brief asks).

## Immersion pass

Not a feature expansion. Audited only what this pass touched: character art and its
pipeline, equipment visuals, onboarding, lore presentation, Tikhaya's balance, AI tuning, aim
assist, lighting, props, ambient life, the reserve, and the title.

### Characters: the Space Junkers look, recovered

The character pass made the characters move properly but drifted from the game's look: LPC
heads are 22 px on a 30 px body (chibi proportions, big eyes), and the operator wore blue.
A new search for external character art (OpenGameArt, itch.io) found generic modern
soldiers, 16 px units and Doom-style renders; nothing close to the original sheets. So:

- **The motion stays LPC** (walk, run, gun carry, idle, kneel, the fall, crew gestures).
- **The identity is drawn for this game** (`tools/sj_heads.py`), placed on the neck of every
  LPC frame so it moves with it:
  - Heads at adult proportions (about 10 px; a figure is now ~3.5 heads tall). Volk cropped
    and stubbled; Zorya with her hair knotted back and the red scarf from the original sheet.
  - Helmets: the **K-6 in worn pale steel with the red centre stripe** (the helmet from the
    original operator art), the Zaslon as an Altyn-style dome with a lit visor slit, the
    quilted cap with a filter mask. Helmet off: the face shows; helmet on: its silhouette.
  - Packs, each a size up: the slung sack, the RD-54 with side pouches, the Turist with a
    bedroll, the Beta-7 on a steel frame that shows over the shoulders even from the front.
    Straps show from the front; the head is always in front of the pack.
  - Crew heads from their portraits: Lis's red hood, wrap and amber visor; Doc's knot and
    high collar; Molot bald in shades and his red scarf; Fedya's hood, grey beard and red
    goggles; Shura's dyed streak and headphones.
  - Enemies: gas masks and hoods (scavengers), bandanas (raiders), the pilotka and ushanka
    with the star (garrison), balaclavas with lit goggles (security). A helmet replaces them.
- Operator coveralls in charcoal drab. Armour stays LPC (its pauldrons and plates change the
  torso silhouette) but never covers the face.
- The ID photos on the operator select are the painted heads from the original sheet again.
- Unused LPC sheets removed; credits filtered to what remains.

### The first morning aboard (prologue)

- The premise typed over black (skippable; a line per press on a controller).
- Wake at the bunk; Fedya on the intercom. A quiet **ship log** line under the ship's name and
  a small chevron point at the next stop. Walk freely; meet the crew on the way.
- **Locker:** Molot signs the kit over piece by piece (the PM-9 and its counted rounds, the
  sack, the bandages, what you can lose and what you keep), then the stash opens on it.
- **Cockpit radio:** Fedya on the Commonwealth, the facilities, the ship, and the first job:
  service station Zarya-7 on Tikhaya stopped answering; the reactor pump needs batteries and
  parts; the coming back is the job. His First Salvage contract is accepted, the hop is free.
- **Airlock:** Shura will be on the radio; Molot's last advice. Deploying ends the prologue.
- Zarya-7 is a fixed, gentle layout; its first terminal is the station master's shift log.

### Tikhaya: hard, but learnable

Being seen meant dying within two seconds: close-range awareness built at once, the first
round came ~0.7 s later, and nine buckshot pellets each rolling a 2.1× headshot made a
sawn-off a certain kill at any close range.

- **Per-world AI tuning** (`AiTuning`): reaction, aim, how fast they notice, damage to the
  operator, coordination (shout range, flanking), burst pauses, and a **startle**: the first
  rounds of a fresh fight go wide, then settle. Tikhaya is the forgiving end, Merzlota a
  little; the other worlds are unchanged.
- **Learning operators** (Tikhaya, until their first extraction, three raids at most): softer
  tuning, and a gentler facility: empty rooms next to the entry, one lone scavenger with a
  pistol in the next ring, harder from there. Patrols never walk into the entry room (all
  worlds).
- A suspicious guard says it out loud ("who's there?") before committing.
- Pellets count as headshots about a third of the time (both ways).
- The crew on the radio talk a learning operator through the raid: someone close, a guard who
  heard you, the first fight, the first body, the first search, a wound, enough haul, half the
  window gone, the pad. Once each, never over each other.

### Controller aim assist

Moderately stronger, never a lock: a wider capture (~6° past the body, capped at 17°), a
little more pull and friction, and it stays with the same hostile as they move. Still off
with the stick at rest, visible hostiles only, never through walls. A little more reach for a
learning operator.

### Emergency kit

A real bug: dying in the starter kit brought back a sack and **no gun**, because the reserve
counted the Obrez in the starting stash as "armed". It now looks at what the operator carries:
no gun that can fire on you, or no pack, and the gap is filled **on you** (SP-5 loaded in the
holster, 28 rounds, the sack on your back, a dressing if you carry no meds, bound to a quick
slot). Crew issue already in the locker is handed back first, so it can't pile up, and it still
sells for nothing. Back aboard, an **EMERGENCY KIT ISSUED** slip (stamped ВЫДАНО) lists each
item and where it is; the death report says what the reserve will issue before you go back.

### The world: storytelling, threads, life

- **Vignettes**, three or four per facility, each with a note in someone's hand (on paper, not
  phosphor): a meal left on a desk, a child's drawing by a locker, a guard who held the stores
  until the rounds ran out, squatters' bedding with a candle still burning, a clock stopped at
  the Blackout, a warning from the last crew through. New pixel props (`tools/sj_props.py`).
- **Five threads** (the Blackout, Channel Nine, those who stayed, why the lights are on, what
  happened) tag the records; an operator is shown what they haven't read, earliest chapter
  first. New entries seed each thread early. Read records are kept (even on death) and listed
  by thread in the service record's **RECOVERED RECORDS**.
- **Coming home:** the crew react to how it went (Doc when you're badly hurt, Fedya to a rare
  find, Molot after a hard fight) and to what you read (once). Some topics open only after the
  right record. The child's drawing ends up on the medbay wall. The crew talk among themselves
  and you overhear it.
- **Life:** a machine spins up somewhere, a hatch slams, boots walk and stop; rarely, channel
  nine through a speaker (the same five tones on every world). CRT screens roll their refresh
  line; wall fans turn; lamps brown out now and then when a load comes on.
- **Rooms:** security posts and research labs, furnished and signed; a test keeps every sign
  inside the stencil font's letters.
- **Crew at their stations:** a second loop each (Lis over her crates, Molot on one knee with a
  plate, Doc reading), and Fedya's cigarette.

### Light, finish, title

- Lighting audited, not replaced: nine falloff steps instead of seven (big lamps stopped
  ringing), power sags (the look only; gameplay light is untouched), a stale comment fixed.
  Characters already have contact shadows and the operator's personal light.
- **Film finish** (on by default, FILM FINISH in settings): vignette, fine low-rate grain and a
  slightly colder, denser grade, done in the page so the pixels stay crisp.
- **Title:** the Lastochka's nav set: a blinking red lamp, a carrier meter that never settles,
  a relay ticker, a band of interference, and the logo's signal breaking up now and then.

### What was tested, honestly

| Check | Result |
|---|---|
| Unit tests | 146 passing (25 files). New: the reserve (arms you even with a gun in the locker, hands back crew issue, dressing only without meds), the gentle facility and patrols, AI startle and reaction, aim assist reach and tracking, the radio coach, the prologue, lore threads (unique, never repeated in a raid, early chapters first), sign letters. |
| Type check and production build | Pass. Production build smoke-tested in headless Chromium (title → new game → intro → ship → menu): no console errors, no dev hooks exposed. |
| Keyboard and mouse | Automated in headless Chromium on the dev build: first boot → premise → wake → locker scene → stash → meet Lis, Doc, Shura → cockpit (contract accepted, course to Zarya-7) → airlock → Zarya-7: the station log, the lone scavenger killed with the pistol (5 shots, no damage taken), body searched, map → extraction → results → Fedya's intro then his reaction to the log → First Salvage handed in → second raid → death → reserve slip (SP-5 loaded, sack) → immediate redeploy. No console errors. The harness teleported between rooms. |
| Controller only | Virtual DualSense (`054c` id, 18 buttons, mocked rumble): title → new game → premise (A advances, B skips) → locker, cockpit and airlock scenes with A → deploy → stick move and aim, R2 fire, □ reload → **touchpad opens and closes the map** → Create bag → Options pause. No key list left on screen after the first-raid hint. Found and fixed: mashing A through Fedya's lines reopened the nav console. |
| First contact on Tikhaya | Browser, operator standing in view and not fighting back, flashlight on: learning operators get ~0.5–2 s from being noticed to the first hit and 2.5–3.5 s under fire before death. Before the pass, an Obrez at 2–3 tiles killed 0.4 s after contact. |
| Aim assist | In the browser at 180 px (learning reach): stick 3.4° off → on the body; 5.7° and 8° off → pulled onto it; 11.5° → pulled part-way; 20° → no pull. |
| Death and recovery | Starter kit lost with the Obrez in the stash → SP-5 (loaded), 28 rounds, sack and a dressing issued onto the operator, slip shown. |
| Performance | Headless Chromium, software GL, Tikhaya with 9 enemies: simulation 0.46 ms/frame (p95 1.0), scene update 0.89 ms, draw submission 1.05 ms, heap 69 MB (the character pass measured 0.4–0.5, 0.8–1.0, 1.4 ms and 77–81 MB). |

**Not tested:**
- A physical controller; rumble on hardware.
- Browsers other than Chromium; frame rate on a real GPU.
- The new sounds by ear (channel nine, spin-ups, hatches, far steps, the "who's there?" and
  the radio squelch were balanced against the existing ambience, not listened to).
- How the new heads read to someone seeing them for the first time; judged from screenshots.

### Known issues and limits

- **Heads are placed, not animated.** They follow the LPC head's position every frame (bob,
  turn, the fall), but have one drawing per facing: no blinking or talking mouth.
- **Side views of some headgear are simple** (the ushanka and gas mask in profile).
- **Fedya's ember** is one pixel placed for the mouth of his seated pose; when he turns in his
  seat it sits at the side of his jaw.
- **Armour is still LPC art** (recoloured). It changes the torso and shoulder silhouette, but
  isn't redrawn in the game's own hand like the heads and packs.
- **The first raid's teaching is soft.** The coach and the gentle layout end after the first
  extraction or three raids; after that Tikhaya is Tikhaya.

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
  but they are cleaner than the painted tileset. (Addressed by the immersion pass: the heads,
  headgear and packs are now drawn for the game at adult proportions.)
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

## World, narrative, combat and extraction depth pass

The game worked; this pass was about making it make sense. The audit before any change found:

- **Works well (kept):** gunplay core, perception AI (sight, sound, shouts, flanking, cover,
  search), lighting as gameplay, deterministic generator, radio coach, lore threads, inventory.
- **Contradictions:** Fedya's "Parts for the Old Girl" asked for scrap and pipe that Fedya sells;
  "A Small Garden" wanted a power cell Shura sells; the prologue said the ship needed pump parts
  but the first contract only said "extract once"; Molot rewarded a helmet he also sold; the
  timeline drifted ("scrubbed in 2291", "every day for eleven years" vs "forty years ago", a lab
  clock at 03:14 vs the 00:00:00.000 of every other record); a "tsarina's crown" leaned on real
  history.
- **Missing:** site-specific objectives; any reason noise mattered after the fight; any zone
  structure beyond depth-scaled loot; any explanation of a death.

### What changed

| Area | Change |
|---|---|
| World | `docs/LORE_BIBLE.md`: premise, timeline (the Blackout, the Wait, the Leaving, the Salvage), how the economy works, why facilities aren't stripped (reserve cells hold the seals; when they fail, doors open: a fresh signal), why the crew are together, tone, dialogue classes. Drift fixed. |
| Contracts | 23 contracts, none asking for anything sold aboard (tested). New objective kinds: `retrieve` (a part fitted to a wall, placed by the generator while the contract is open), `task` (a job done at a site), `haul` (one heavy run), `read` (records). A named hostile (Gvozd) holds a deep room with posted guards while his contract is open. Every contract has a plain `intel` line on its card and the job sheet. Contract goods are never rolled, never sold, and go to whoever asked. Old saves' progress is repaired to fit. |
| First raid | Fedya's pump regulator is failing; Zarya-7 ran the same pump; the regulator is on the wall of its pump hall (mid-station), unbolting it is loud, and it counts once it's aboard. The radio talks the operator to it and then says "that's the job; everything after this is greed". |
| Dialogue | Crew intros, greetings, reactions and topics rewritten shorter and conversational; relationships and disagreements (Fedya/Molot on risk, Doc counting, Shura and Sirin, Lis and value); greetings and chatter that change with what's been done (the pump stops knocking). |
| Combat | Damage falloff (buckshot past 30% of reach, pistol/SMG past half, rifles none). Shots carry their source. |
| Noise | Loud things the operator does are remembered ("attention"): the next crew lands up to half a gap sooner and heads toward the last loud place. Shura says so, twice at most. |
| AI | Everyone returns to their station after searching; posted guards hold their room against shouts, chases and pursuit past a leash; the last one standing, hurt, falls back. |
| Levels | Zones (entry, working, restricted, deep) with room purposes weighted by zone, darker and better-guarded depths, clearance plates on restricted and deep rooms. |
| Environment | Three new scenes with notes (an unfinished card game with a chair on its side, a repair left half done, a packed suitcase under an evacuation order); three new original props. Sparse raid events: someone else's firefight, a real brown-out, a distant alarm, channel nine. |
| Extraction | The report says what the haul means in fuel at a trader's prices, and names the contract goods brought home. A death says who, where, how deep, and the one lesson that fits. The ship log says what the ship is waiting on. |

### Browser playtest (headless Chromium, scripted, this pass)

Driven through the real UI with the dev hooks. Where the harness teleported past a walk or
put down the hostiles around a pad, that's stated; nothing below was played by hand.

- **Raid A, first ever:** new game → intro → locker scene → Fedya's job on the intercom (all six
  lines seen) → course to Zarya-7 → airlock → deploy. The regulator was placed in the pump hall;
  the tracker, job sheet intel and map marker showed; holding E took it (bag + feed); extraction
  (harness cleared one hostile near the pad) → report named it → ship log switched to "waiting on
  The Pump" → hand-in dialogue → +900 KR, contract done. One run died on the pad first (harness
  teleported straight into a guarded deep room); the report correctly said who and where.
- **Raids C/E/G, greedy, death with loot, contract progress on failure:** Tikhaya with Gvozd, the
  relay and the heavy run open. Gvozd spawned in a deep workshop with posted guards; the relay was
  done (counted after death, ship log showed it ready); five valuables in the bag; shooting built
  attention; death report: "KILLED BY GVOZD'S TOZ-12 PUMP · WORKSHOP (DEEP SECTOR)" and "You had
  2,890 KR on you and kept going deeper." (The killing blow was applied by the harness: headless
  software GL runs the simulation at a fraction of real time.)
- **Raid D, early and modest:** one container, straight out; "Not a jump's worth of fuel. But
  you're alive, and that's the expensive part."; the heavy-run contract correctly didn't count.
- **Found and fixed during playtest:** posted guards could leave their room when coming out of
  cover or a retreat; a bag's row in the report showed its contents' value again; Fedya's first
  face-to-face line ignored the radio briefing; the map legend lacked the job marker.
- **Performance:** 0.6 ms of game code per frame (300 ticks averaged) in a Tikhaya facility with
  12 hostiles, open contracts and a raid event scheduled.

### Not verified

- Real-time feel (recoil, falloff, the emotional curve of a greedy raid): headless software GL
  runs far below real time, so nothing about feel was judged by playing.
- Clearance plates were not caught on screen on the seed checked (their placement competes with
  lamps and furniture for wall space); the code path and letters are tested.
- 60 FPS on target hardware (unchanged from the previous pass's limit).

### Rejected to avoid scope creep

Faction reputation, weapon mods, crafting, hunger, a relationship system, a campaign layer, new
destinations, internet asset packs (every new need was met by original ASCII art or existing
sprites), per-line dialogue metadata beyond a class on topics and chatter, and enemy vocal barks.
