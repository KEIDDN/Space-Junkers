import { describe, expect, it } from 'vitest';
import { CREW } from '../data/crew';
import { DESTINATION } from '../data/destinations';
import { ENEMIES } from '../data/enemies';
import { ITEMS } from '../data/items';
import { QUEST, QUESTS } from '../data/quests';
import { MARKS, RETRIEVALS, TASKS } from '../data/objectives';
import { VENDORS } from '../data/vendors';
import { CONTAINERS, rollContainer } from '../data/loot';
import { Rng } from '../engine/rng';
import { sellOffer } from './economy';
import { addToGrid, countInGrid, createItem } from './inventory';
import { newProfile, type Profile } from './profile';
import { accept, applyRaid, countAboard, liveContracts, needsExtraction, questStatus, raidPlan, repairQuests, turnIn, type RaidReport } from './quests';

const report = (r: Partial<RaidReport> = {}): RaidReport => ({
  destination: 'tikhaya', extracted: true, kills: [], searched: 0, visited: [], found: [], ...r,
});

function give(p: Profile, id: string, n = 1): Profile {
  let stash = p.stash;
  for (let i = 0; i < n; i++) stash = addToGrid(stash, createItem(id)).grid;
  return { ...p, stash };
}

describe('quest data', () => {
  it('references real items, enemies, destinations, crew and quests', () => {
    for (const q of QUESTS) {
      expect(CREW[q.giver], q.id).toBeDefined();
      for (const r of q.requires?.quests ?? []) expect(QUEST[r], `${q.id} requires ${r}`).toBeDefined();
      for (const o of q.objectives) {
        if ('item' in o) expect(ITEMS[o.item], `${q.id} ${o.item}`).toBeDefined();
        if (o.kind === 'kill' && o.enemy) expect(ENEMIES[o.enemy], `${q.id} ${o.enemy}`).toBeDefined();
        if ('destination' in o && o.destination) expect(DESTINATION[o.destination], q.id).toBeDefined();
      }
      for (const [id] of q.reward.items ?? []) expect(ITEMS[id], `${q.id} reward ${id}`).toBeDefined();
      if (q.reward.destination) expect(DESTINATION[q.reward.destination]).toBeDefined();
    }
  });

  it('never asks for something a crew member sells: shops prepare you, raids do the job', () => {
    const sold = new Set(Object.values(VENDORS).flatMap((v) => v.stock.map((e) => e.item)));
    for (const q of QUESTS) {
      for (const o of q.objectives) {
        if (o.kind === 'handIn' || o.kind === 'extractWith' || o.kind === 'retrieve') expect(sold.has(o.item), `${q.id} wants ${o.item}, which is for sale`).toBe(false);
      }
    }
  });

  it('every site objective has a site, and every contract says plainly where to look', () => {
    for (const q of QUESTS) {
      expect(q.intel, q.id).toBeTruthy();
      for (const o of q.objectives) {
        if (o.kind === 'retrieve') expect(RETRIEVALS[o.item], `${q.id} ${o.item}`).toBeDefined();
        if (o.kind === 'task') expect(TASKS[o.task], `${q.id} ${o.task}`).toBeDefined();
        if (o.kind === 'retrieve') expect(ITEMS[o.item].quest, `${q.id} ${o.item} is contract goods`).toBe(true);
      }
    }
  });

  it('contract goods are never rolled in containers and nobody buys them', () => {
    const quest = new Set(Object.values(ITEMS).filter((d) => d.quest).map((d) => d.id));
    expect(quest.size).toBeGreaterThan(0);
    for (let seed = 1; seed < 400; seed++) {
      for (const c of Object.values(CONTAINERS)) {
        for (const q of rollContainer(new Rng(seed), c, 1, {}, 1).items) expect(quest.has(q.item.id), q.item.id).toBe(false);
      }
    }
    for (const id of quest) for (const crew of Object.keys(VENDORS)) expect(sellOffer(crew as never, createItem(id), 1)).toBeNull();
  });

  it('every destination except the first can be unlocked by some contract', () => {
    const unlocks = new Set(QUESTS.map((q) => q.reward.destination).filter(Boolean));
    for (const d of Object.keys(DESTINATION)) if (d !== 'tikhaya') expect(unlocks.has(d), d).toBe(true);
  });
});

describe('quest flow', () => {
  it('the first job: the pump regulator has to come off a Tikhaya wall and get home', () => {
    let p = newProfile();
    expect(questStatus(p, 'fedya_first')).toBe('available');
    p = accept(p, 'fedya_first');
    expect(questStatus(p, 'fedya_first')).toBe('active');
    expect(raidPlan(p, 'tikhaya').items).toEqual(['regulator']);
    expect(raidPlan(p, 'merzlota').items).toEqual([]);
    const regulator = createItem('regulator');
    p = applyRaid(p, report({ extracted: false, found: [regulator] })).profile;
    expect(questStatus(p, 'fedya_first')).toBe('active'); // dying with it doesn't count
    p = applyRaid(p, report())
      .profile;
    expect(questStatus(p, 'fedya_first')).toBe('active'); // getting out without it doesn't either
    p = applyRaid(p, report({ found: [regulator] })).profile;
    expect(questStatus(p, 'fedya_first')).toBe('ready');
    expect(raidPlan(p, 'tikhaya').items).toEqual([]); // done: the next facility has no regulator waiting
    p = { ...p, stash: addToGrid(p.stash, regulator).grid };
    const r = turnIn(p, 'fedya_first');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.profile.credits).toBe(p.credits + QUEST.fedya_first.reward.credits!);
    expect(r.profile.crew.trader!.trust).toBeGreaterThan(0);
    expect(questStatus(r.profile, 'fedya_first')).toBe('turnedIn');
    expect(questStatus(r.profile, 'fedya_parts')).toBe('available');
    expect(countInGrid(r.profile.stash, 'regulator')).toBe(0); // it went into the pump
  });

  it('a job done at its site counts at once, even if you die after', () => {
    let p = accept(newProfile(), 'shura_relay');
    expect(raidPlan(p, 'tikhaya').tasks).toEqual(['relay']);
    p = applyRaid(p, report({ extracted: false, tasks: ['relay'] })).profile;
    expect(questStatus(p, 'shura_relay')).toBe('ready');
    expect(raidPlan(p, 'tikhaya').tasks).toEqual([]);
    expect(needsExtraction({ kind: 'task', task: 'relay', destination: 'tikhaya' })).toBe(false);
  });

  it('a haul only counts from one raid, carried out alive', () => {
    let p: Profile = { ...newProfile(), quests: { fedya_first: { status: 'turnedIn' as const, progress: [1] } } };
    p = accept(p, 'fedya_parts');
    p = applyRaid(p, report({ extracted: false, haul: 5000 })).profile;
    expect(questStatus(p, 'fedya_parts')).toBe('active');
    p = applyRaid(p, report({ haul: 900 })).profile;
    p = applyRaid(p, report({ haul: 900 })).profile;
    expect(questStatus(p, 'fedya_parts')).toBe('active'); // two small runs aren't one heavy one
    p = applyRaid(p, report({ haul: 1500 })).profile;
    expect(questStatus(p, 'fedya_parts')).toBe('ready');
  });

  it('a named hostile is placed on his world while the contract is open, and counts by name', () => {
    let p: Profile = { ...newProfile(), quests: { molot_clean: { status: 'turnedIn' as const, progress: [3] } } };
    p = accept(p, 'molot_gvozd');
    expect(raidPlan(p, 'tikhaya').marks).toEqual(['boss']);
    expect(MARKS.boss).toBeDefined();
    p = applyRaid(p, report({ kills: [{ enemy: 'scavenger', headshot: true }] })).profile;
    expect(questStatus(p, 'molot_gvozd')).toBe('active');
    p = applyRaid(p, report({ extracted: false, kills: [{ enemy: 'boss', headshot: false }] })).profile;
    expect(questStatus(p, 'molot_gvozd')).toBe('ready');
  });

  it('records read count toward reading contracts', () => {
    let p: Profile = { ...newProfile(), quests: { shura_relay: { status: 'turnedIn' as const, progress: [1] } } };
    p = accept(p, 'shura_fragments');
    p = applyRaid(p, report({ extracted: false, read: 2 })).profile;
    expect(questStatus(p, 'shura_fragments')).toBe('active');
    p = applyRaid(p, report({ read: 1 })).profile;
    expect(questStatus(p, 'shura_fragments')).toBe('ready');
  });

  it('old saves with contracts whose objectives changed load with progress that fits', () => {
    const fixed = repairQuests({
      fedya_parts: { status: 'active', progress: [3, 2] },
      fedya_first: { status: 'turnedIn', progress: [1] },
      gone: { status: 'active', progress: [4] },
    });
    expect(fixed.fedya_parts.progress).toHaveLength(QUEST.fedya_parts.objectives.length);
    expect(fixed.fedya_parts.progress[0]).toBeLessThanOrEqual(1);
    expect(fixed.fedya_first.status).toBe('turnedIn');
    expect(fixed.gone.progress).toEqual([]);
  });

  it('kills count even when you die', () => {
    let p = accept(newProfile(), 'molot_zero');
    p = applyRaid(p, report({ extracted: false, kills: Array.from({ length: 4 }, () => ({ enemy: 'scavenger', headshot: false })) })).profile;
    expect(questStatus(p, 'molot_zero')).toBe('ready');
  });

  it('hand-ins are consumed from the stash on turn-in', () => {
    let p = accept(newProfile(), 'doc_stock');
    expect(questStatus(p, 'doc_stock')).toBe('active');
    p = give(p, 'antiseptic', 2);
    expect(questStatus(p, 'doc_stock')).toBe('active');
    p = give(p, 'antibiotics', 1);
    expect(questStatus(p, 'doc_stock')).toBe('ready');
    const r = turnIn(p, 'doc_stock');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(countInGrid(r.profile.stash, 'antiseptic')).toBe(0);
    expect(countInGrid(r.profile.stash, 'antibiotics')).toBe(0);
  });

  it('extractWith counts only items found in the raid, on the right world', () => {
    let p = newProfile();
    p = { ...p, quests: { fedya_crystals: { status: 'active', progress: [0] } } };
    p = applyRaid(p, report({ destination: 'tikhaya', found: [createItem('cryo'), createItem('cryo')] })).profile;
    expect(p.quests.fedya_crystals.progress[0]).toBe(0);
    p = applyRaid(p, report({ destination: 'merzlota', found: [createItem('cryo'), createItem('cryo')] })).profile;
    expect(questStatus(p, 'fedya_crystals')).toBe('ready');
  });

  it('unlocks destinations and respects trust requirements', () => {
    let p = newProfile();
    p = { ...p, quests: { fedya_first: { status: 'turnedIn', progress: [1] }, fedya_parts: { status: 'turnedIn', progress: [1] } } };
    expect(questStatus(p, 'fedya_foreman')).toBe('locked'); // needs trust KNOWN
    p = { ...p, crew: { trader: { trust: 20, met: true } } };
    p = accept(p, 'fedya_foreman');
    p = applyRaid(p, report({ found: [createItem('kamenev_tin')] })).profile;
    const r = turnIn(p, 'fedya_foreman');
    expect(r.ok && r.profile.destinations.includes('merzlota')).toBe(true);
  });
});

describe('in-raid job sheet (liveContracts)', () => {
  const log = (r: Partial<{ kills: RaidReport['kills']; searched: number; visited: string[] }> = {}) =>
    ({ kills: [], searched: 0, visited: [], ...r });

  it('shows each active contract with its giver, objectives and reward, and nothing else', () => {
    const p = accept(newProfile(), 'fedya_first');
    const live = liveContracts(p, log(), 'tikhaya');
    expect(live).toHaveLength(1);
    expect(live[0]).toMatchObject({ id: 'fedya_first', title: 'The Pump', giver: 'trader' });
    expect(live[0].reward.credits).toBe(900);
    expect(live[0].objectives[0]).toMatchObject({ have: 0, need: 1, here: true, note: null });
    const carrying = liveContracts(p, log(), 'tikhaya', [createItem('regulator')])[0].objectives[0];
    expect(carrying).toMatchObject({ have: 0, note: 'IN YOUR BAG · GET IT HOME' });
    expect(liveContracts(newProfile(), log(), 'tikhaya')).toHaveLength(0);
  });

  it('counts this raid live: kills and searches move the numbers before extraction', () => {
    let p = accept(newProfile(), 'fedya_first');
    p = { ...p, quests: { ...p.quests, molot_zero: { status: 'active', progress: QUEST.molot_zero.objectives.map(() => 0) } } };
    const kills = [{ enemy: 'scav', headshot: false }, { enemy: 'scav', headshot: true }];
    const live = liveContracts(p, log({ kills, searched: 3 }), 'tikhaya');
    const zero = live.find((c) => c.id === 'molot_zero')!;
    const expected = applyRaid(p, report({ kills, searched: 3, extracted: false })).profile.quests.molot_zero.progress;
    expect(zero.objectives.map((o) => o.have)).toEqual(expected.map((n, i) => Math.min(n, zero.objectives[i].need)));
  });

  it('marks an objective complete once the need is met', () => {
    const p = accept(newProfile(), 'molot_zero');
    const need = QUEST.molot_zero.objectives[0];
    const n = need.kind === 'kill' ? need.count : 1;
    const kills = Array.from({ length: n + 2 }, () => ({ enemy: need.kind === 'kill' && need.enemy ? need.enemy : 'scav', headshot: true }));
    const o = liveContracts(p, log({ kills }), 'tikhaya')[0].objectives[0];
    expect(o.have).toBe(o.need);
  });

  it('found items in the bag are named as "extract to count", not counted early', () => {
    let p = give(newProfile(), 'scrap', 0);
    p = { ...p, quests: { fedya_crystals: { status: 'active', progress: [0] } } };
    const cryo = createItem('cryo');
    const o = liveContracts(p, log(), 'merzlota', [cryo])[0].objectives[0];
    expect(o.have).toBe(0);
    expect(o.note).toContain('1 IN YOUR BAG');
    const away = liveContracts(p, log(), 'tikhaya', [cryo])[0].objectives[0];
    expect(away.here).toBe(false);
    expect(away.note).toBe('ON MERZLOTA');
  });

  it('hand-ins count what is aboard plus what is in the bag', () => {
    let p = give(newProfile(), 'antiseptic', 1);
    p = { ...p, quests: { doc_stock: { status: 'active', progress: [0, 0] } } };
    const before = countAboard(p, QUEST.doc_stock.objectives[0]);
    const live = liveContracts(p, log(), 'tikhaya', [createItem('antiseptic')])[0].objectives[0];
    expect(live.have).toBe(Math.min(2, before + 1));
    expect(live.here).toBe(false);
  });

  it('a heavy-run contract says how much is on you so far', () => {
    let p: Profile = { ...newProfile(), quests: { fedya_first: { status: 'turnedIn' as const, progress: [1] } } };
    p = accept(p, 'fedya_parts');
    const o = liveContracts(p, log(), 'tikhaya', [createItem('gold_bar')])[0].objectives[0];
    expect(o.note).toBe(`${ITEMS.gold_bar.value} OF 1,500 KR ON YOU`);
  });
});
