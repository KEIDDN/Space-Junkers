import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Player preferences. Kept apart from the save so resetting progress keeps them. */
interface SettingsState {
  volume: number;
  setVolume(v: number): void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      volume: 0.7,
      setVolume: (volume) => set({ volume: Math.max(0, Math.min(1, volume)) }),
    }),
    { name: 'space-junkers.settings', version: 1, migrate: (s) => ({ volume: (s as { volume?: number })?.volume ?? 0.7 }) as SettingsState },
  ),
);
