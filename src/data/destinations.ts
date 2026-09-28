import type { AiTuning } from './enemies';
import type { CrewId } from './crew';
import type { SiteRules } from '../game/world/facilityGen';
import type { RaidEventKind } from '../game/events';

/**
 * Places the Lastochka can fly to. Each is a context for raids: how dangerous, how far,
 * what's down there. Facilities are generated per visit; the planet decides their flavour.
 */

export interface DestinationDef {
  id: string;
  name: string;
  subtitle: string;
  /** Planet sprite key (`planet_<key>`). */
  planet: string;
  /** 1 (quiet) .. 5 (suicidal). */
  danger: number;
  /** Fuel cost of the jump, in Credits. */
  cost: number;
  description: string;
  /** What operators typically find. */
  loot: string;
  hostiles: string;
  /** How the player learns the coordinates (shown while locked). */
  unlockHint: string;
  /** Why the Lastochka would go there, plainly (FUNCTIONAL: the nav console's WHY GO line). */
  why: string;
  /** What the crew say about it at the nav console (CHARACTER: short, never a briefing). */
  talk: { who: CrewId; text: string }[];
  /** Who you meet down there, by weight. */
  enemies: Record<string, number>;
  /** Multiplier on enemy counts. */
  dangerMul: number;
  /** How long the Lastochka can hold orbit, in minutes. After that you're left behind. */
  minutes: number;
  /** Pushes every container toward rarer finds: the reason to fly further. */
  lootBonus: number;
  /** How the hostiles here fight (see AiTuning); missing fields are 1. */
  ai?: Partial<AiTuning>;
  /** How its facilities are built (see SiteRules): what makes it play unlike the others. */
  site?: SiteRules;
  /** What tends to happen here on its own (raid events by weight; see game/events.ts). */
  events?: Partial<Record<RaidEventKind, number>>;
}

export const DESTINATIONS: DestinationDef[] = [
  {
    id: 'tikhaya', name: 'TIKHAYA', subtitle: 'INDUSTRIAL MOON', planet: 'tikhaya', danger: 1, cost: 250,
    description: 'A green moon of tractor plants and ore mills. The Commonwealth\'s workshop, left running with nobody at the controls.',
    loot: 'Scrap, electronics, tools, provisions', hostiles: 'Scavenger gangs',
    unlockHint: '', enemies: { scavenger: 8, raider: 2 }, dangerMul: 0.85, minutes: 20, lootBonus: 0,
    why: 'Close and cheap. Parts, tools, food: what keeps the ship running from one week to the next.',
    talk: [{ who: 'trader', text: 'Tikhaya. Close, cheap, picked over. Every crew learns there.' }, { who: 'merc', text: 'And most of them stop learning there. Don\'t be most of them.' }],
    // The first world: hard, but learnable. See AiTuning.
    ai: { reaction: 1.4, aim: 1.3, notice: 0.75, damage: 0.8, startle: 1.8, coordination: 0.6, pause: 1.3 },
    // The baseline: no site rules. Other people's fights; squatters coming and going.
    events: { gunfire: 3, patrol: 2, seal: 2, blackout: 2, alarm: 1, nine: 1 },
  },
  {
    id: 'merzlota', name: 'MERZLOTA', subtitle: 'FROZEN MINING WORLD', planet: 'merzlota', danger: 2, cost: 900,
    description: 'Deep-bore mines under a hundred metres of ice. The miners sealed themselves in when the heating failed.',
    loot: 'Minerals, crystals, fuel, mining tech', hostiles: 'Scavengers, raider crews',
    unlockHint: 'Fedya knows a mine foreman who has the landing codes. Do Fedya\'s jobs until he trusts you with it.', enemies: { scavenger: 4, raider: 6 }, dangerMul: 1, minutes: 20, lootBonus: 0.2,
    why: 'Fuel cells, minerals, mining kit. What pays for going further than Tikhaya.',
    talk: [{ who: 'trader', text: 'Merzlota. Nine hundred for the jump.' }, { who: 'medic', text: 'That\'s a lot.' }, { who: 'trader', text: 'So is fuel.' }, { who: 'merc', text: 'The mining crews left their equipment behind. Some of it is worth the trip.' }, { who: 'hacker', text: 'and some of them never left.' }],
    ai: { reaction: 1.1, aim: 1.1, notice: 0.9, damage: 0.95, startle: 1.1, coordination: 0.85, pause: 1.1 },
    // Tunnels: small rooms, short sightlines, failing power. You hear them before you see them.
    site: { rooms: 'cramped', light: -0.15, cover: 1.2 },
    events: { blackout: 4, gunfire: 2, patrol: 2, seal: 2, alarm: 1, nine: 1 },
  },
  {
    id: 'krasnaya', name: 'KRASNAYA PUSTOSH', subtitle: 'RED WASTE · MILITARY', planet: 'krasnaya', danger: 3, cost: 2200,
    description: 'Garrison depots in a red dust desert. The soldiers there never got the order to stand down.',
    loot: 'Weapons, ammunition, armor, orders', hostiles: 'Garrison remnants',
    unlockHint: 'Molot served on Krasnaya and knows the way in. He won\'t take you until you\'ve done his jobs.', enemies: { soldier: 8, raider: 2 }, dangerMul: 1.1, minutes: 18, lootBonus: 0.3,
    why: 'Weapons, ammunition, armour. The further out we go, the better the kit has to be to come back.',
    talk: [{ who: 'merc', text: 'I served there. The depots are full. So are the guard posts.' }, { who: 'trader', text: 'Then we come back with rifles to sell.' }, { who: 'merc', text: 'We come back. Start there.' }],
    // Depots: big halls, long sightlines, sandbagged rooms held by people who never left them.
    site: { rooms: 'open', light: 0.05, posted: 0.6, cover: 1.3 },
    events: { patrol: 4, alarm: 2, gunfire: 2, seal: 1, blackout: 1, nine: 1 },
  },
  {
    id: 'kombinat', name: 'KOMBINAT ORBITAL', subtitle: 'CORPORATE STATION', planet: 'kombinat', danger: 4, cost: 4500,
    description: 'A research hub sold at auction during the Leaving. Corporate security guards what they don\'t understand.',
    loot: 'Technology, data, AI cores, valuables', hostiles: 'Corporate security',
    unlockHint: 'The station won\'t answer without a corporate security key. Shura can forge one from parts found down there.', enemies: { security: 7, soldier: 2, raider: 1 }, dangerMul: 1.15, minutes: 18, lootBonus: 0.75,
    why: 'Technology, data, AI cores: the most valuable salvage in the system, and the best guarded.',
    talk: [{ who: 'smuggler', text: 'Kombinat bought the station at auction. They pay guards to sit on it.' }, { who: 'hacker', text: 'and they keep a record of everything. including who visits.' }, { who: 'trader', text: 'Then don\'t be memorable.' }],
    // Clean, lit and watched: nowhere to hide in the light, and the restricted rooms are held.
    site: { light: 0.15, posted: 0.45, cover: 0.8 },
    events: { alarm: 4, seal: 3, patrol: 2, blackout: 1, gunfire: 1, nine: 1 },
  },
  {
    id: 'sirin', name: 'SIRIN', subtitle: 'SOURCE OF THE SIGNAL', planet: 'sirin', danger: 5, cost: 9000,
    description: 'The channel every Commonwealth node was listening to when the lights went out. Nobody who landed has reported back.',
    loot: 'Unknown', hostiles: 'Unknown',
    unlockHint: 'Nobody has these coordinates. Shura thinks something aboard Kombinat Orbital might.', enemies: { security: 5, soldier: 5 }, dangerMul: 1.3, minutes: 16, lootBonus: 0.9,
    why: 'Not salvage. Shura wants to know what is on the other end of channel nine.',
    talk: [{ who: 'medic', text: 'You don\'t have to go.' }, { who: 'hacker', text: 'I know.' }, { who: 'trader', text: 'Nobody has ever brought anything back from there to sell. Think about what that does to the price.' }],
    // Dark, and it talks.
    site: { light: -0.2, posted: 0.2 },
    events: { nine: 4, blackout: 3, seal: 2, patrol: 1, gunfire: 0, alarm: 0 },
  },
];

export const DESTINATION: Record<string, DestinationDef> = Object.fromEntries(DESTINATIONS.map((d) => [d.id, d]));
