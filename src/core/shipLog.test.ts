import { describe, expect, it } from 'vitest';
import { newProfile } from './profile';
import { accept, applyRaid } from './quests';
import { shipLog } from './shipLog';

describe('ship log', () => {
  it('says what the ship is waiting on: the job in hand, then what to hand in', () => {
    let p = accept(newProfile(), 'fedya_first');
    expect(shipLog(p)).toMatch(/^The Pump: Bring back the Pump Regulator on Tikhaya/);
    p = applyRaid(p, { destination: 'tikhaya', extracted: true, kills: [], searched: 0, visited: [], found: [{ uid: 'x', id: 'regulator', qty: 1 }] }).profile;
    expect(shipLog(p)).toMatch(/DYADYA FEDYA is waiting on "The Pump"/);
  });

  it('with nothing in hand, it says what to do; broke, it says how to get home', () => {
    expect(shipLog(newProfile())).toMatch(/No job in hand/);
    expect(shipLog({ ...newProfile(), credits: 0 })).toMatch(/on his tab/);
  });
});
