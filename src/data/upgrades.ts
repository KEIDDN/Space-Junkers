import type { CrewId } from './crew';

/**
 * Ship work. Each upgrade costs Credits and salvage (so junk has a purpose), changes how
 * the game plays, and changes how the Lastochka looks.
 */

export interface UpgradeDef {
  id: string;
  name: string;
  /** Who does the work. */
  crew: CrewId;
  effect: string;
  description: string;
  cost: number;
  items: [string, number][];
  requires?: string[];
}

export const UPGRADES: UpgradeDef[] = [
  {
    id: 'stash1', name: 'Cargo Lockers', crew: 'trader',
    effect: '+6 stash rows',
    description: 'Weld the old ore lockers back to the cargo bay bulkhead. More room for your junk.',
    cost: 4500, items: [['scrap', 4], ['pipe', 2]],
  },
  {
    id: 'workbench', name: 'Armorer\'s Bench', crew: 'merc',
    effect: 'Molot repairs armor and helmets',
    description: 'A proper bench with a plate press. Dented armor stops fewer bullets.',
    cost: 6000, items: [['wrench', 1], ['multitool', 1], ['gear', 2]],
  },
  {
    id: 'scanner', name: 'Signal Scanner', crew: 'hacker',
    effect: 'Your HUD points to the extraction zone',
    description: 'Shura listens to the facility beacons from orbit and feeds the bearing to your helmet.',
    cost: 8000, items: [['radio', 1], ['circuit', 2], ['capacitor', 1]],
  },
  {
    id: 'lounge', name: 'Crew Lounge', crew: 'trader',
    effect: 'Every crew member +5 trust',
    description: 'Armchairs, a rug that used to be a bear, and somewhere to sit that isn\'t a crate.',
    cost: 3000, items: [['vodka', 2], ['cigs', 1]],
  },
  {
    id: 'reactor', name: 'Reactor Overhaul', crew: 'trader',
    effect: 'Fuel costs 30% less',
    description: 'New coolant loop, new cells. The reactor stops sounding like it\'s dying.',
    cost: 12000, items: [['cell', 2], ['coolant', 1], ['wires', 3]],
    requires: ['stash1'],
  },
  {
    id: 'stash2', name: 'Cargo Racks', crew: 'trader',
    effect: '+6 stash rows',
    description: 'Floor-to-ceiling racking. The cargo bay finally looks like a cargo bay.',
    cost: 14000, items: [['ingots', 3], ['tape', 3], ['gear', 4]],
    requires: ['stash1'],
  },
];

export const UPGRADE: Record<string, UpgradeDef> = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));
