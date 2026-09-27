import type { FloorStyle } from '../game/render/mapView';
import type { ItemCategory } from './items';

/**
 * How a world's facilities look and what they're for. The generator picks room purposes
 * from `rooms`, the renderer takes the palette, the loot tables take `loot`.
 */

export type RoomKind =
  | 'storage' | 'barracks' | 'office' | 'servers' | 'workshop' | 'medbay' | 'mess' | 'reactor' | 'armory';

export interface Theme {
  id: string;
  /** Facility names, for the HUD. */
  names: string[];
  floor: FloorStyle;
  floorTint: number;
  /** Wall face sprite (palette variant). */
  wall: string;
  wallTint: number;
  trim: number;
  ambient: number;
  /** Lamp colours: ordinary rooms, the landing zone, the vault, the extraction. */
  light: { room: number; start: number; vault: number; extraction: number };
  rooms: Partial<Record<RoomKind, number>>;
  loot: Partial<Record<ItemCategory, number>>;
  /** Scattered small props. */
  clutter: string[];
}

const DECK: FloorStyle = [['floor_a', 44], ['floor_b', 38], ['floor_c', 10], ['floor_plate', 4], ['floor_grate', 4]];
const GRATE: FloorStyle = [['floor_grate', 30], ['floor_b', 30], ['floor_a', 25], ['floor_plate', 15]];
const CLEAN: FloorStyle = [['floor_plate', 40], ['floor_a', 35], ['floor_c', 25]];

export const THEMES: Record<string, Theme> = {
  tikhaya: {
    id: 'tikhaya', names: ['KOMBINAT-3 MACHINE WORKS', 'TRACTOR PLANT 9', 'ORE MILL "RASSVET"', 'DEPOT 41'],
    floor: DECK, floorTint: 0xffffff, wall: 'wall_face_a', wallTint: 0xffffff, trim: 0x6e2a1f, ambient: 0.13,
    light: { room: 0xffb46b, start: 0xcfe0ff, vault: 0xff3a2a, extraction: 0x7dff9a },
    rooms: { storage: 3, workshop: 3, mess: 1, barracks: 1, office: 1, reactor: 1, medbay: 1 },
    loot: { scrap: 1.4, tools: 1.5, electronics: 1.2, food: 1.2 },
    clutter: ['barrel_gray', 'barrel_red', 'crate_gray', 'crate_pale', 'ship_bucket', 'ship_bin'],
  },
  merzlota: {
    id: 'merzlota', names: ['SHAFT 9 PUMPING STATION', 'DEEP BORE "HOLOD"', 'CRYO REFINERY 2', 'MINER\'S HALL 6'],
    floor: GRATE, floorTint: 0xc8d8ee, wall: 'wall_face_a_ice', wallTint: 0xffffff, trim: 0x3e5a72, ambient: 0.12,
    light: { room: 0xcfe8ff, start: 0xffe2b0, vault: 0xff3a2a, extraction: 0x7dff9a },
    rooms: { storage: 3, workshop: 2, reactor: 2, barracks: 2, medbay: 1, mess: 1 },
    loot: { minerals: 2, fuel: 1.6, scrap: 1.1, tools: 1.2 },
    clutter: ['barrel_blue', 'barrel_gray', 'crate_gray', 'ship_crate_g', 'ship_bucket'],
  },
  krasnaya: {
    id: 'krasnaya', names: ['GARRISON DEPOT 4', 'FORWARD BASE "ZARYA"', 'ARSENAL 17', 'SIGNAL POST 2'],
    floor: DECK, floorTint: 0xf0cdb0, wall: 'wall_face_a_ochre', wallTint: 0xffffff, trim: 0x8a4a1e, ambient: 0.12,
    light: { room: 0xffd8b0, start: 0xcfe0ff, vault: 0xff3a2a, extraction: 0x7dff9a },
    rooms: { armory: 3, barracks: 3, storage: 2, office: 1, medbay: 1, mess: 1 },
    loot: { weapons: 2, ammo: 2, gear: 1.8, documents: 1.5, medical: 1.2 },
    clutter: ['crate_green', 'crate_orange', 'barrel_red', 'merc_ammo', 'ship_crate_y'],
  },
  kombinat: {
    id: 'kombinat', names: ['RESEARCH WING C', 'DATA VAULT "ORBITA"', 'EXECUTIVE LEVEL', 'LAB SECTOR 12'],
    floor: CLEAN, floorTint: 0xd4dcec, wall: 'wall_face_a_corp', wallTint: 0xffffff, trim: 0x2a4a6a, ambient: 0.16,
    light: { room: 0xd8f4ff, start: 0xffffff, vault: 0xff3a2a, extraction: 0x7dff9a },
    rooms: { servers: 3, office: 3, medbay: 1, storage: 1, mess: 1 },
    loot: { technology: 2, documents: 2, valuables: 1.5, electronics: 1.4 },
    clutter: ['ship_plant', 'ship_plant2', 'ship_chair', 'ship_bin', 'hack_box'],
  },
  sirin: {
    id: 'sirin', names: ['LISTENING POST "SIRIN"', 'CONTACT LAB', 'THE GARDEN', 'RELAY ZERO'],
    floor: GRATE, floorTint: 0xd8c4e8, wall: 'wall_face_a_alien', wallTint: 0xffffff, trim: 0x5a2a6a, ambient: 0.1,
    light: { room: 0xc890ff, start: 0xcfe0ff, vault: 0xff3a6a, extraction: 0x7dff9a },
    rooms: { servers: 2, medbay: 2, reactor: 2, office: 1, storage: 1 },
    loot: { alien: 2.5, minerals: 1.5, technology: 1.5 },
    clutter: ['ship_plant3', 'barrel_blue', 'hack_box', 'ship_bucket'],
  },
};

export function themeFor(destination: string | undefined): Theme {
  return THEMES[destination ?? ''] ?? THEMES.tikhaya;
}

/** The name of the facility a raid seed lands in. */
export function facilityName(destination: string | undefined, seed: number): string {
  const names = themeFor(destination).names;
  return names[Math.abs(seed) % names.length];
}
