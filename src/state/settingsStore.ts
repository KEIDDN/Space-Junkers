import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Player preferences. Kept apart from the save so resetting progress keeps them. */
interface SettingsState {
  volume: number;
  /** Screen shake strength, 0..1. */
  shake: number;
  setVolume(v: number): void;
  setShake(v: number): void;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 1));

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      volume: 0.7,
      shake: 1,
      setVolume: (volume) => set({ volume: clamp01(volume) }),
      setShake: (shake) => set({ shake: clamp01(shake) }),
    }),
    {
      name: 'space-junkers.settings',
      version: 2,
      migrate: (s) => {
        const old = (s ?? {}) as { volume?: number; shake?: number };
        return { volume: clamp01(old.volume ?? 0.7), shake: clamp01(old.shake ?? 1) } as SettingsState;
      },
    },
  ),
);
