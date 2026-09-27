import { create } from 'zustand';

/**
 * Low-frequency snapshot of in-run values for the React HUD.
 * The game writes here only when a value actually changes. Never per-frame positions.
 */
export interface HudState {
  hp: number;
  maxHp: number;
  bleeding: boolean;
  regen: boolean;
  boosted: boolean;
  /** 0..1 durability of worn armor / helmet, or -1 if none. */
  armor: number;
  helmet: number;
  /** Item being used (medkit...) and its progress 0..1, or -1. */
  using: number;
  usingName: string | null;
  stamina: number;
  gait: 'sneak' | 'walk' | 'sprint';

  armed: boolean;
  weaponName: string;
  weaponSlot: number;
  ammo: number;
  magSize: number;
  /** Rounds carried of the loaded type. */
  reserve: number;
  ammoName: string;
  reloading: boolean;
  jammed: boolean;

  /** Quick slots: bound item id and how many are carried. */
  quick: string;
  /** Carried weight, kg (rounded). */
  weight: number;

  /** Signal scanner readout toward the extraction zone ('' without the upgrade). */
  exfil: string;

  hostiles: number;
  dead: boolean;
  cleared: boolean;
}

export const useHud = create<HudState>(() => ({
  hp: 100,
  maxHp: 100,
  bleeding: false,
  regen: false,
  boosted: false,
  armor: -1,
  helmet: -1,
  using: -1,
  usingName: null,
  stamina: 100,
  gait: 'walk',
  armed: false,
  weaponName: '',
  weaponSlot: 0,
  ammo: 0,
  magSize: 0,
  reserve: 0,
  ammoName: '',
  reloading: false,
  jammed: false,
  quick: '',
  weight: 0,
  exfil: '',
  hostiles: 0,
  dead: false,
  cleared: false,
}));

/** Shallow-compare and write only changed fields. */
export function syncHud(next: HudState): void {
  const cur = useHud.getState();
  for (const k in next) {
    if (next[k as keyof HudState] !== cur[k as keyof HudState]) {
      useHud.setState(next);
      return;
    }
  }
}
