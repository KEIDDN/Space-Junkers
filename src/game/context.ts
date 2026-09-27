import type { AudioService } from '../engine/audio';
import type { Camera } from '../engine/camera';
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
  /** A loud event (gunfire, explosion) that enemies within `radius` can hear. */
  emitNoise(x: number, y: number, radius: number): void;
  /** Freeze the simulation briefly for impact emphasis. */
  hitstop(seconds: number): void;
  /** Brief light burst (no-op where there is no darkness). */
  lightFlash(x: number, y: number, radius: number, color: number, intensity: number): void;
}
