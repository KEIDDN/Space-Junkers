import { TILE } from '../../engine/config';

export const Tile = {
  Void: 0,
  Floor: 1,
  Wall: 2,
  /** Solid prop that blocks movement and bullets (crates, barrels, containers). */
  Prop: 3,
  /** Sliding door. Solid while closed. */
  Door: 4,
} as const;
export type Tile = (typeof Tile)[keyof typeof Tile];

export interface Spawn {
  kind: string;
  x: number;
  y: number;
  /** Optional patrol route (world positions). */
  patrol?: { x: number; y: number }[];
}

export interface PropPlacement {
  sprite: string;
  /** Bottom-centre, world px. */
  x: number;
  y: number;
  /** 'floor': flat decals under actors. 'wall': hung on a wall face. Default: depth-sorted object. */
  layer?: 'floor' | 'wall';
  flip?: boolean;
  /** Emissive tint for glowing props (reactor cores). */
  tint?: number;
}

/** Something to read on a terminal screen. */
export interface TerminalPlacement {
  tx: number;
  ty: number;
  /** Index into the lore pool for this theme. */
  entry: number;
}

/** A double door spanning two tiles. `vertical` = sits in a vertical wall (you pass left/right). */
export interface DoorDef {
  tiles: [{ tx: number; ty: number }, { tx: number; ty: number }];
  vertical: boolean;
  /** Security door: stays shut until someone swipes a keycard. */
  locked?: boolean;
}

/**
 * A way out. The shuttle pad always works but sounds an alarm while you wait;
 * the maintenance lift is quiet and quick, but only once its breaker is thrown.
 */
export type ExitKind = 'pad' | 'lift';

export interface ExitDef {
  kind: ExitKind;
  /** Zone in tiles. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Floor tile in front of the breaker panel that powers this exit. */
  breaker?: { tx: number; ty: number };
}

export interface LightDef {
  x: number;
  y: number;
  color: number;
  radius: number;
  intensity: number;
  flicker: boolean;
  /** Draw a lamp housing on the wall here. */
  fixture?: boolean;
}

export interface ContainerPlacement {
  type: string;
  tx: number;
  ty: number;
  /** 0..1 danger of the room, improves loot. */
  risk: number;
  /** Lies on the floor (remains): walkable, drawn under actors. */
  flat?: boolean;
}

export type RoomRole = 'start' | 'standard' | 'loot' | 'vault' | 'extraction';

export interface Room {
  /** Interior rect in tiles. */
  x: number;
  y: number;
  w: number;
  h: number;
  role: RoomRole;
  depth: number;
  /** What the room was for (storage, barracks...). */
  kind?: string;
}

/**
 * Grid map. The simulation only cares about tile solidity; how tiles look is decided
 * by the renderer. Positions are world pixels, tile coords are integers.
 */
export class TileMap {
  readonly tiles: Uint8Array;
  /** Door open state per tile (1 = open). Only meaningful on Door tiles. */
  readonly doorOpen: Uint8Array;
  /** Door tiles that are locked (1). Locked doors are not passable for route planning. */
  readonly doorLocked: Uint8Array;
  readonly spawns: Spawn[] = [];
  readonly props: PropPlacement[] = [];
  readonly doors: DoorDef[] = [];
  readonly lights: LightDef[] = [];
  readonly containers: ContainerPlacement[] = [];
  readonly rooms: Room[] = [];
  readonly terminals: TerminalPlacement[] = [];
  readonly exits: ExitDef[] = [];
  /** Ambient light level 0..1 (1 = fully lit, no darkness system). */
  ambient = 1;
  seed = 0;

  constructor(readonly width: number, readonly height: number) {
    this.tiles = new Uint8Array(width * height);
    this.doorOpen = new Uint8Array(width * height);
    this.doorLocked = new Uint8Array(width * height);
  }

  /** The shuttle pad (the exit every facility has). */
  get extraction(): ExitDef | null {
    return this.exits.find((e) => e.kind === 'pad') ?? null;
  }

  get pixelWidth(): number {
    return this.width * TILE;
  }
  get pixelHeight(): number {
    return this.height * TILE;
  }

  get(tx: number, ty: number): Tile {
    if (tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) return Tile.Void;
    return this.tiles[ty * this.width + tx] as Tile;
  }

  set(tx: number, ty: number, t: Tile): void {
    this.tiles[ty * this.width + tx] = t;
  }

  /** Blocks movement, bullets and sight. Void counts as solid so nothing escapes the map. */
  isSolid(tx: number, ty: number): boolean {
    const t = this.get(tx, ty);
    if (t === Tile.Floor) return false;
    if (t === Tile.Door) return this.doorOpen[ty * this.width + tx] === 0;
    return true;
  }

  isSolidAt(x: number, y: number): boolean {
    return this.isSolid(Math.floor(x / TILE), Math.floor(y / TILE));
  }

  /** Walkable for route planning: floors and doors (open or not, actors open them). */
  isPassable(tx: number, ty: number): boolean {
    const t = this.get(tx, ty);
    return t === Tile.Floor || (t === Tile.Door && this.doorLocked[ty * this.width + tx] === 0);
  }

  setDoorLocked(tx: number, ty: number, locked: boolean): void {
    this.doorLocked[ty * this.width + tx] = locked ? 1 : 0;
  }

  setDoorOpen(tx: number, ty: number, open: boolean): void {
    this.doorOpen[ty * this.width + tx] = open ? 1 : 0;
  }

  /** The exit zone containing a world position, if any. */
  exitAt(x: number, y: number): ExitDef | null {
    const tx = x / TILE;
    const ty = y / TILE;
    return this.exits.find((e) => tx >= e.x && tx < e.x + e.w && ty >= e.y && ty < e.y + e.h) ?? null;
  }

  inExtraction(x: number, y: number): boolean {
    return this.exitAt(x, y) !== null;
  }
}

const PROP_SPRITES: Record<string, string[]> = {
  c: ['crate_gray', 'crate_pale', 'crate_green', 'crate_orange'],
  b: ['barrel_gray', 'barrel_red', 'barrel_blue'],
};

/**
 * Build a map from an ASCII layout.
 *   #  wall        .  floor       (space) void
 *   c  crate       b  barrel
 *   P  player spawn   S  scavenger spawn
 */
export function mapFromAscii(rows: string[]): TileMap {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const map = new TileMap(w, h);
  let propIndex = 0;
  for (let ty = 0; ty < h; ty++) {
    for (let tx = 0; tx < w; tx++) {
      const ch = rows[ty][tx] ?? ' ';
      const cx = tx * TILE + TILE / 2;
      const cy = ty * TILE + TILE / 2;
      switch (ch) {
        case '#':
          map.set(tx, ty, Tile.Wall);
          break;
        case '.':
          map.set(tx, ty, Tile.Floor);
          break;
        case 'c':
        case 'b': {
          map.set(tx, ty, Tile.Prop);
          const options = PROP_SPRITES[ch];
          map.props.push({ sprite: options[propIndex++ % options.length], x: tx * TILE + TILE / 2, y: ty * TILE + TILE });
          break;
        }
        case 'P':
          map.set(tx, ty, Tile.Floor);
          map.spawns.push({ kind: 'player', x: cx, y: cy });
          break;
        case 'S':
          map.set(tx, ty, Tile.Floor);
          map.spawns.push({ kind: 'scavenger', x: cx, y: cy });
          break;
        default:
          map.set(tx, ty, Tile.Void);
      }
    }
  }
  return map;
}
