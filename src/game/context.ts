import type { AudioService, Surface } from '../engine/audio';
import type { Camera } from '../engine/camera';
import type { Haptics } from '../engine/haptics';
import type { Projectiles } from './combat/projectiles';
import type { Effects } from './fx/effects';
import type { TileMap } from './world/tilemap';

/** Services shared by gameplay entities during a run. */
export interface GameContext {
  map: TileMap;
  projectiles: Projectiles;
  effects: Effects;
  audio: AudioService;
  camera: Camera;
  /** Controller rumble for the player's own actions (absent in tests). */
  haptics?: Haptics;
  /** A loud event (gunfire, explosion) that enemies within `radius` can hear. */
  emitNoise(x: number, y: number, radius: number): void;
  /** Freeze the simulation briefly for impact emphasis. */
  hitstop(seconds: number): void;
  /** Brief light burst (no-op where there is no darkness). */
  lightFlash(x: number, y: number, radius: number, color: number, intensity: number, life?: number): void;
  /** Is there smoke between two points (blocks sight)? */
  smokeBetween(x0: number, y0: number, x1: number, y1: number): boolean;
  throwGrenade(fromX: number, fromY: number, toX: number, toY: number, kind: 'frag' | 'smoke', faction: 'player' | 'enemy'): void;
  /** What the floor is made of here (for footsteps). */
  surfaceAt(x: number, y: number): Surface;
}
