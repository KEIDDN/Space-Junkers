import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Permanent progression, saved locally. Survives death.
 * The ship (Phase 5) will read the stash to store/sell items.
 */
interface ProfileState {
  /** itemId -> quantity */
  stash: Record<string, number>;
  extractions: number;
  deaths: number;
  bankLoot(items: string[]): void;
  recordDeath(): void;
}

export const useProfile = create<ProfileState>()(
  persist(
    (set) => ({
      stash: {},
      extractions: 0,
      deaths: 0,
      bankLoot: (items) => set((s) => {
        const stash = { ...s.stash };
        for (const id of items) stash[id] = (stash[id] ?? 0) + 1;
        return { stash, extractions: s.extractions + 1 };
      }),
      recordDeath: () => set((s) => ({ deaths: s.deaths + 1 })),
    }),
    { name: 'space-junkers.profile' },
  ),
);
