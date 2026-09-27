import { create } from 'zustand';
import { persist, type PersistStorage, type StorageValue } from 'zustand/middleware';
import { addToGrid, createItem, emptyLoadout } from '../core/inventory';
import { PROFILE_VERSION, migrate, newProfile, repair, type Operator, type Profile } from '../core/profile';

/**
 * The persistent save (Credits, stash, loadout, crew, quests, progression).
 * Survives death. Written to localStorage with a rolling backup, migrated and repaired on load.
 */

const KEY = 'space-junkers.profile';
/** Notes produced while loading (hydration runs synchronously inside `create`). */
const pendingNotices: string[] = [];
const BACKUP = `${KEY}.bak`;

interface ProfileActions {
  /** Messages about the last load (migrations, abandoned raids) for the UI to show once. */
  notices: string[];
  clearNotices(): void;
  setOperator(op: Operator): void;
  /** Replace profile data wholesale (used by domain modules that compute a new profile). */
  apply(next: Partial<Profile>): void;
  /** Build 0.2 bridge: extracted loot ids go straight into the stash. */
  bankLoot(items: string[]): void;
  recordDeath(): void;
  resetProfile(op?: Operator): void;
}

export type ProfileStore = Profile & ProfileActions;

function profileOf(s: ProfileStore): Profile {
  return {
    version: s.version, operator: s.operator, credits: s.credits, stash: s.stash, loadout: s.loadout,
    crew: s.crew, quests: s.quests, destinations: s.destinations, upgrades: s.upgrades, flags: s.flags,
    day: s.day, purchases: s.purchases, raid: s.raid, stats: s.stats,
  };
}

/**
 * localStorage with a backup: before overwriting, the previous good save is copied aside.
 * A corrupt main save falls back to the backup instead of wiping progress.
 */
const safeStorage: PersistStorage<Profile> = {
  getItem(name) {
    for (const key of [name, BACKUP]) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw) as StorageValue<Profile>;
        if (parsed && typeof parsed === 'object' && 'state' in parsed) return parsed;
      } catch {
        // Corrupt: try the next copy.
      }
    }
    return null;
  },
  setItem(name, value) {
    try {
      const prev = localStorage.getItem(name);
      if (prev) {
        try {
          JSON.parse(prev);
          localStorage.setItem(BACKUP, prev);
        } catch {
          // Don't back up garbage.
        }
      }
      localStorage.setItem(name, JSON.stringify(value));
    } catch (err) {
      console.error('Save failed', err);
    }
  },
  removeItem(name) {
    localStorage.removeItem(name);
  },
};

/**
 * A raid still marked as running at load time was abandoned (tab closed, crash, refresh).
 * It resolves as missing in action: the loadout is lost, exactly as if the player died.
 * Otherwise refreshing would be a free escape from any bad fight.
 */
function resolveAbandonedRaid(p: Profile): { profile: Profile; notice: string | null } {
  if (!p.raid) return { profile: p, notice: null };
  return {
    profile: {
      ...p,
      raid: null,
      loadout: emptyLoadout(),
      day: p.day + 1,
      stats: { ...p.stats, deaths: p.stats.deaths + 1 },
    },
    notice: 'Contact lost during your last deployment. Everything you carried is gone.',
  };
}

export const useProfile = create<ProfileStore>()(
  persist(
    (set, get) => ({
      ...newProfile(),
      notices: [],
      clearNotices: () => set({ notices: [] }),
      setOperator: (operator) => set({ operator }),
      apply: (next) => set(next),
      bankLoot: (items) => {
        let stash = get().stash;
        let overflow = 0;
        for (const id of items) {
          const r = addToGrid(stash, createItem(id));
          stash = r.grid;
          if (r.rest) overflow++;
        }
        set((s) => ({
          stash,
          stats: { ...s.stats, extractions: s.stats.extractions + 1, raids: s.stats.raids + 1 },
          notices: overflow ? [...s.notices, `Stash full: ${overflow} item(s) left on the landing pad.`] : s.notices,
        }));
      },
      recordDeath: () => set((s) => ({ stats: { ...s.stats, deaths: s.stats.deaths + 1, raids: s.stats.raids + 1 } })),
      resetProfile: (op) => set({ ...newProfile(op ?? get().operator), notices: [] }),
    }),
    {
      name: KEY,
      version: PROFILE_VERSION,
      storage: safeStorage,
      partialize: (s) => profileOf(s),
      migrate: (persisted, version) => {
        const { profile, notes } = migrate(persisted, version);
        pendingNotices.push(...notes);
        return profile;
      },
      // Write the repaired/resolved save straight back, so an abandoned raid resolves exactly once.
      onRehydrateStorage: () => (state) => state?.apply({}),
      merge: (persisted, current) => {
        const repaired = repair(persisted as Profile).profile;
        const { profile, notice } = resolveAbandonedRaid(repaired);
        if (notice) pendingNotices.push(notice);
        return { ...current, ...profile, notices: [...pendingNotices] };
      },
    },
  ),
);

/** Plain snapshot of the save (no actions), for domain logic. */
export function getProfile(): Profile {
  return profileOf(useProfile.getState());
}
