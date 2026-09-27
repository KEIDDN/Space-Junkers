import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Operator } from '../game/entities/Player';

interface SettingsState {
  operator: Operator;
  volume: number;
  setOperator(op: Operator): void;
  setVolume(v: number): void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      operator: 'm',
      volume: 0.7,
      setOperator: (operator) => set({ operator }),
      setVolume: (volume) => set({ volume }),
    }),
    { name: 'space-junkers.settings' },
  ),
);
