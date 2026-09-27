import { Container, Graphics, Sprite } from 'pixi.js';
import { tex } from '../../engine/assets';
import { TILE } from '../../engine/config';
import { Tile, type TileMap } from '../world/tilemap';

/** Weighted floor variety: mostly plain deck, occasional plates and grates. */
const FLOOR_VARIANTS: [string, number][] = [
  ['floor_a', 46], ['floor_b', 40], ['floor_c', 8], ['floor_plate', 3], ['floor_grate', 3],
];
const FLOOR_TOTAL = FLOOR_VARIANTS.reduce((n, [, w]) => n + w, 0);
const RIM = 0x4a423a;

/**
 * Static ground layer (floors, walls, contact shadows). Built once per map.
 * Props are returned separately because they must depth-sort with actors.
 */
export function buildMapView(map: TileMap): { ground: Container; props: Sprite[] } {
  const ground = new Container();
  const shade = new Graphics();
  const rims = new Graphics();

  for (let ty = 0; ty < map.height; ty++) {
    for (let tx = 0; tx < map.width; tx++) {
      const t = map.get(tx, ty);
      if (t === Tile.Void) continue;
      const x = tx * TILE;
      const y = ty * TILE;
      if (t === Tile.Wall) {
        const faceVisible = map.get(tx, ty + 1) === Tile.Floor || map.get(tx, ty + 1) === Tile.Prop;
        const s = new Sprite(tex(faceVisible ? 'wall_face' : 'wall_top'));
        s.position.set(x, y);
        ground.addChild(s);
        if (!faceVisible) {
          // Lit rim where the wall cap meets open space.
          const open = (t: number) => t === Tile.Floor || t === Tile.Prop;
          if (open(map.get(tx, ty - 1))) rims.rect(x, y, TILE, 1).fill({ color: RIM });
          if (open(map.get(tx - 1, ty))) rims.rect(x, y, 1, TILE).fill({ color: RIM });
          if (open(map.get(tx + 1, ty))) rims.rect(x + TILE - 1, y, 1, TILE).fill({ color: RIM });
        }
        continue;
      }
      // Floor (also under props)
      const s = new Sprite(tex(pickFloor(hash(tx, ty))));
      s.position.set(x, y);
      ground.addChild(s);
      // Contact shadow under walls to the north and west gives the room depth.
      if (map.get(tx, ty - 1) === Tile.Wall) shade.rect(x, y, TILE, 5).fill({ color: 0x000000, alpha: 0.45 });
      if (map.get(tx - 1, ty) === Tile.Wall) shade.rect(x, y, 3, TILE).fill({ color: 0x000000, alpha: 0.3 });
    }
  }
  ground.addChild(shade, rims);

  const props = map.props.map((p) => {
    const s = new Sprite(tex(p.sprite));
    s.anchor.set(0.5, 1);
    s.position.set(p.tx * TILE + TILE / 2, p.ty * TILE + TILE);
    s.zIndex = s.y;
    return s;
  });
  return { ground, props };
}

function pickFloor(h: number): string {
  let r = h % FLOOR_TOTAL;
  for (const [name, w] of FLOOR_VARIANTS) {
    if (r < w) return name;
    r -= w;
  }
  return FLOOR_VARIANTS[0][0];
}

function hash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return Math.abs(h ^ (h >>> 16));
}
