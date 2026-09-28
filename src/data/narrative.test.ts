import { describe, expect, it } from 'vitest';
import { INTRO, STEP_LINES } from './prologue';
import { CREW, CREW_IDS } from './crew';
import { DESTINATIONS } from './destinations';
import { CHATTER, DEPARTURE, departureLine } from './chatter';
import { QUEST } from './quests';
import { ITEMS } from './items';

/**
 * The narrative contract (docs/LORE_BIBLE.md, "the north star"): the present is said plainly
 * and early; the past stays evidence. These tests keep later edits honest about both.
 */
describe('the present, plainly', () => {
  const intro = INTRO.join(' ');

  it('the opening says what happened, who lives off it, who you are, and what is wrong today', () => {
    expect(intro).toMatch(/Commonwealth ran this system from Central/);
    expect(intro).toMatch(/clock/);
    expect(intro).toMatch(/Central stopped answering/);
    expect(intro).toMatch(/Belt/);
    expect(intro).toMatch(/Crews go down and bring it up/);
    expect(intro).toMatch(/Lastochka/);
    expect(intro).toMatch(/owe/);
    expect(intro).toMatch(/goes down/);
    expect(INTRO[INTRO.length - 1]).toMatch(/pump/);
  });

  it('...and nothing about why: no channel nine, no Sirin, no signal in the opening', () => {
    expect(intro).not.toMatch(/nine|Sirin|signal/i);
    expect(INTRO.length).toBeLessThanOrEqual(8);
    for (const l of INTRO) expect(l.length, l).toBeLessThanOrEqual(95);
  });

  it('Fedya states the arrangement and why we raid before the first job', () => {
    const job = STEP_LINES.job.map((l) => l.text).join(' ');
    expect(job).toMatch(/arrangement/);
    expect(job).toMatch(/share/);
    expect(job).toMatch(/fare/);
    expect(job).toMatch(/Nobody makes them/);
    // Why Tikhaya first, in the ship's own terms.
    expect(job).toMatch(/nearest moon and the cheapest fuel/);
    // And one thing that doesn't add up, noticed, not explained.
    expect(STEP_LINES.airlock.map((l) => l.text).join(' ')).toMatch(/lights are still on/);
    expect(QUEST.fedya_first.done.join(' ')).toMatch(/nobody sells it, somebody goes down/);
  });

  it('every crew member\'s first words carry their own part of the world, briefly', () => {
    for (const id of CREW_IDS) expect(CREW[id].intro.length, id).toBeLessThanOrEqual(5);
    expect(CREW.trader.intro.join(' ')).toMatch(/Fuel, parts, food, the loan/);
    expect(CREW.merc.intro.join(' ')).toMatch(/defended/);
    expect(CREW.medic.intro.join(' ')).toMatch(/bravery/);
    expect(CREW.hacker.intro.join(' ')).toMatch(/still running/);
    expect(CREW.smuggler.intro.join(' ')).toMatch(/not the only crew/);
  });

  it('overheard before the first job: why somebody goes down at all', () => {
    const buy = CHATTER.find((e) => e.id === 'buy')!;
    expect(buy.before).toBe('fedya_first');
    expect(buy.lines.map((l) => l.text).join(' ')).toMatch(/operator is for/);
  });

  it('one word for the end of the world: the Blackout (never "the Collapse")', () => {
    const text = JSON.stringify([DESTINATIONS, ITEMS, CREW, QUEST, CHATTER]);
    expect(text).not.toMatch(/Collapse/);
  });
});

describe('places with reasons', () => {
  it('every destination says why the ship would go, and what the crew think, in a few lines', () => {
    for (const d of DESTINATIONS) {
      expect(d.why.length, d.id).toBeGreaterThan(20);
      expect(d.talk.length, d.id).toBeGreaterThanOrEqual(2);
      expect(d.talk.length, d.id).toBeLessThanOrEqual(5);
      for (const l of d.talk) expect(CREW[l.who], d.id).toBeDefined();
      if (d.id !== 'tikhaya') expect(d.unlockHint.length, d.id).toBeGreaterThan(20);
    }
  });

  it('Sirin keeps its secret: the reason to go is a question, not an answer', () => {
    const sirin = DESTINATIONS.find((d) => d.id === 'sirin')!;
    expect(sirin.why).toMatch(/wants to know/);
    expect(sirin.loot).toBe('Unknown');
  });
});

describe('a word at the airlock', () => {
  it('money first: a jump that took the last of it gets said out loud', () => {
    expect(departureLine({ credits: 100 }, 'merzlota', 7, 250).text).toMatch(/last of the fuel money/);
    expect(departureLine({ credits: 100 }, 'tikhaya', 7, 250).text).toMatch(/tab/);
  });

  it('otherwise a steady line for this facility, from real crew', () => {
    for (let seed = 0; seed < 40; seed++) {
      const l = departureLine({ credits: 5000 }, 'krasnaya', seed, 250);
      expect(CREW[l.who]).toBeDefined();
      expect(departureLine({ credits: 5000 }, 'krasnaya', seed, 250)).toEqual(l);
    }
    for (const lines of Object.values(DEPARTURE)) for (const l of lines) expect(CREW[l.who]).toBeDefined();
  });
});
