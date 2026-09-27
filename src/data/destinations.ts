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
  /** Who you meet down there, by weight. */
  enemies: Record<string, number>;
  /** Multiplier on enemy counts. */
  dangerMul: number;
}

export const DESTINATIONS: DestinationDef[] = [
  {
    id: 'tikhaya', name: 'TIKHAYA', subtitle: 'INDUSTRIAL MOON', planet: 'tikhaya', danger: 1, cost: 250,
    description: 'A green moon of tractor plants and ore mills. The Commonwealth\'s workshop, left running with nobody at the controls.',
    loot: 'Scrap, electronics, tools, provisions', hostiles: 'Scavenger gangs',
    unlockHint: '', enemies: { scavenger: 8, raider: 2 }, dangerMul: 0.85,
  },
  {
    id: 'merzlota', name: 'MERZLOTA', subtitle: 'FROZEN MINING WORLD', planet: 'merzlota', danger: 2, cost: 900,
    description: 'Deep-bore mines under a hundred metres of ice. The miners sealed themselves in when the heating failed.',
    loot: 'Minerals, crystals, fuel, mining tech', hostiles: 'Scavengers, raider crews',
    unlockHint: 'Fedya knows a mine foreman\'s coordinates. Earn his trust.', enemies: { scavenger: 4, raider: 6 }, dangerMul: 1,
  },
  {
    id: 'krasnaya', name: 'KRASNAYA PUSTOSH', subtitle: 'RED WASTE · MILITARY', planet: 'krasnaya', danger: 3, cost: 2200,
    description: 'Garrison depots in a red dust desert. The soldiers there never got the order to stand down.',
    loot: 'Weapons, ammunition, armor, orders', hostiles: 'Garrison remnants',
    unlockHint: 'Molot served on Krasnaya. He won\'t take you until you prove yourself.', enemies: { soldier: 8, raider: 2 }, dangerMul: 1.1,
  },
  {
    id: 'kombinat', name: 'KOMBINAT ORBITAL', subtitle: 'CORPORATE STATION', planet: 'kombinat', danger: 4, cost: 4500,
    description: 'A research hub bought out after the Collapse. Corporate security guards what they don\'t understand.',
    loot: 'Technology, data, AI cores, valuables', hostiles: 'Corporate security',
    unlockHint: 'Shura needs a security key before the station will even answer.', enemies: { security: 7, soldier: 2, raider: 1 }, dangerMul: 1.15,
  },
  {
    id: 'sirin', name: 'SIRIN', subtitle: 'SOURCE OF THE SIGNAL', planet: 'sirin', danger: 5, cost: 9000,
    description: 'The channel every Commonwealth node was listening to when the lights went out. Nobody who landed has reported back.',
    loot: 'Unknown', hostiles: 'Unknown',
    unlockHint: 'Nobody has these coordinates. Yet.', enemies: { security: 5, soldier: 5 }, dangerMul: 1.3,
  },
];

export const DESTINATION: Record<string, DestinationDef> = Object.fromEntries(DESTINATIONS.map((d) => [d.id, d]));
