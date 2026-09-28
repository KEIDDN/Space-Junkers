import { CALIBER_NAME, WEAPONS, type Caliber } from './weapons';

/**
 * Every object the player can own: loot, weapons, ammo, armor, backpacks, consumables.
 * One discriminated union so the inventory, shops, loot tables and quests all speak
 * the same language. Tuning lives here.
 */

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export type ItemCategory =
  | 'scrap' | 'electronics' | 'fuel' | 'minerals' | 'alien' | 'food' | 'medical'
  | 'valuables' | 'technology' | 'documents' | 'tools'
  | 'weapons' | 'ammo' | 'gear';

export type ItemKind = 'loot' | 'weapon' | 'ammo' | 'armor' | 'helmet' | 'backpack' | 'med' | 'grenade' | 'key';

interface BaseItem {
  id: string;
  name: string;
  /** Label shown on the inventory tile (≤ 10 chars). */
  short: string;
  kind: ItemKind;
  category: ItemCategory;
  rarity: Rarity;
  /** Base value in Credits. Vendors buy below it and sell above it. */
  value: number;
  /** kg */
  weight: number;
  /** Footprint in inventory cells. */
  w: number;
  h: number;
  /**
   * Max units per stack (1 = doesn't stack). Deliberately per item: ammo and small field
   * dressings stack, loot doesn't, so what you carry home still costs space.
   */
  stack: number;
  /** Atlas frame. */
  icon: string;
  description: string;
  /**
   * Taken from one place for one contract: never sold aboard, never rolled in a container,
   * and no trader will buy it (see data/objectives.ts).
   */
  quest?: boolean;
}

export interface LootDef extends BaseItem { kind: 'loot' }
export interface WeaponItemDef extends BaseItem {
  kind: 'weapon';
  weapon: string;
  /** Small enough for the holster (secondary) slot. */
  holster: boolean;
}
export interface AmmoDef extends BaseItem {
  kind: 'ammo';
  caliber: Caliber;
  damageMul: number;
  /** Armor penetration class. Beats armor of equal or lower class. */
  pen: number;
  /** Overrides the weapon's pellet count (slugs). */
  pellets?: number;
  /** Multiplier on spread (slugs are tighter). */
  spreadMul?: number;
}
export interface ArmorDef extends BaseItem {
  kind: 'armor' | 'helmet';
  /** Protection class 1..5. */
  cls: number;
  /** Durability points. Broken armor still helps a little. */
  durability: number;
  /** Movement multiplier while worn. */
  speedMul: number;
}
export interface BackpackDef extends BaseItem { kind: 'backpack'; grid: { w: number; h: number } }
export interface MedDef extends BaseItem {
  kind: 'med';
  /**
   * Health one unit restores when used. A property of the item type, never of the stack:
   * using one unit removes it from the stack (quantity - 1); `heal` stays what it is.
   */
  heal: number;
  /** Seconds to apply. You can't shoot while doing it. */
  useTime: number;
  stopsBleed: boolean;
  /** Healing over time after use. */
  regen?: { hp: number; seconds: number };
  /** Temporary movement boost. */
  boost?: { speedMul: number; seconds: number };
}
export interface GrenadeDef extends BaseItem { kind: 'grenade'; effect: 'frag' | 'smoke' }
export interface KeyDef extends BaseItem { kind: 'key'; opens: 'vault'; uses: number }

export type ItemDef = LootDef | WeaponItemDef | AmmoDef | ArmorDef | BackpackDef | MedDef | GrenadeDef | KeyDef;

export const RARITY_COLOR: Record<Rarity, string> = {
  common: '#b8b2a2',
  uncommon: '#8fd18a',
  rare: '#5fb4ff',
  epic: '#c07bff',
  legendary: '#ffb238',
};

export const RARITY_ORDER: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 };

export const CATEGORY_NAME: Record<ItemCategory, string> = {
  scrap: 'Scrap', electronics: 'Electronics', fuel: 'Fuel', minerals: 'Minerals', alien: 'Xenobiology',
  food: 'Provisions', medical: 'Medical', valuables: 'Valuables', technology: 'Technology',
  documents: 'Documents', tools: 'Tools', weapons: 'Weapons', ammo: 'Ammunition', gear: 'Equipment',
};

// ---------------------------------------------------------------------------
// Builders

type Size = [number, number];

function loot(
  id: string, name: string, short: string, category: ItemCategory, rarity: Rarity,
  value: number, weight: number, size: Size, description: string,
): LootDef {
  return { id, name, short, kind: 'loot', category, rarity, value, weight, w: size[0], h: size[1], stack: 1, icon: `item_${id}`, description };
}

function weapon(id: string, short: string, rarity: Rarity, value: number, weight: number, size: Size, description: string): WeaponItemDef {
  const def = WEAPONS[id];
  const holster = def.archetype === 'pistol' || id === 'kedr';
  return {
    id, name: def.name, short, kind: 'weapon', category: 'weapons', rarity, value, weight,
    w: size[0], h: size[1], stack: 1, icon: `item_${id}`, description, weapon: id, holster,
  };
}

function ammo(
  id: string, name: string, short: string, caliber: Caliber, rarity: Rarity, valuePerRound: number,
  stack: number, pen: number, damageMul: number, description: string, extra: Partial<AmmoDef> = {},
): AmmoDef {
  return {
    id, name, short, kind: 'ammo', category: 'ammo', rarity, value: valuePerRound, weight: 0.012,
    w: 1, h: 1, stack, icon: `item_${id}`, description: `${CALIBER_NAME[caliber]}. ${description}`,
    caliber, pen, damageMul, ...extra,
  };
}

function armor(
  id: string, kind: 'armor' | 'helmet', name: string, short: string, rarity: Rarity, value: number,
  weight: number, size: Size, cls: number, durability: number, speedMul: number, description: string,
): ArmorDef {
  return {
    id, name, short, kind, category: 'gear', rarity, value, weight, w: size[0], h: size[1], stack: 1,
    icon: `item_${id}`, description, cls, durability, speedMul,
  };
}

function backpack(
  id: string, name: string, short: string, rarity: Rarity, value: number, weight: number,
  size: Size, grid: Size, description: string,
): BackpackDef {
  return {
    id, name, short, kind: 'backpack', category: 'gear', rarity, value, weight, w: size[0], h: size[1],
    stack: 1, icon: `item_${id}`, description, grid: { w: grid[0], h: grid[1] },
  };
}

function med(
  id: string, name: string, short: string, rarity: Rarity, value: number, weight: number, size: Size,
  heal: number, useTime: number, stopsBleed: boolean, description: string, extra: Partial<MedDef> = {},
): MedDef {
  return {
    id, name, short, kind: 'med', category: 'medical', rarity, value, weight, w: size[0], h: size[1],
    stack: 1, icon: `item_${id}`, description, heal, useTime, stopsBleed, ...extra,
  };
}

// ---------------------------------------------------------------------------
// Catalog

const CATALOG: ItemDef[] = [
  // --- Scrap & salvage (crafting materials for ship work) ----------------------
  loot('scrap', 'Scrap Plating', 'Scrap', 'scrap', 'common', 18, 2, [1, 1], 'Bent hull plating. Someone always buys metal. Fedya uses it to patch the ship.'),
  loot('pipe', 'Pipe Fitting', 'Pipe', 'scrap', 'common', 22, 1.5, [1, 1], 'Threaded steel elbow. The ship eats these.'),
  loot('gear', 'Gear Assembly', 'Gears', 'scrap', 'common', 30, 1, [1, 1], 'Machined steel. Still turns.'),
  loot('tape', 'Duct Tape', 'Tape', 'tools', 'common', 45, 0.3, [1, 1], 'Holds the Lastochka together. Literally.'),
  loot('wires', 'Wire Bundle', 'Wires', 'electronics', 'common', 40, 0.6, [1, 1], 'Stripped from a wall. Colour-coded by someone who cared.'),
  loot('ingots', 'Alloy Ingots', 'Ingots', 'scrap', 'uncommon', 190, 3, [1, 1], 'Refinery-grade. Heavy for its size.'),
  loot('wrench', 'Gas Wrench', 'Wrench', 'tools', 'common', 60, 0.8, [1, 1], 'Stamped "PROPERTY OF KOMBINAT-3". Not any more.'),
  loot('multitool', 'Multitool', 'Multitool', 'tools', 'uncommon', 110, 0.3, [1, 1], 'Seventeen tools, all of them slightly wrong.'),
  loot('toolcase', 'Technician\'s Case', 'Toolcase', 'tools', 'rare', 520, 3.5, [2, 1], 'Full set of calibrated drivers. Molot says they are "for nerds".'),

  // --- Electronics & technology ------------------------------------------------
  loot('coil', 'Copper Coil', 'Coil', 'electronics', 'common', 35, 0.8, [1, 1], 'Salvaged winding. Worth its weight.'),
  loot('fan', 'Cooling Fan', 'Fan', 'electronics', 'common', 38, 1.2, [1, 1], 'Military grade. Squeaks a little.'),
  loot('battery', 'Battery Pack', 'Battery', 'electronics', 'common', 40, 0.5, [1, 1], 'Lead-acid. Leaks if you look at it wrong.'),
  loot('cable', 'Cable Spool', 'Cable', 'electronics', 'common', 55, 1.4, [1, 1], 'Fifty metres of shielded cable.'),
  loot('capacitor', 'Capacitor Drum', 'Capacitor', 'electronics', 'uncommon', 150, 1.6, [1, 1], 'Don\'t touch the terminals. Seriously.'),
  loot('circuit', 'Circuit Board', 'Circuit', 'electronics', 'uncommon', 95, 0.4, [1, 1], 'Intact logic board, hand-soldered.'),
  loot('motor', 'Servo Motor', 'Servo', 'technology', 'uncommon', 260, 1.5, [1, 1], 'Precision actuator from an assembly arm.'),
  loot('cell', 'Power Cell', 'P.Cell', 'fuel', 'uncommon', 170, 1, [1, 1], 'Still holds a charge. Hums faintly.'),
  loot('camera', 'Zenit Camera', 'Camera', 'electronics', 'uncommon', 240, 0.8, [1, 1], 'Film inside: eleven exposures. Shura wants to develop them.'),
  loot('seccam', 'Security Camera', 'SecCam', 'technology', 'uncommon', 190, 1.2, [1, 1], 'Pried off a wall. The lens is cracked but the chip is good.'),
  loot('pocketpc', 'Elektronika PK-8', 'PK-8', 'technology', 'uncommon', 230, 0.4, [1, 1], 'Pocket computer. Plays exactly one game.'),
  loot('radio', 'Field Transceiver', 'Radio', 'technology', 'uncommon', 280, 1.1, [1, 1], 'Tuned to a garrison channel. Only static now.'),
  loot('tablet', 'Data Tablet', 'Tablet', 'technology', 'uncommon', 320, 0.7, [1, 1], 'Cracked screen, working battery, locked.'),
  loot('hdd', 'Hard Drive', 'HDD', 'technology', 'uncommon', 210, 0.5, [1, 1], 'Unencrypted, maybe.'),
  loot('geiger', 'DP-5 Dosimeter', 'Dosimeter', 'electronics', 'rare', 480, 1.2, [1, 1], 'The needle still twitches. Don\'t think about why.'),
  loot('diagpad', 'Diagnostic Pad', 'DiagPad', 'technology', 'rare', 560, 0.6, [1, 1], 'Reads reactor telemetry. Hackers love these.'),
  loot('terminal', 'Handheld Terminal', 'Terminal', 'technology', 'rare', 620, 0.6, [1, 1], 'Military comms unit with its crypto module intact.'),
  loot('optic', 'Optical Module', 'Optic', 'technology', 'rare', 680, 0.9, [1, 1], 'Targeting optic from a turret. Precision glass.'),
  loot('server', 'Server Blade', 'Blade', 'technology', 'rare', 950, 2.2, [1, 2], 'Pulled hot from a rack. Commonwealth data, if it spins up.'),
  loot('droneeye', 'Drone Eye', 'DroneEye', 'technology', 'rare', 880, 1, [1, 1], 'Sensor turret from a security drone. Still looking.'),
  loot('core', 'Reactor Core', 'R.Core', 'technology', 'epic', 1700, 4, [2, 2], 'Warm. Do not lick. Do not drop.'),
  loot('ai_core', 'AI Core', 'AI Core', 'technology', 'epic', 2600, 1, [1, 1], 'A thinking cube. Shura swears it blinked.'),

  // --- Fuel & chemicals ---------------------------------------------------------
  loot('fuel', 'Fuel Canister', 'Fuel', 'fuel', 'common', 120, 5, [2, 2], 'Ship-grade propellant. Heavy, bulky, always needed.'),
  loot('oxygen', 'Oxygen Canister', 'O2', 'fuel', 'common', 70, 2.5, [1, 2], 'Half full. Or half empty.'),
  loot('coolant', 'Coolant Cylinder', 'Coolant', 'fuel', 'uncommon', 170, 3, [2, 1], 'Cryogenic coolant. Frost forms where you hold it.'),
  loot('reagent', 'Reagent Bottle', 'Reagent', 'medical', 'uncommon', 130, 0.6, [1, 1], 'Label says ОПАСНО. Probably means expensive.'),

  // --- Minerals -------------------------------------------------------------------
  loot('iron_ore', 'Iron Ore', 'Iron', 'minerals', 'common', 28, 2, [1, 1], 'Rust-red rock. Refineries buy it by the tonne.'),
  loot('copper_ore', 'Copper Ore', 'Copper', 'minerals', 'common', 45, 2, [1, 1], 'Green-veined. Still has survey paint on it.'),
  loot('gold_ore', 'Gold Nuggets', 'Gold Ore', 'minerals', 'uncommon', 160, 1, [1, 1], 'Raw gold. Refiners pay well.'),
  loot('verdite', 'Verdite Crystal', 'Verdite', 'minerals', 'uncommon', 140, 0.6, [1, 1], 'Grows in old mine shafts. Nobody knows how.'),
  loot('cryo', 'Cryo Crystal', 'Cryo', 'minerals', 'uncommon', 180, 0.6, [1, 1], 'Cold to the touch. Always.'),
  loot('amethyst', 'Amethyst Geode', 'Amethyst', 'minerals', 'uncommon', 200, 1.2, [1, 1], 'Split open by a mining charge.'),
  loot('frost_quartz', 'Frost Quartz', 'F.Quartz', 'minerals', 'uncommon', 230, 0.8, [1, 1], 'Only forms below minus eighty.'),
  loot('ruby', 'Ruby Cluster', 'Ruby', 'minerals', 'rare', 380, 0.8, [1, 1], 'Deep red, flawless.'),
  loot('sapphire', 'Sapphire Shard', 'Sapphire', 'minerals', 'rare', 440, 0.3, [1, 1], 'Cut and polished by someone patient.'),
  loot('fire_opal', 'Fire Opal', 'F.Opal', 'minerals', 'rare', 560, 0.4, [1, 1], 'Flickers like it is thinking about burning.'),
  loot('iridium', 'Iridium Shards', 'Iridium', 'minerals', 'rare', 640, 0.9, [1, 1], 'Ship-armour grade. The black market pays in cash.'),
  loot('void', 'Void Crystal', 'Void', 'minerals', 'epic', 1400, 0.7, [1, 1], 'Light bends around it. Radios whine near it.'),

  // --- Xenobiology -----------------------------------------------------------------
  loot('bone', 'Femur', 'Bone', 'alien', 'common', 20, 0.8, [1, 1], 'Human. You try not to think about it.'),
  loot('rustcap', 'Rustcap Mushroom', 'Rustcap', 'alien', 'common', 40, 0.2, [1, 1], 'Grows on corroded steel. Tastes like pennies.'),
  loot('skull', 'Humanoid Skull', 'Skull', 'alien', 'uncommon', 80, 1, [1, 1], 'A collector will want this. Probably.'),
  loot('fungus', 'Luminous Fungus', 'Fungus', 'alien', 'uncommon', 110, 0.3, [1, 1], 'Glows. Shura says don\'t eat it. Shura has eaten it.'),
  loot('ribcage', 'Rib Cage', 'Ribcage', 'alien', 'uncommon', 130, 2, [2, 1], 'Too many ribs for anything from Earth.'),
  loot('hide', 'Xeno Hide', 'Hide', 'alien', 'uncommon', 240, 2.5, [2, 2], 'Tough as rubber. Smells worse.'),
  loot('beast_skull', 'Beast Skull', 'B.Skull', 'alien', 'uncommon', 150, 2.5, [2, 2], 'Not from any known species.'),
  loot('scales', 'Scaled Hide', 'Scales', 'alien', 'rare', 480, 1.5, [2, 1], 'Each scale is a perfect hexagon.'),
  loot('tusk', 'Xeno Tusk', 'Tusk', 'alien', 'rare', 540, 2, [2, 1], 'Spiral grain, like it grew in a lathe.'),
  loot('gland', 'Spined Gland', 'Gland', 'alien', 'rare', 720, 0.5, [1, 1], 'Pulses when held. Sell it fast.'),
  loot('egg', 'Xeno Egg', 'Egg', 'alien', 'epic', 1900, 3, [2, 2], 'Something moves inside. Dr. Sokolova wants it. Badly.'),
  loot('specimen', 'Preserved Specimen', 'Specimen', 'alien', 'epic', 2100, 3.5, [2, 2], 'Dead. Mostly.'),

  // --- Provisions --------------------------------------------------------------------
  loot('rations', 'Canned Rations', 'Rations', 'food', 'common', 22, 0.5, [1, 1], 'Best before: unreadable.'),
  loot('stew', 'Tushonka', 'Tushonka', 'food', 'common', 30, 0.5, [1, 1], 'Canned beef stew. Galactic currency in some sectors.'),
  loot('milk', 'Condensed Milk', 'Sgushch.', 'food', 'common', 35, 0.4, [1, 1], 'Sweet enough to restart a heart.'),
  loot('vodka', 'Vodka', 'Vodka', 'food', 'common', 50, 0.7, [1, 1], 'Medicinal. Allegedly.'),
  loot('cigs', 'Belomor Cigarettes', 'Belomor', 'food', 'uncommon', 75, 0.1, [1, 1], 'Traders take them before cash.'),

  // --- Medical supplies (loot, not consumables) ----------------------------------------
  loot('antiseptic', 'Antiseptic', 'Antisept.', 'medical', 'common', 70, 0.4, [1, 1], 'Burns like vodka. Works better.'),
  loot('antibiotics', 'Antibiotics', 'Antibiot.', 'medical', 'uncommon', 190, 0.1, [1, 1], 'Sealed. Worth more than the guns in some colonies.'),

  // --- Valuables -----------------------------------------------------------------------
  loot('coin', 'Commonwealth Ruble', 'Ruble', 'valuables', 'uncommon', 95, 0.05, [1, 1], 'A coin from a state that no longer exists.'),
  loot('coinroll', 'Coin Roll', 'Coin Roll', 'valuables', 'uncommon', 230, 0.4, [1, 1], 'Someone was saving up.'),
  loot('compass', 'Brass Compass', 'Compass', 'valuables', 'uncommon', 260, 0.2, [1, 1], 'Points at nothing in particular out here.'),
  loot('ring', 'Gold Ring', 'Ring', 'valuables', 'rare', 380, 0.05, [1, 1], 'Engraved. The name is scratched out.'),
  loot('watch', 'Pocket Watch', 'Watch', 'valuables', 'rare', 520, 0.2, [1, 1], 'Pre-Collapse. Still ticking.'),
  loot('chain', 'Gold Chain', 'Chain', 'valuables', 'rare', 590, 0.1, [1, 1], 'Heavy links. Somebody\'s pension.'),
  loot('emerald', 'Emerald', 'Emerald', 'valuables', 'rare', 620, 0.2, [1, 1], 'Worth a month of fuel.'),
  loot('gold_bar', 'Gold Bar', 'Gold Bar', 'valuables', 'rare', 780, 1, [1, 1], 'Stamped with a dead bank\'s seal.'),
  loot('jewelbox', 'Jewellery Box', 'Jewels', 'valuables', 'rare', 820, 1.2, [2, 1], 'Locked. Rattles promisingly.'),
  loot('landscape', 'Landscape Painting', 'Painting', 'valuables', 'rare', 700, 2, [2, 2], 'A birch forest on a planet nobody remembers.'),
  loot('painting', 'Portrait in Oil', 'Portrait', 'valuables', 'epic', 1300, 2, [2, 2], 'A Commonwealth admiral. Probably stolen twice already.'),
  loot('chalice', 'Golden Chalice', 'Chalice', 'valuables', 'epic', 1500, 1.2, [1, 2], 'Officers\' mess silverware, but gold.'),
  loot('idol', 'Golden Idol', 'Idol', 'valuables', 'epic', 2000, 2, [1, 2], 'Solid gold. Unsettling smile.'),
  loot('crown', 'Governor\'s Crown', 'Crown', 'valuables', 'legendary', 7500, 1.5, [2, 1], 'Made for the first governor of Otets. Everyone says it was melted down in the Leaving. Nobody should know you have it.'),

  // --- Documents -------------------------------------------------------------------------
  loot('orders', 'Sealed Orders', 'Orders', 'documents', 'uncommon', 180, 0.1, [1, 1], 'Stamped СЕКРЕТНО. Probably boring. Probably.'),
  loot('datachip', 'Data Chip', 'DataChip', 'documents', 'uncommon', 220, 0.1, [1, 1], 'Corporate records. Shura pays for these.'),
  loot('cryptdrive', 'Encrypted Drive', 'CryptDrv', 'documents', 'rare', 900, 0.2, [1, 1], 'Military-grade encryption. Somebody wanted this hidden.'),

  // --- Weapons ------------------------------------------------------------------------------
  weapon('sp5', 'SP-5', 'common', 450, 0.9, [2, 1], 'Rusted service pistol. Jams when it feels like it.'),
  weapon('pm9', 'PM-9', 'common', 1200, 0.8, [2, 1], 'The Commonwealth\'s sidearm. Nine rounds, never complains.'),
  weapon('kedr', 'Kedr-9', 'uncommon', 2400, 1.6, [2, 1], 'Machine pistol. Empties a magazine before you finish swearing.'),
  weapon('ppd41', 'PPD-41', 'uncommon', 3800, 3.6, [3, 2], 'Drum-fed submachine gun. Heavy, reliable, loud.'),
  weapon('obrez', 'Obrez', 'common', 900, 2.2, [3, 1], 'Sawn-off double barrel. Two shells, one opinion.'),
  weapon('toz12', 'TOZ-12', 'uncommon', 2800, 3.4, [4, 1], 'Pump shotgun. Clears rooms. Clears ears.'),
  weapon('skv', 'SKV', 'uncommon', 3600, 3.3, [4, 1], 'Semi-automatic carbine. Accurate, honest, cheap to feed.'),
  weapon('akr74', 'AKR-74', 'rare', 7800, 3.5, [4, 2], 'The rifle every soldier in the Commonwealth carried. Still the best trade on the Belt.'),
  weapon('vektor', 'Vektor-7', 'epic', 16500, 3.4, [3, 2], 'Corporate bullpup. Clean, fast and very expensive to lose.'),
  weapon('mosin', 'Mosin-K', 'uncommon', 3200, 4.2, [5, 1], 'Bolt-action. One shot, one argument settled.'),
  weapon('svk', 'SVK', 'epic', 12500, 4.8, [5, 2], 'Designated marksman rifle. Ten rounds of bad news at any range.'),

  // --- Ammunition ----------------------------------------------------------------------------
  ammo('ammo_9x18', '9×18 PST', '9x18 PST', '9x18', 'common', 6, 60, 1, 1, 'Pistol and SMG round. Steel core, soft opinion of armor.'),
  ammo('ammo_9x18_ap', '9×18 PBM', '9x18 AP', '9x18', 'uncommon', 18, 60, 3, 0.95, 'Armor-piercing pistol round. Punches through light vests.'),
  ammo('ammo_12buck', '12ga Buckshot', '12 Buck', '12ga', 'common', 12, 20, 1, 1, 'Nine pellets. Devastating up close, useless far.'),
  ammo('ammo_12slug', '12ga Slug', '12 Slug', '12ga', 'uncommon', 24, 20, 3, 6.5, 'One heavy slug. Breaks armor and bones.', { pellets: 1, spreadMul: 0.12 }),
  ammo('ammo_545', '5.45 PS', '5.45 PS', '545', 'common', 14, 60, 3, 1, 'Standard rifle round.'),
  ammo('ammo_545_ap', '5.45 BP', '5.45 BP', '545', 'rare', 38, 60, 5, 1, 'Hardened penetrator. For people who wear too much armor.'),
  ammo('ammo_762', '7.62 LPS', '7.62 LPS', '762', 'uncommon', 26, 40, 4, 1, 'Full-power rifle cartridge.'),
  ammo('ammo_762_ap', '7.62 SNB', '7.62 SNB', '762', 'rare', 62, 40, 6, 1.05, 'Sniper-grade armor piercing. Nothing stops it.'),

  // --- Armor -----------------------------------------------------------------------------------
  armor('respcap', 'helmet', 'Padded Cap & Respirator', 'RespCap', 'common', 350, 0.8, [2, 2], 1, 30, 1, 'Quilted cap with a filter mask. Stops dust and, sometimes, pistol rounds.'),
  armor('k6helmet', 'helmet', 'K-6 Steel Helmet', 'K-6', 'uncommon', 2200, 1.3, [2, 2], 2, 45, 0.99, 'Pressed steel with a gas-mask mount.'),
  armor('zaslon', 'helmet', 'Zaslon Assault Helmet', 'Zaslon', 'rare', 9500, 2.4, [2, 2], 4, 60, 0.97, 'Full-face assault helmet. You breathe loudly in it.'),
  armor('vest_ps2', 'armor', 'PS-2 Soft Vest', 'PS-2', 'common', 1800, 3, [3, 3], 2, 50, 0.98, 'Kevlar panels in a canvas cover. Better than a shirt.'),
  armor('vest_zhuk', 'armor', 'Zhuk-3 Plate Carrier', 'Zhuk-3', 'uncommon', 7200, 6.5, [3, 3], 3, 70, 0.95, 'Steel plates front and back. Stops rifle rounds, mostly.'),
  armor('vest_granit', 'armor', 'Granit-4 Heavy Armor', 'Granit-4', 'rare', 19000, 10, [3, 3], 4, 95, 0.88, 'Ceramic assault armor. Walk slow, live long.'),

  // --- Backpacks -------------------------------------------------------------------------------
  backpack('sack', 'Veshmeshok Sack', 'Sack', 'common', 450, 0.5, [2, 2], [3, 3], 'A canvas bag with a drawstring. Holds more than your pockets.'),
  backpack('daypack', 'RD-54 Daypack', 'RD-54', 'uncommon', 2100, 1.2, [3, 3], [4, 4], 'Paratrooper pack. Snug, quiet, reliable.'),
  backpack('turist', 'Turist-60 Rucksack', 'Turist', 'uncommon', 4800, 1.8, [3, 3], [5, 5], 'Expedition rucksack. Fits a rifle, if you\'re creative.'),
  backpack('raidpack', 'Beta-7 Raid Pack', 'Beta-7', 'rare', 11500, 2.6, [3, 3], [6, 6], 'Military cargo frame. For people who plan on greed.'),

  // --- Medical consumables -----------------------------------------------------------------------
  med('bandage', 'Bandage', 'Bandage', 'common', 60, 0.1, [1, 1], 6, 2.2, true, 'Stops bleeding. Restores a little health.', { stack: 10 }),
  med('pills', 'Analgin Painkillers', 'Analgin', 'common', 320, 0.1, [1, 1], 0, 1.4, false, 'Slowly restores 30 health over twenty seconds.', { regen: { hp: 30, seconds: 20 } }),
  med('carkit', 'Automedik Kit', 'Automedik', 'common', 950, 0.6, [1, 1], 60, 3, true, 'Glovebox first-aid kit. One kit stops bleeding and restores 60 health.', { stack: 5 }),
  med('medkit', 'Sanitar Field Medkit', 'Sanitar', 'uncommon', 1500, 1.5, [2, 1], 80, 3.2, true, 'Military trauma kit. One kit stops bleeding and restores 80 health.', { stack: 5 }),
  med('stim', 'Adrenal-M Stimulant', 'Adrenal', 'uncommon', 1600, 0.1, [1, 1], 15, 0.9, false, 'Combat stim. Quick health and a burst of speed. Side effects: yes.', { boost: { speedMul: 1.18, seconds: 25 }, regen: { hp: 20, seconds: 8 } }),
  med('surgkit', 'Surgical Kit', 'Surgical', 'rare', 5200, 2, [2, 1], 100, 7, true, 'Full field surgery. Restores 100 health, but takes a long time.'),

  // --- Throwables ---------------------------------------------------------------------------------
  { id: 'frag', name: 'RGN-7 Frag Grenade', short: 'RGN-7', kind: 'grenade', category: 'gear', rarity: 'uncommon', value: 900, weight: 0.4, w: 1, h: 1, stack: 1, icon: 'item_frag', description: 'Fragmentation grenade. Two-second fuse. Everyone hears it.', effect: 'frag' },
  { id: 'smoke', name: 'RDG-3 Smoke Grenade', short: 'RDG-3', kind: 'grenade', category: 'gear', rarity: 'common', value: 400, weight: 0.4, w: 1, h: 1, stack: 1, icon: 'item_smoke', description: 'Thick grey smoke for twenty seconds. Nobody sees through it.', effect: 'smoke' },

  // --- Contract goods: each one comes off a particular wall in a particular kind of place ---------
  { ...loot('regulator', 'Pump Regulator', 'Regulator', 'technology', 'rare', 380, 2.5, [2, 1], 'The part the Lastochka\'s coolant pump has been dying for. Every service station on Tikhaya ran the same pump.'), icon: 'item_motor', quest: true },
  { ...loot('kamenev_tin', 'Kamenev\'s Tin', 'Tin', 'documents', 'uncommon', 40, 0.6, [2, 1], 'A biscuit tin from locker 41. Letters to a brother on Merzlota, never posted. A photograph of two boys on a tractor.'), icon: 'item_jewelbox', quest: true },
  { ...loot('flight_recorder', 'Vesna Flight Recorder', 'Recorder', 'technology', 'rare', 600, 3, [1, 1], 'Orange, dented, still ticking on its own battery. Whatever happened to the Vesna is on it.'), icon: 'item_radio', quest: true },
  { ...loot('grow_lamp', 'Grow Lamp', 'GrowLamp', 'technology', 'uncommon', 210, 1.2, [1, 2], 'A greenhouse lamp with its bulb intact. Rarer than gold on this side of the Belt.'), icon: 'item_cell', quest: true },
  { ...loot('sample_case', 'Sealed Sample Case', 'Samples', 'alien', 'epic', 900, 3, [2, 2], 'Kombinat biohazard seal, unbroken. It is heavier on one side, and the heavy side moves.'), icon: 'item_specimen', quest: true },

  // --- Keys ------------------------------------------------------------------------------------------
  { id: 'keycard', name: 'Vault Keycard', short: 'Keycard', kind: 'key', category: 'technology', rarity: 'rare', value: 1400, weight: 0.05, w: 1, h: 1, stack: 1, icon: 'item_keycard', description: 'Red security clearance. Opens a facility vault. It wears out after 3 uses.', opens: 'vault', uses: 3 },
];

export const ITEMS: Record<string, ItemDef> = Object.fromEntries(CATALOG.map((i) => [i.id, i]));

export function itemDef(id: string): ItemDef {
  const d = ITEMS[id];
  if (!d) throw new Error(`Unknown item "${id}"`);
  return d;
}

export function isAmmo(d: ItemDef): d is AmmoDef {
  return d.kind === 'ammo';
}

/** The item id for a weapon definition (they share ids). */
export function weaponItem(weaponId: string): WeaponItemDef {
  return ITEMS[weaponId] as WeaponItemDef;
}

/** Default ammo for a caliber (the cheapest round). */
export function defaultAmmo(caliber: Caliber): AmmoDef {
  let best: AmmoDef | null = null;
  for (const d of CATALOG) if (d.kind === 'ammo' && d.caliber === caliber && (!best || d.value < best.value)) best = d;
  return best!;
}
