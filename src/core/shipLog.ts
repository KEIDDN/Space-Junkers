import { CREW } from '../data/crew';
import { DESTINATION } from '../data/destinations';
import { QUEST } from '../data/quests';
import { objectiveProgress, objectiveText, questStatus } from './quests';
import type { Profile } from './profile';
import { jumpCost } from './upgrades';

/**
 * The one quiet line under the ship's name once the first morning is over: what the ship is
 * waiting on. Something to hand in comes first, then the job in hand, then what to do when
 * there's nothing. Functional, in the ship's voice. Pure.
 */
export function shipLog(p: Profile): string {
  for (const id of Object.keys(p.quests)) {
    if (QUEST[id] && questStatus(p, id) === 'ready') {
      const q = QUEST[id];
      return `${CREW[q.giver].callsign} is waiting on "${q.title}". Hand it in.`;
    }
  }
  for (const id of Object.keys(p.quests)) {
    const q = QUEST[id];
    if (!q || questStatus(p, id) !== 'active') continue;
    const i = q.objectives.findIndex((_, k) => {
      const { have, need } = objectiveProgress(p, q, k);
      return have < need;
    });
    if (i >= 0) return `${q.title}: ${objectiveText(q.objectives[i])}.`;
  }
  const home = DESTINATION.tikhaya;
  if (jumpCost(p, home.id, home.cost).onTab) return 'Fuel is short. Fedya will fly you to Tikhaya on his tab, and remind you.';
  return 'No job in hand. The ship always needs fuel money: go down for salvage, or ask the crew what they need.';
}
