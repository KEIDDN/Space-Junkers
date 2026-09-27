import type { CrewId } from '../data/crew';
import { DESTINATION } from '../data/destinations';
import { buy, sell } from '../core/economy';
import { accept, turnIn } from '../core/quests';
import { install, repair, jumpCost } from '../core/upgrades';
import { audio } from '../engine/audio';
import { randomSeed } from '../engine/rng';
import { getProfile, useProfile } from './profileStore';
import { shipUi } from './shipStore';

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Things the operator does aboard that change the save. */
export const shipActions = {
  meet(crew: CrewId): void {
    const p = getProfile();
    const cur = p.crew[crew];
    if (cur?.met) return;
    useProfile.getState().apply({ crew: { ...p.crew, [crew]: { trust: cur?.trust ?? 0, met: true } } });
  },

  buy(crew: CrewId, index: number): ActionResult {
    const r = buy(getProfile(), crew, index);
    if (!r.ok) {
      audio.ui('error');
      return r;
    }
    useProfile.getState().apply(r.profile);
    audio.ui('buy');
    return { ok: true };
  },

  sell(crew: CrewId, uid: string): ActionResult {
    const r = sell(getProfile(), crew, uid);
    if (!r.ok) {
      audio.ui('error');
      return r;
    }
    useProfile.getState().apply(r.profile);
    audio.ui('sell');
    return { ok: true };
  },

  /** Pay for fuel and jump. The facility (seed) is picked now and waits for you. */
  setCourse(destination: string): ActionResult {
    const p = getProfile();
    const d = DESTINATION[destination];
    if (!d || !p.destinations.includes(destination)) return { ok: false, error: 'No coordinates for that.' };
    if (p.course?.destination === destination) return { ok: false, error: 'Already there.' };
    const { cost } = jumpCost(p, destination, d.cost);
    if (p.credits < cost) return { ok: false, error: 'Not enough Credits for fuel.' };
    useProfile.getState().apply({ credits: p.credits - cost, course: { destination, seed: randomSeed() } });
    shipUi.patch({ jumping: true });
    return { ok: true };
  },

  acceptQuest(id: string): void {
    useProfile.getState().apply(accept(getProfile(), id));
    audio.ui('equip');
  },

  /** Hand in a finished contract. Returns what the giver says. */
  turnInQuest(id: string): { ok: true; lines: string[] } | { ok: false; error: string } {
    const r = turnIn(getProfile(), id);
    if (!r.ok) {
      audio.ui('error');
      return r;
    }
    useProfile.getState().apply(r.profile);
    audio.ui('buy');
    return { ok: true, lines: r.lines };
  },

  install(id: string): ActionResult {
    const r = install(getProfile(), id);
    if (!r.ok) {
      audio.ui('error');
      return r;
    }
    useProfile.getState().apply(r.profile);
    audio.ui('equip');
    return { ok: true };
  },

  repair(uid: string): ActionResult {
    const r = repair(getProfile(), uid);
    if (!r.ok) {
      audio.ui('error');
      return r;
    }
    useProfile.getState().apply(r.profile);
    audio.ui('equip');
    return { ok: true };
  },
};
