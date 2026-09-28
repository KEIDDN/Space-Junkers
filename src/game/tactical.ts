import type { ExitKind, RoomRole } from './world/tilemap';

/**
 * What the operator's wrist map knows: explored tiles and whatever was spotted on them.
 * Built on demand for the [M] overlay; never stored in React state per frame.
 */
export interface TacticalSnapshot {
  width: number;
  height: number;
  tiles: Uint8Array;
  /** 1 = seen. */
  explored: Uint8Array;
  doors: { tiles: { tx: number; ty: number }[]; locked: boolean; jammed: boolean }[];
  exits: {
    kind: ExitKind;
    x: number;
    y: number;
    w: number;
    h: number;
    powered: boolean;
    breaker: { tx: number; ty: number } | null;
    breakerKnown: boolean;
  }[];
  rooms: { x: number; y: number; w: number; h: number; role: RoomRole; kind: string }[];
  containers: { tx: number; ty: number; searched: boolean; empty: boolean }[];
  /** Contract sites: a part to take, a job to do (shown once seen). */
  sites: { tx: number; ty: number; kind: 'item' | 'task'; done: boolean }[];
  /** Player position in tiles, and aim in radians. */
  player: { x: number; y: number; aim: number };
  /** The scanner upgrade reveals exits and the vault. */
  scanner: boolean;
}
