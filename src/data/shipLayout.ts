import { TILE } from '../engine/config';
import { Tile, TileMap, type LightDef } from '../game/world/tilemap';
import type { CrewId } from './crew';

/**
 * The Lastochka, deck by deck. Hand-built: this is home, it should feel placed.
 *
 *            [COCKPIT]
 *   [TECH]  [COMMON ROOM]  [NOOK]
 *   [MED]   [ CARGO BAY ]  [ARMORY]
 *   [BUNKS]   [AIRLOCK]    [ENGINE]
 */

export const SHIP_W = 36;
export const SHIP_H = 28;

export interface ShipProp {
  sprite: string;
  /** Bottom-centre in world px. */
  x: number;
  y: number;
  /** Tiles it blocks. */
  solid?: [number, number][];
  /** Drawn flat on the floor (rugs), under actors. */
  floor?: boolean;
  /** Hung on a wall face: drawn over the wall, never blocks. */
  wall?: boolean;
  flip?: boolean;
  /** Gentle hover (drone). */
  bob?: boolean;
  /** Sits on top of furniture: drawn this many px above its base, sorted just in front. */
  lift?: number;
}

export type InteractKind = 'crew' | 'stash' | 'nav' | 'board' | 'airlock' | 'record';

export interface ShipInteractable {
  kind: InteractKind;
  crew?: CrewId;
  x: number;
  y: number;
  label: string;
}

export interface CrewStation {
  crew: CrewId;
  x: number;
  y: number;
  /** Faces right (sprites are drawn facing left). */
  faceRight?: boolean;
  anim: 'idle' | 'sit' | 'interact';
}

export interface ShipLayout {
  map: TileMap;
  props: ShipProp[];
  crew: CrewStation[];
  interactables: ShipInteractable[];
  spawn: { x: number; y: number };
  /** The cockpit is one big painted piece laid over the nose. */
  cockpit: { x: number; y: number };
  /** Airlock chamber floor, in tiles (hazard-striped). */
  airlock: { x: number; y: number; w: number; h: number };
  reactor: { x: number; y: number };
  /** Cables run along the deck (world px polylines). */
  cables: [number, number][][];
}

const px = (t: number) => t * TILE;
const cx = (t: number) => t * TILE + TILE / 2;

/**
 * @param upgrades installed ship work: the ship looks different as it improves.
 * @param story contracts handed in: the crew's corners fill up with what came of them.
 */
export function buildShip(upgrades: readonly string[] = [], story: readonly string[] = []): ShipLayout {
  const map = new TileMap(SHIP_W, SHIP_H);
  map.ambient = 0.4;

  const carve = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) map.set(x, y, Tile.Floor);
  };
  carve(18, 5, 21, 7); // cockpit
  carve(14, 8, 25, 13); // common room
  carve(14, 15, 25, 21); // cargo bay
  carve(18, 14, 21, 14); // common → cargo
  carve(18, 23, 21, 25); // airlock
  carve(5, 8, 12, 12); // tech den
  carve(13, 10, 13, 11);
  carve(5, 15, 12, 19); // med bay
  carve(13, 17, 13, 18);
  carve(5, 21, 12, 25); // quarters
  carve(8, 20, 9, 20);
  carve(27, 8, 33, 12); // smuggler's nook
  carve(26, 10, 26, 11);
  carve(27, 15, 34, 19); // armory
  carve(26, 17, 26, 18);
  carve(27, 21, 34, 26); // engine room
  carve(30, 20, 31, 20);

  // Named compartments (for the stencilled plates on their walls).
  const room = (kind: string, x0: number, y0: number, x1: number, y1: number) =>
    map.rooms.push({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, role: 'standard', depth: 0, kind });
  room('ship_common', 14, 8, 25, 13);
  room('ship_cargo', 14, 15, 25, 21);
  room('ship_tech', 5, 8, 12, 12);
  room('ship_med', 5, 15, 12, 19);
  room('ship_quarters', 5, 21, 12, 25);
  room('ship_nook', 27, 8, 33, 12);
  room('ship_armory', 27, 15, 34, 19);
  room('ship_engine', 27, 21, 34, 26);

  // Walls around everything walkable.
  for (let y = 0; y < SHIP_H; y++) {
    for (let x = 0; x < SHIP_W; x++) {
      if (map.get(x, y) !== Tile.Void) continue;
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) {
        for (let dx = -1; dx <= 1; dx++) if (map.get(x + dx, y + dy) === Tile.Floor) near = true;
      }
      if (near) map.set(x, y, Tile.Wall);
    }
  }

  // The airlock door.
  map.set(19, 22, Tile.Door);
  map.set(20, 22, Tile.Door);
  map.doors.push({ tiles: [{ tx: 19, ty: 22 }, { tx: 20, ty: 22 }], vertical: false });

  const props: ShipProp[] = [
    // --- Cockpit: the pilot's seat is part of the painted cockpit; block it.
    { sprite: '', x: 0, y: 0, solid: [[19, 5], [20, 5]] },

    // --- Common room
    { sprite: 'ship_console3', x: cx(15) + 16, y: px(9) + 4, solid: [[14, 8], [15, 8], [16, 8]] },
    { sprite: 'ship_window', x: px(24), y: px(8) - 2, wall: true },
    { sprite: 'ship_banner', x: cx(17), y: px(8) - 6, wall: true },
    { sprite: 'ship_couch', x: cx(15) + 8, y: px(14) - 2, solid: [[14, 13], [15, 13], [16, 13]] },
    { sprite: 'ship_table', x: px(24), y: px(13) + 2, solid: [[23, 12], [24, 12]] },
    { sprite: 'ship_plant', x: cx(25), y: px(10) },
    { sprite: 'ship_dartboard', x: cx(22), y: px(8) - 10, wall: true },
    { sprite: 'ship_bin', x: cx(14), y: px(11) + 4 },

    // --- Cargo bay: Fedya's corner on the left, your lockers on the right.
    { sprite: 'trade_table', x: px(16) + 4, y: px(19) + 4, floor: true },
    { sprite: 'trade_stall', x: cx(14) + 4, y: px(17), solid: [[14, 16]] },
    { sprite: 'trade_crates', x: cx(14) + 2, y: px(21) + 2, solid: [[14, 20]] },
    { sprite: 'trade_lamp', x: cx(17), y: px(17) - 2, solid: [[17, 16]] },
    { sprite: 'trade_box', x: cx(15), y: px(21) + 4, solid: [[15, 20]] },
    { sprite: 'ship_tall_locker', x: cx(23), y: px(16) + 2, solid: [[23, 15]] },
    { sprite: 'ship_tall_locker', x: cx(24), y: px(16) + 2, solid: [[24, 15]] },
    { sprite: 'ship_locker', x: cx(25), y: px(16) + 4, solid: [[25, 15]] },
    { sprite: 'ship_crate_y', x: cx(25), y: px(20) + 2, solid: [[25, 19]] },
    { sprite: 'ship_crate_g', x: cx(24), y: px(21) + 2, solid: [[24, 20]] },
    { sprite: 'barrel_red', x: cx(25), y: px(22), solid: [[25, 21]] },
    { sprite: 'ship_vent', x: cx(21) + 8, y: px(15) - 6, wall: true },
    { sprite: 'ship_poster4', x: cx(16), y: px(15) - 8, wall: true },

    // --- Tech den (Shura)
    { sprite: 'hack_rack', x: cx(5), y: px(9) + 2, solid: [[5, 8]] },
    { sprite: 'ship_rack_a', x: cx(6), y: px(9) + 2, solid: [[6, 8]] },
    { sprite: 'ship_server', x: cx(12), y: px(9) + 2, solid: [[12, 8]] },
    { sprite: 'ship_rack_b', x: cx(11), y: px(9) + 2, solid: [[11, 8]] },
    { sprite: 'hack_console', x: px(9), y: px(10) - 2, solid: [[8, 9]] },
    { sprite: 'hack_terminal', x: cx(5), y: px(12) + 2, solid: [[5, 11]] },
    { sprite: 'hack_server', x: cx(6), y: px(13), solid: [[6, 12]] },
    { sprite: 'hack_antenna', x: cx(12), y: px(13), solid: [[12, 12]] },
    { sprite: 'hack_drone', x: px(11), y: px(11), bob: true },
    { sprite: 'hack_box', x: cx(11), y: px(13) - 2 },
    { sprite: 'ship_poster2', x: cx(8), y: px(8) - 8, wall: true },

    // --- Med bay (Doc)
    { sprite: 'ship_bed', x: px(7), y: px(17) + 4, solid: [[5, 16], [6, 16], [7, 16]] },
    { sprite: 'med_iv', x: cx(8), y: px(17) - 4 },
    { sprite: 'med_monitor', x: cx(8), y: px(16) - 2, solid: [[8, 15]] },
    { sprite: 'med_cabinet', x: cx(11), y: px(16) + 2, solid: [[11, 15]] },
    { sprite: 'med_cabinet', x: cx(12), y: px(16) + 2, solid: [[12, 15]] },
    { sprite: 'med_crate', x: cx(12), y: px(20), solid: [[12, 19]] },
    { sprite: 'med_gurney', x: px(7), y: px(20) - 2, solid: [[6, 19]] },
    { sprite: 'med_stool', x: cx(10), y: px(19) - 4 },
    { sprite: 'med_kit', x: cx(5), y: px(20) - 2 },

    // --- Quarters (you)
    { sprite: 'ship_bunk', x: px(6) + 14, y: px(23) + 6, solid: [[5, 21], [6, 21], [7, 21], [5, 22], [6, 22], [7, 22]] },
    { sprite: 'ship_rug', x: px(10), y: px(25) - 4, floor: true },
    { sprite: 'ship_armchair', x: cx(11), y: px(24) - 6, solid: [[11, 23]] },
    { sprite: 'ship_tv', x: cx(12), y: px(22) + 2, solid: [[12, 21]] },
    { sprite: 'ship_locker_s', x: cx(9), y: px(22), solid: [[9, 21]] },
    { sprite: 'ship_poster', x: cx(10), y: px(21) - 8, wall: true },
    { sprite: 'ship_poster3', x: cx(11), y: px(21) - 10, wall: true },
    { sprite: 'ship_plant3', x: cx(5), y: px(26) - 2 },
    { sprite: 'ship_bucket', x: cx(12), y: px(26) - 2 },

    // --- Smuggler's nook (Lis)
    { sprite: 'ship_banner', x: cx(30), y: px(8) - 6, wall: true },
    { sprite: 'smug_crate', x: cx(27) + 8, y: px(10), solid: [[27, 9], [28, 9]] },
    { sprite: 'smug_chest', x: cx(33), y: px(10), solid: [[33, 9]] },
    { sprite: 'smug_goods', x: px(32), y: px(13) - 2, solid: [[31, 12], [32, 12]] },
    { sprite: 'smug_box', x: cx(27), y: px(13) - 2, solid: [[27, 12]] },
    { sprite: 'smug_bottles', x: cx(33), y: px(12) - 4 },
    { sprite: 'ship_chair2', x: cx(29), y: px(12) - 2 },

    // --- Armory (Molot)
    { sprite: 'ship_gunrack', x: px(29) + 8, y: px(16) + 2, solid: [[27, 15], [28, 15], [29, 15]] },
    { sprite: 'ship_workbench', x: px(33), y: px(17), solid: [[32, 15], [33, 15], [32, 16], [33, 16]] },
    { sprite: 'ship_suit', x: cx(34), y: px(17) - 2, solid: [[34, 16]] },
    { sprite: 'merc_tripod', x: cx(28), y: px(20) - 2, solid: [[27, 19], [28, 19]] },
    { sprite: 'merc_case', x: px(33), y: px(20) - 2, solid: [[32, 19], [33, 19]] },
    { sprite: 'merc_ammo', x: cx(34), y: px(20) - 2, solid: [[34, 19]] },
    { sprite: 'merc_ammo2', x: cx(31), y: px(16) - 4 },

    // --- Engine room
    { sprite: 'ship_capsule', x: cx(28), y: px(24) + 4, solid: [[27, 22], [28, 22], [27, 23], [28, 23]] },
    { sprite: 'ship_reactor', x: px(31), y: px(24), solid: [[30, 22], [31, 22], [30, 23], [31, 23]] },
    { sprite: 'ship_tank', x: px(34) - 4, y: px(24) + 2, solid: [[33, 22], [34, 22], [33, 23]] },
    { sprite: 'ship_machine', x: px(29), y: px(27) - 2, solid: [[27, 26], [28, 26]] },
    { sprite: 'ship_pipe_v', x: cx(34), y: px(27) - 2, solid: [[34, 26]] },
    { sprite: 'ship_toolbox', x: cx(32), y: px(27) - 4 },
    { sprite: 'ship_vent2', x: cx(32) + 6, y: px(21) - 8, wall: true },
    { sprite: 'ship_robot', x: cx(33), y: px(26) - 4 },
  ];

  // --- Lived in: the small stuff people leave around.
  props.push(
    // Common room: last night's table.
    { sprite: 'deco_vodka', x: px(24) - 9, y: px(13) + 3, lift: 27 },
    { sprite: 'deco_rations', x: px(24) + 7, y: px(13) + 3, lift: 25 },
    { sprite: 'deco_cigs', x: px(24) - 1, y: px(13) + 4, lift: 24 },
    // Fedya: his radio, his compass, his smokes.
    { sprite: 'deco_radio', x: px(17) + 10, y: px(19) + 6 },
    { sprite: 'deco_compass', x: px(15) - 2, y: px(19) + 6 },
    { sprite: 'deco_milk', x: px(17) + 2, y: px(20) + 4 },
    // Shura: gadgets everywhere.
    { sprite: 'deco_tablet', x: px(10) + 6, y: px(12) + 6 },
    { sprite: 'deco_camera', x: px(7), y: px(12) + 8 },
    { sprite: 'deco_multitool', x: px(11) + 4, y: px(10) + 6 },
    // Doc: jars, bottles, and a plant she talks to.
    { sprite: 'deco_specimen', x: cx(12), y: px(20), lift: 16 },
    { sprite: 'deco_reagent', x: cx(10) + 2, y: px(16) + 6 },
    { sprite: 'deco_antibiotics', x: cx(12) - 7, y: px(18) + 8 },
    { sprite: 'ship_plant2', x: cx(10) + 10, y: px(20) + 2 },
    // Your corner: dinner in front of the TV.
    { sprite: 'deco_stew', x: cx(10) + 6, y: px(24) + 4 },
    { sprite: 'deco_vodka', x: cx(10) + 12, y: px(24) + 2 },
    // Lis: things that are definitely hers.
    { sprite: 'deco_jewelbox', x: cx(31), y: px(10) + 4 },
    { sprite: 'deco_idol', x: cx(33), y: px(10), lift: 22 },
    { sprite: 'deco_cigs', x: cx(29) + 8, y: px(12) + 2 },
    // Molot: tools of the trade, and a picture of somewhere green.
    { sprite: 'deco_wrench', x: cx(31) + 4, y: px(18) + 6 },
    { sprite: 'deco_geiger', x: cx(27) + 6, y: px(18) + 2 },
    { sprite: 'deco_landscape', x: cx(34) - 2, y: px(15) - 12, wall: true },
    // Engine room: patched and making do.
    { sprite: 'deco_oxygen', x: cx(33) + 8, y: px(26) + 2 },
    { sprite: 'deco_tape', x: cx(30), y: px(26) + 6 },
  );

  // --- What came of their stories.
  const done = (q: string) => story.includes(q);
  if (done('fedya_tomatoes')) props.push({ sprite: 'ship_plant', x: px(14) + 6, y: px(19) + 2 }, { sprite: 'ship_plant3', x: px(14) + 18, y: px(19) + 4 });
  if (done('doc_growth')) props.push({ sprite: 'deco_fungus', x: cx(12) - 10, y: px(20) + 2 });
  if (done('doc_egg')) props.push({ sprite: 'deco_egg', x: cx(11), y: px(19) + 6 });
  if (done('molot_garrison')) props.push({ sprite: 'ship_banner', x: px(31) + 4, y: px(15) - 6, wall: true });
  if (done('shura_channel')) props.push({ sprite: 'ship_tv', x: cx(7), y: px(10) - 2, solid: [[7, 9]] });
  if (done('lis_shiny')) props.push({ sprite: 'deco_chalice', x: cx(27), y: px(13) - 2, lift: 18 });
  if (done('lis_crown')) props.push({ sprite: 'deco_crown', x: cx(33), y: px(10), lift: 24 });
  // Things brought home that somebody wanted kept.
  if (done('memento_drawing')) props.push({ sprite: 'deco_drawing', x: cx(10) + 6, y: px(15) - 14, wall: true });
  if (done('memento_clock')) props.push({ sprite: 'deco_clock', x: cx(6), y: px(9) - 14, wall: true });

  // --- Ship work shows.
  const has = (u: string) => upgrades.includes(u);
  if (has('stash1')) {
    props.push(
      { sprite: 'ship_locker', x: cx(25), y: px(17) + 4, solid: [[25, 16]] },
      { sprite: 'ship_cabinet_s', x: cx(25), y: px(18) + 4, solid: [[25, 17]] },
    );
  }
  if (has('stash2')) {
    props.push(
      { sprite: 'ship_crate_w', x: cx(22), y: px(22) + 2, solid: [[22, 21]] },
      { sprite: 'ship_crate_o', x: cx(23), y: px(22) + 2, solid: [[23, 21]] },
      { sprite: 'ship_shelf', x: cx(21) + 8, y: px(15) - 6, wall: true },
    );
  }
  if (has('workbench')) {
    props.push({ sprite: 'ship_toolbox', x: cx(31), y: px(20) - 4 }, { sprite: 'ship_machine', x: px(29), y: px(20) - 2, solid: [[29, 19]] });
  }
  if (has('scanner')) {
    props.push({ sprite: 'ship_radar', x: px(10), y: px(13) + 2, solid: [[9, 12], [10, 12]] });
  }
  if (has('lounge')) {
    props.push(
      { sprite: 'ship_rug', x: px(24), y: px(13) + 8, floor: true },
      { sprite: 'ship_armchair', x: cx(25), y: px(13) - 2, solid: [[25, 12]] },
      { sprite: 'ship_chair3', x: cx(22), y: px(13) - 4 },
    );
  }

  for (const p of props) for (const [x, y] of p.solid ?? []) map.set(x, y, Tile.Prop);

  const L = (x: number, y: number, color: number, radius: number, intensity: number, flicker = false): LightDef =>
    ({ x, y, color, radius, intensity, flicker });
  map.lights.push(
    L(px(20), px(6), 0x7dffb0, 150, 0.55), // cockpit consoles
    L(px(17), px(8) + 6, 0xffc58a, 210, 0.7),
    L(px(23), px(8) + 6, 0xffc58a, 210, 0.7),
    L(px(20), px(15) + 6, 0xffb46b, 240, 0.75), // cargo
    L(px(16), px(18), 0xffa84a, 110, 0.55), // Fedya's lamp
    L(px(20), px(23) + 8, 0xff5a3a, 120, 0.55), // airlock
    L(px(9), px(9) + 6, 0x46d4d8, 200, 0.7), // tech den
    L(px(9), px(15) + 6, 0xe8f0ff, 210, 0.75), // med bay
    L(px(9), px(21) + 6, 0xffb070, 190, 0.55, true), // quarters: a tired bulb
    L(px(30), px(8) + 6, 0xc83a2a, 170, 0.6), // nook
    L(px(31), px(15) + 6, 0xffc07a, 210, 0.72), // armory
    // The reactor glows orange and sputters until it's overhauled.
    has('reactor') ? L(px(31), px(23), 0x6ad8ff, 210, 0.85) : L(px(31), px(23), 0xff8a2a, 200, 0.85, true),
  );
  if (has('scanner')) map.lights.push(L(px(10), px(12), 0x7dffb0, 120, 0.5));
  if (has('workbench')) map.lights.push(L(px(33), px(16), 0xfff0d0, 120, 0.6));

  const crew: CrewStation[] = [
    { crew: 'trader', x: px(16) + 6, y: px(19) - 2, anim: 'sit' },
    { crew: 'hacker', x: px(9), y: px(11) - 4, anim: 'sit' },
    { crew: 'medic', x: px(9) + 8, y: px(18), anim: 'interact' },
    { crew: 'smuggler', x: px(30), y: px(11) + 4, anim: 'idle' },
    { crew: 'merc', x: px(30) + 8, y: px(18) + 4, anim: 'idle' },
  ];

  const interactables: ShipInteractable[] = [
    ...crew.map((c) => ({ kind: 'crew' as const, crew: c.crew, x: c.x, y: c.y + 6, label: '' })),
    { kind: 'stash', x: px(24), y: px(17), label: 'OPEN STASH LOCKERS' },
    { kind: 'nav', x: px(20), y: px(6) + 16, label: 'PILOT\'S SEAT: NAVIGATION' },
    { kind: 'board', x: cx(15) + 16, y: px(9) + 16, label: 'OPERATIONS BOARD: CONTRACTS' },
    { kind: 'airlock', x: px(20), y: px(25), label: 'OUTER HATCH: DEPLOY' },
    { kind: 'record', x: px(8) + 16, y: px(23) + 10, label: 'YOUR BUNK: SERVICE RECORD' },
  ];

  return {
    map,
    props: props.filter((p) => p.sprite),
    crew,
    interactables,
    spawn: { x: px(9), y: px(24) },
    cockpit: { x: px(20), y: px(8) },
    airlock: { x: 18, y: 23, w: 4, h: 3 },
    reactor: { x: px(31), y: px(23) },
    cables: [
      // Shura's rig, spliced into everything.
      [[px(9) - 4, px(10) + 2], [px(8), px(11) + 6], [px(6) + 4, px(11) + 10], [px(5) + 18, px(12) + 4]],
      [[px(9) + 6, px(10) + 2], [px(10) + 4, px(11) + 4], [px(11) + 12, px(11) + 10], [px(12) + 10, px(12) + 6]],
      // Engine room feeds, patched with tape.
      [[px(31) - 6, px(24) + 2], [px(31) + 2, px(25) + 6], [px(33) + 6, px(25) + 10], [px(34) + 10, px(26) + 4]],
      [[px(28) + 14, px(24) + 6], [px(29) + 10, px(25) + 12], [px(30) + 2, px(26) - 2]],
    ],
  };
}

/**
 * What the ship's corners show: contracts handed in, and a few things from down there
 * that somebody asked to keep (the child's drawing in the medbay, a stopped clock over
 * Shura's desk).
 */
export function shipStory(p: { quests: Record<string, { status: string }>; flags: Record<string, boolean> }): string[] {
  const out = Object.entries(p.quests).filter(([, q]) => q.status === 'turnedIn').map(([id]) => id);
  if (p.flags.react_note_child) out.push('memento_drawing');
  if (p.flags.react_clocks) out.push('memento_clock');
  return out;
}
