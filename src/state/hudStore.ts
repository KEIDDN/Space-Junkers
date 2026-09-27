import { create } from 'zustand';

/**
 * Low-frequency snapshot of in-run values for the React HUD.
 * The game writes here only when a value actually changes. Never per-frame positions.
 */
export interface HudState {
  hp: number;
  maxHp: number;
  weaponName: string;
  weaponSlot: number;
  ammo: number;
  magSize: number;
  reserve: number;
  reloading: boolean;
  hostiles: number;
  dead: boolean;
  cleared: boolean;
}

export const useHud = create<HudState>(() => ({
  hp: 100,
  maxHp: 100,
  weaponName: '',
  weaponSlot: 0,
  ammo: 0,
  magSize: 0,
  reserve: 0,
  reloading: false,
  hostiles: 0,
  dead: false,
  cleared: false,
}));

/** Shallow-compare and write only changed fields. */
export function syncHud(next: HudState): void {
  const cur = useHud.getState();
  let changed = false;
  for (const k in next) {
    if (next[k as keyof HudState] !== cur[k as keyof HudState]) {
      changed = true;
      break;
    }
  }
  if (changed) useHud.setState(next);
}
