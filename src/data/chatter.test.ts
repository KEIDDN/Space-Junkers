import { describe, expect, it } from 'vitest';
import { CHATTER, chatterFor } from './chatter';
import { CREW } from './crew';
import { QUEST } from './quests';
import { LORE_BY_ID } from './lore';

const fresh = { stats: { extractions: 0, deaths: 0 }, lore: [] as string[], quests: {} as Record<string, { status: string }> };

describe('ship chatter', () => {
  it('only real crew speak, about real contracts and records', () => {
    for (const ex of CHATTER) {
      for (const l of ex.lines) expect(CREW[l.who], ex.id).toBeDefined();
      if (ex.after) expect(QUEST[ex.after], ex.id).toBeDefined();
      if (ex.before) expect(QUEST[ex.before], ex.id).toBeDefined();
      if (ex.lore) expect(LORE_BY_ID[ex.lore], ex.id).toBeDefined();
    }
  });

  it('changes with the ship: the pump knocks until it is fixed, then they talk about something else', () => {
    const before = chatterFor(fresh).map((e) => e.id);
    expect(before).toContain('pump');
    expect(before).not.toContain('pump_fixed');
    const after = chatterFor({ ...fresh, quests: { fedya_first: { status: 'turnedIn' } } }).map((e) => e.id);
    expect(after).toContain('pump_fixed');
    expect(after).not.toContain('pump');
  });

  it('keeps some things for later: a first death, a first extraction, a record read', () => {
    const ids = chatterFor(fresh).map((e) => e.id);
    expect(ids).not.toContain('counting');
    expect(ids).not.toContain('risk');
    expect(ids).not.toContain('clocks');
    const later = chatterFor({ stats: { extractions: 1, deaths: 1 }, lore: ['clocks'], quests: {} }).map((e) => e.id);
    expect(later).toEqual(expect.arrayContaining(['counting', 'risk', 'clocks']));
    expect(chatterFor(fresh, new Set(['pump'])).map((e) => e.id)).not.toContain('pump');
  });
});
