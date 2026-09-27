export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export type ItemCategory =
  | 'scrap' | 'electronics' | 'fuel' | 'minerals' | 'alien' | 'food'
  | 'medical' | 'valuables' | 'technology' | 'documents';

export interface ItemDef {
  id: string;
  name: string;
  category: ItemCategory;
  rarity: Rarity;
  /** Sell value in Credits. */
  value: number;
  /** kg. Used by inventory limits (Phase 4). */
  weight: number;
  /** Atlas frame. */
  icon: string;
  description: string;
}

export const RARITY_COLOR: Record<Rarity, string> = {
  common: '#b8b2a2',
  uncommon: '#8fd18a',
  rare: '#5fb4ff',
  epic: '#c07bff',
  legendary: '#ffb238',
};

const item = (
  id: string, name: string, category: ItemCategory, rarity: Rarity,
  value: number, weight: number, description: string, icon = id,
): ItemDef => ({ id, name, category, rarity, value, weight, icon: `item_${icon}`, description });

export const ITEMS: Record<string, ItemDef> = Object.fromEntries(
  [
    item('scrap', 'Scrap Plating', 'scrap', 'common', 12, 2, 'Bent hull plating. Someone always buys metal.'),
    item('gear', 'Gear Assembly', 'scrap', 'common', 18, 1, 'Machined steel. Still turns.'),
    item('coil', 'Copper Coil', 'electronics', 'common', 25, 0.8, 'Salvaged wiring. Worth its weight.'),
    item('fan', 'Cooling Fan', 'electronics', 'common', 30, 1.2, 'Military-grade. Squeaks a little.'),
    item('rations', 'Canned Rations', 'food', 'common', 15, 0.5, 'Best before: unreadable.'),
    item('vodka', 'Vodka', 'food', 'common', 35, 0.7, 'Medicinal. Allegedly.'),
    item('fuel', 'Fuel Canister', 'fuel', 'common', 45, 4, 'Ship-grade propellant. Heavy.'),
    item('pills', 'Painkillers', 'medical', 'common', 40, 0.1, 'Blister pack, mostly full.'),
    item('circuit', 'Circuit Board', 'electronics', 'uncommon', 70, 0.4, 'Intact logic board.'),
    item('cell', 'Power Cell', 'fuel', 'uncommon', 90, 1, 'Still holds a charge.'),
    item('stim', 'Stim Injector', 'medical', 'uncommon', 110, 0.1, 'Combat stimulant. Do not ask what is in it.'),
    item('medkit', 'Field Medkit', 'medical', 'uncommon', 150, 1.5, 'Bandages, sutures, morphine.'),
    item('gold_ore', 'Gold Nuggets', 'minerals', 'uncommon', 120, 1, 'Raw gold. Refiners pay well.'),
    item('cryo', 'Cryo Crystal', 'minerals', 'uncommon', 140, 0.6, 'Cold to the touch. Always.'),
    item('skull', 'Humanoid Skull', 'alien', 'uncommon', 60, 1, 'A collector will want this. Probably.'),
    item('beast_skull', 'Beast Skull', 'alien', 'uncommon', 95, 2.5, 'Not from any known species.'),
    item('fungus', 'Luminous Fungus', 'alien', 'uncommon', 80, 0.3, 'Glows. Hacker says don\'t eat it.'),
    item('hdd', 'Hard Drive', 'technology', 'uncommon', 160, 0.5, 'Unencrypted, maybe.'),
    item('datachip', 'Data Chip', 'documents', 'uncommon', 180, 0.1, 'Corporate records.'),
    item('ruby', 'Ruby Cluster', 'minerals', 'rare', 320, 0.8, 'Deep red, flawless.'),
    item('sapphire', 'Sapphire Shard', 'minerals', 'rare', 380, 0.3, 'Cut and polished.'),
    item('emerald', 'Emerald', 'valuables', 'rare', 420, 0.2, 'Worth a month of fuel.'),
    item('ring', 'Gold Ring', 'valuables', 'rare', 350, 0.05, 'Engraved. The name is scratched out.'),
    item('watch', 'Pocket Watch', 'valuables', 'rare', 460, 0.2, 'Pre-collapse. Still ticking.'),
    item('gold_bar', 'Gold Bar', 'valuables', 'rare', 650, 1, 'Stamped with a dead bank\'s seal.'),
    item('terminal', 'Handheld Terminal', 'technology', 'rare', 520, 0.6, 'Military comms unit.'),
    item('keycard', 'Security Keycard', 'documents', 'rare', 300, 0.05, 'Clearance level unknown.'),
    item('painting', 'Old Painting', 'valuables', 'rare', 700, 2, 'Oil on canvas. Probably stolen.'),
    item('void', 'Void Crystal', 'minerals', 'epic', 1100, 0.7, 'Light bends around it.'),
    item('core', 'Reactor Core', 'technology', 'epic', 1300, 3, 'Warm. Do not lick.'),
    item('egg', 'Alien Egg', 'alien', 'epic', 1500, 3, 'Something moves inside.'),
    item('idol', 'Golden Idol', 'valuables', 'epic', 1800, 2, 'Solid gold. Unsettling smile.'),
    item('ai_core', 'AI Core', 'technology', 'epic', 2200, 1, 'Sentient? The Hacker will know.'),
    item('crown', 'Tsar\'s Crown', 'valuables', 'legendary', 5000, 1.5, 'Nobody knows how it got out here.'),
  ].map((i) => [i.id, i]),
);
