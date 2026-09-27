import { Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import { tex } from '../../engine/assets';
import { TILE } from '../../engine/config';
import { Tile, type TileMap } from '../world/tilemap';

/** Weighted floor plates (each covers 2×2 tiles): mostly plain deck, some plates and grates. */
export type FloorStyle = [string, number][];

export const FLOOR_DECK: FloorStyle = [['floor_a', 44], ['floor_b', 38], ['floor_c', 10], ['floor_plate', 4], ['floor_grate', 4]];

/** How the walls and floor of a map look. */
export interface MapLook {
  floor: FloorStyle;
  /** Multiply tint for floor plates (theme colour). */
  floorTint: number;
  /** Wall face sprite. */
  wall: string;
  /** Tint for wall faces. */
  wallTint: number;
  /** Colour of the rust trim along wall caps. */
  trim: number;
}

export const DEFAULT_LOOK: MapLook = { floor: FLOOR_DECK, floorTint: 0xffffff, wall: 'wall_face_a', wallTint: 0xffffff, trim: 0x6e2a1f };

const CAP = 0x16130f;
const CAP_EDGE = 0x0a0908;
/** How far a wall face rises above its tile (px). */
const FACE_RISE = 10;

const quarterCache = new Map<string, Texture[]>();

/** The four 32×32 quarters of a 64×64 floor plate. */
function quarters(name: string): Texture[] {
  let q = quarterCache.get(name);
  if (q) return q;
  const base = tex(`${name}_2x`);
  q = [0, 1, 2, 3].map((i) => new Texture({
    source: base.source,
    frame: new Rectangle(base.frame.x + (i % 2) * TILE, base.frame.y + Math.floor(i / 2) * TILE, TILE, TILE),
  }));
  quarterCache.set(name, q);
  return q;
}

function isOpen(t: Tile): boolean {
  return t === Tile.Floor || t === Tile.Prop || t === Tile.Door;
}

/**
 * Static ground layer (floors, walls, contact shadows). Built once per map.
 * Walls in front of a floor show their face, rising a little above the tile for depth;
 * other walls show a dark cap, trimmed in rust where it meets open space.
 * Props are returned separately because they must depth-sort with actors.
 */
export function buildMapView(map: TileMap, look: MapLook = DEFAULT_LOOK): { ground: Container; props: Sprite[] } {
  const ground = new Container();
  const floors = new Container();
  const shade = new Graphics();
  const caps = new Graphics();
  const faces = new Container();
  const total = look.floor.reduce((n, [, w]) => n + w, 0);

  for (let ty = 0; ty < map.height; ty++) {
    for (let tx = 0; tx < map.width; tx++) {
      const t = map.get(tx, ty);
      if (t === Tile.Void) continue;
      const x = tx * TILE;
      const y = ty * TILE;
      if (t === Tile.Wall) {
        const face = isOpen(map.get(tx, ty + 1));
        if (face) {
          const s = new Sprite(tex(look.wall));
          s.anchor.set(0, 1);
          s.position.set(x, y + TILE);
          if (look.wallTint !== 0xffffff) s.tint = look.wallTint;
          faces.addChild(s);
          // Where the face row ends, darken the edge so it reads as a corner.
          if (!isFaceWall(map, tx - 1, ty)) caps.rect(x, y - FACE_RISE, 2, TILE + FACE_RISE).fill({ color: CAP_EDGE, alpha: 0.8 });
          if (!isFaceWall(map, tx + 1, ty)) caps.rect(x + TILE - 2, y - FACE_RISE, 2, TILE + FACE_RISE).fill({ color: CAP_EDGE, alpha: 0.8 });
          continue;
        }
        caps.rect(x, y, TILE, TILE).fill({ color: CAP });
        // Subtle panel seams on the cap.
        if ((tx + ty) % 3 === 0) caps.rect(x + 3, y + 3, TILE - 6, 1).fill({ color: 0x221d18 });
        const trim = look.trim;
        if (isOpen(map.get(tx, ty - 1))) {
          caps.rect(x, y, TILE, 3).fill({ color: trim });
          caps.rect(x, y, TILE, 1).fill({ color: lighten(trim) });
        }
        if (isOpen(map.get(tx - 1, ty))) caps.rect(x, y, 3, TILE).fill({ color: trim });
        if (isOpen(map.get(tx + 1, ty))) caps.rect(x + TILE - 3, y, 3, TILE).fill({ color: trim });
        continue;
      }
      // Floor (also under props and doors): one quarter of a 2×2 plate.
      const plate = pickFloor(look.floor, total, hash(tx >> 1, ty >> 1));
      const s = new Sprite(quarters(plate)[(tx & 1) + (ty & 1) * 2]);
      s.position.set(x, y);
      if (look.floorTint !== 0xffffff) s.tint = look.floorTint;
      floors.addChild(s);
      // Contact shadow under walls to the north and west gives the room depth.
      if (map.get(tx, ty - 1) === Tile.Wall) {
        shade.rect(x, y, TILE, 4).fill({ color: 0x000000, alpha: 0.5 });
        shade.rect(x, y + 4, TILE, 4).fill({ color: 0x000000, alpha: 0.22 });
      }
      if (map.get(tx - 1, ty) === Tile.Wall) shade.rect(x, y, 3, TILE).fill({ color: 0x000000, alpha: 0.3 });
      if (map.get(tx + 1, ty) === Tile.Wall) shade.rect(x + TILE - 2, y, 2, TILE).fill({ color: 0x000000, alpha: 0.2 });
    }
  }
  const floorDecor = new Container();
  const wallDecor = new Container();
  ground.addChild(floors, floorDecor, shade, caps, faces, wallDecor);

  // Lamp housings on the wall above each fixture light.
  const lamps = new Graphics();
  for (const l of map.lights) {
    if (!l.fixture) continue;
    const x = Math.round(l.x);
    const y = Math.floor(l.y / TILE) * TILE;
    lamps.rect(x - 1, y - 18, 2, 4).fill({ color: 0x0c0b0a });
    lamps.rect(x - 8, y - 14, 16, 6).fill({ color: 0x1a1612 });
    lamps.rect(x - 8, y - 14, 16, 1).fill({ color: 0x3a342c });
    lamps.rect(x - 6, y - 11, 12, 2).fill({ color: lighten(lighten(l.color)) });
  }
  wallDecor.addChild(lamps);

  const props: Sprite[] = [];
  for (const p of map.props) {
    const s = new Sprite(tex(p.sprite));
    s.anchor.set(0.5, 1);
    s.position.set(Math.round(p.x), Math.round(p.y));
    if (p.flip) s.scale.x = -1;
    if (p.tint !== undefined) s.tint = p.tint;
    if (p.layer === 'floor') floorDecor.addChild(s);
    else if (p.layer === 'wall') wallDecor.addChild(s);
    else {
      s.zIndex = s.y;
      props.push(s);
    }
  }
  return { ground, props };
}

function isFaceWall(map: TileMap, tx: number, ty: number): boolean {
  return map.get(tx, ty) === Tile.Wall && isOpen(map.get(tx, ty + 1));
}

function lighten(c: number): number {
  const r = Math.min(255, ((c >> 16) & 255) + 40);
  const g = Math.min(255, ((c >> 8) & 255) + 22);
  const b = Math.min(255, (c & 255) + 14);
  return (r << 16) | (g << 8) | b;
}

function pickFloor(style: FloorStyle, total: number, h: number): string {
  let r = h % total;
  for (const [name, w] of style) {
    if (r < w) return name;
    r -= w;
  }
  return style[0][0];
}

function hash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return Math.abs(h ^ (h >>> 16));
}
