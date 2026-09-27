import { Container, Graphics, Sprite } from 'pixi.js';
import { tex } from '../engine/assets';
import type { AudioService } from '../engine/audio';
import { TILE } from '../engine/config';
import type { Input } from '../engine/input';
import { Rng } from '../engine/rng';
import { CONTAINERS, rollContainer } from '../data/loot';
import { ITEMS, type ItemCategory } from '../data/items';
import { loadoutItems, type Grid } from '../core/inventory';
import { raid, useRaid } from '../state/raidStore';
import type { DoorDef, ExitDef, TileMap } from './world/tilemap';

const REACH = 40; // px from player to lootable
const CLOSE_DIST = 64; // walking this far from an open container closes it
const EXTRACT_TIME = 12; // seconds holding the pad
const LIFT_TIME = 7; // seconds riding the lift up
const ALARM_INTERVAL = 4;
const ALARM_RADIUS = 720;
const BREAKER_TIME = 2.4;
const SWIPE_TIME = 1.2;

export type LootKind = 'container' | 'body' | 'pile';

interface Lootable {
  id: string;
  kind: LootKind;
  label: string;
  /** Current interaction point (bodies can slide). */
  pos(): { x: number; y: number };
  /** Seconds to search the first time (0 = open immediately). */
  searchTime: number;
  searched: boolean;
  sprite: Sprite | null;
  /** Rolls the contents the first time it's opened. */
  roll(): Grid;
  /** Rest position of the sprite, and a short bump when it's opened. */
  home?: { x: number; y: number };
  bump?: number;
}

export interface InteractionEvents {
  onNoise(x: number, y: number, radius: number): void;
  onLight(x: number, y: number, radius: number, color: number, intensity: number, life?: number): void;
  onExtracted(): void;
  /** The pad alarm started: everyone in the facility knows where you'll be. */
  onSignal?(x: number, y: number): void;
  /** A keycard opened a security door. */
  onUnlock?(door: DoorDef): void;
  /** The player sat down at a terminal. */
  onTerminal?(entry: number): void;
}

/** Something you hold E at that isn't a container: breakers, security doors, terminals. */
interface Fixture {
  kind: 'breaker' | 'lock' | 'terminal';
  x: number;
  y: number;
  exit?: ExitDef;
  door?: DoorDef;
  entry?: number;
  done: boolean;
}

export interface InteractionView {
  prompt: string | null;
  countdown: number | null;
  inZone: boolean;
}

/**
 * Player-world interactions: searching containers and bodies (hold E), opening searched
 * ones and item piles (E), and extraction (E in the zone starts a countdown that sounds an
 * alarm; stay in the zone to leave).
 */
export class Interactions {
  /** World-space UI (progress bars, zone markings) drawn above the darkness. */
  readonly overlay = new Container();

  private lootables: Lootable[] = [];
  private fixtures: Fixture[] = [];
  private bar = new Graphics();
  private liftLamps = new Graphics();
  private searching: Lootable | Fixture | null = null;
  private progress = 0;
  private rummageTimer = 0;
  private extractRemaining: number | null = null;
  private liftRemaining: number | null = null;
  private liftHum = 0;
  private powered = new Set<ExitDef>();
  private alarmTimer = 0;
  private beaconTimer = 0;
  private sweepTimer = 0;
  private sweepStep = 0;
  private done = false;
  private pileCount = 0;

  /**
   * @param layer depth-sorted actor layer; container and pile sprites go in it.
   * @param lootMul the facility theme's loot category multipliers.
   */
  constructor(
    private map: TileMap, private audio: AudioService, private ev: InteractionEvents, private layer: Container,
    lootMul: Partial<Record<ItemCategory, number>> = {},
  ) {
    map.containers.forEach((place, i) => {
      const def = CONTAINERS[place.type];
      const sprite = new Sprite(tex(def.sprite));
      sprite.anchor.set(0.5, 1);
      const x = place.tx * TILE + TILE / 2;
      const y = place.ty * TILE + TILE - 3;
      sprite.position.set(x, place.flat ? y + 2 : y);
      // Remains lie on the floor: under everyone walking past.
      sprite.zIndex = place.flat ? y - 100000 : y;
      if (place.flat) sprite.tint = 0xb4aca4;
      this.layer.addChild(sprite);
      const seed = (map.seed * 7919 + i * 104729) >>> 0;
      this.lootables.push({
        id: `c${i}`, kind: 'container', label: def.label, pos: () => ({ x, y: place.flat ? y - 4 : y - 10 }),
        searchTime: def.searchTime, searched: false, sprite, home: { x: sprite.x, y: sprite.y },
        roll: () => rollContainer(new Rng(seed), def, place.risk, lootMul, place.rich ?? 0),
      });
    });
    for (const e of map.exits) {
      if (e.kind === 'pad' || !e.breaker) this.powered.add(e);
      if (e.breaker) {
        this.fixtures.push({ kind: 'breaker', x: e.breaker.tx * TILE + TILE / 2, y: e.breaker.ty * TILE + 12, exit: e, done: false });
      }
    }
    for (const d of map.doors) {
      if (!d.locked) continue;
      const [a, b] = d.tiles;
      this.fixtures.push({ kind: 'lock', x: ((a.tx + b.tx) / 2 + 0.5) * TILE, y: ((a.ty + b.ty) / 2 + 0.5) * TILE, door: d, done: false });
    }
    for (const t of map.terminals) {
      this.fixtures.push({ kind: 'terminal', x: t.tx * TILE + TILE / 2, y: (t.ty + 1) * TILE + 4, entry: t.entry, done: false });
    }
    this.overlay.addChild(this.zoneMarkings(), this.liftLamps, this.bar);
    this.drawLiftLamps();
  }

  get extracting(): boolean {
    return this.extractRemaining !== null;
  }

  /** The player's hands are busy searching, swiping or throwing a breaker (not reading). */
  get handsBusy(): boolean {
    return this.searching !== null && !('entry' in this.searching && this.searching.kind === 'terminal');
  }

  /** Containers (not bodies or piles), for the tactical map. */
  containerStates(): { tx: number; ty: number; searched: boolean; empty: boolean }[] {
    const grids = useRaid.getState().containers;
    return this.map.containers.map((c, i) => ({
      tx: c.tx, ty: c.ty, searched: this.lootables[i].searched, empty: (grids[`c${i}`]?.items.length ?? 0) === 0,
    }));
  }

  /** Has the breaker for this exit been found (it's thrown)? */
  breakerThrown(e: ExitDef): boolean {
    return this.fixtures.some((f) => f.kind === 'breaker' && f.exit === e && f.done);
  }

  /** Is this exit usable right now? */
  isPowered(e: ExitDef): boolean {
    return this.powered.has(e);
  }

  /** A body becomes lootable when its owner dies. */
  addBody(id: string, pos: () => { x: number; y: number }, contents: Grid): void {
    this.lootables.push({ id, kind: 'body', label: 'BODY', pos, searchTime: 1.1, searched: false, sprite: null, roll: () => contents });
  }

  /**
   * Drop items at a spot: joins a pile within reach, or starts a new one.
   * @returns the pile's container id (contents are managed by the raid store).
   */
  dropPile(x: number, y: number): string {
    for (const l of this.lootables) {
      if (l.kind !== 'pile') continue;
      const p = l.pos();
      if (Math.hypot(p.x - x, p.y - y) < 24) return l.id;
    }
    const id = `pile${this.pileCount++}`;
    const sprite = new Sprite(tex('item_sack'));
    sprite.anchor.set(0.5, 1);
    sprite.scale.set(0.5);
    sprite.position.set(Math.round(x), Math.round(y + 4));
    sprite.zIndex = y;
    this.layer.addChild(sprite);
    this.lootables.push({ id, kind: 'pile', label: 'DROPPED ITEMS', pos: () => ({ x, y }), searchTime: 0, searched: true, sprite, roll: () => ({ w: 6, h: 5, items: [] }) });
    return id;
  }

  /**
   * @param busy player can't interact right now (dead)
   * @param moving player is moving (cancels searching)
   * @param menuOpen the inventory is open: E closes it instead of interacting
   */
  update(dt: number, input: Input, px: number, py: number, busy: boolean, moving: boolean, menuOpen: boolean): InteractionView {
    this.bar.clear();
    this.refreshPiles(dt);
    if (this.done) return { prompt: null, countdown: null, inZone: false };

    const zone = this.map.exitAt(px, py);
    const inZone = zone !== null;

    // Walking away from an open container closes it.
    const open = useRaid.getState().open;
    if (open) {
      const l = this.lootables.find((q) => q.id === open.id);
      if (l) {
        const p = l.pos();
        if (Math.hypot(p.x - px, p.y - py) > CLOSE_DIST) raid.patch({ open: null });
      }
    }

    // --- Shuttle pad: the alarm keeps sounding once signalled; the clock runs while you hold the pad.
    if (this.extractRemaining !== null) {
      this.beaconTimer -= dt;
      this.alarmTimer -= dt;
      const e = this.map.extraction!;
      const zx = (e.x + e.w / 2) * TILE;
      const zy = (e.y + e.h / 2) * TILE;
      const onPad = zone === e;
      if (this.beaconTimer <= 0) {
        this.beaconTimer = onPad ? 1 : 0.5;
        this.audio.sfx('beacon', zx, zy);
        this.ev.onLight(zx, zy, 140, 0x7dff9a, 0.7);
      }
      // Hazard beacons sweep around the pad: the room turns red and everyone knows why.
      this.sweepTimer -= dt;
      if (this.sweepTimer <= 0) {
        this.sweepTimer = 0.16;
        const k = this.sweepStep++ % 4;
        const cx = (e.x + (k === 0 || k === 3 ? -0.5 : e.w + 0.5)) * TILE;
        const cy = (e.y + (k < 2 ? -0.5 : e.h + 0.5)) * TILE;
        this.ev.onLight(cx, cy, 130, 0xff3020, 0.55, 0.3);
      }
      if (this.alarmTimer <= 0) {
        // The klaxon quickens and swells as the shuttle closes in.
        const urgency = 1 - Math.max(0, this.extractRemaining) / EXTRACT_TIME;
        this.alarmTimer = ALARM_INTERVAL * (1 - urgency * 0.55);
        this.audio.sfx('alarm', zx, zy, 1 + urgency * 0.6);
        this.ev.onNoise(zx, zy, ALARM_RADIUS);
      }
      if (onPad && !busy) this.extractRemaining -= dt;
      if (this.extractRemaining <= 0) return this.finish(px, py, inZone);
    }

    // --- Lift: quiet and quick, but it only goes up with you on it.
    if (this.liftRemaining !== null) {
      const lift = this.map.exits.find((q) => q.kind === 'lift')!;
      if (zone !== lift || busy) {
        this.liftRemaining = null;
        raid.notice('Lift stopped: step back on to ride', 'warn');
      } else {
        this.liftRemaining -= dt;
        this.liftHum -= dt;
        if (this.liftHum <= 0) {
          this.liftHum = 1.6;
          this.audio.sfx('lift', px, py);
          this.ev.onNoise(px, py, 150);
        }
        if (this.liftRemaining <= 0) return this.finish(px, py, inZone);
      }
    }
    const countdown = zone?.kind === 'lift' && this.liftRemaining !== null ? this.liftRemaining : this.extractRemaining;

    if (busy || menuOpen) {
      this.searching = null;
      return { prompt: null, countdown, inZone };
    }

    if (zone?.kind === 'pad' && this.extractRemaining === null) {
      if (input.wasPressed('KeyE')) {
        this.extractRemaining = EXTRACT_TIME;
        this.alarmTimer = 0;
        this.beaconTimer = 0;
        this.ev.onSignal?.((zone.x + zone.w / 2) * TILE, (zone.y + zone.h / 2) * TILE);
      }
      return { prompt: '[E] SIGNAL EXTRACTION. The alarm will sound', countdown, inZone };
    }
    if (zone?.kind === 'lift' && this.liftRemaining === null) {
      if (!this.powered.has(zone)) return { prompt: 'MAINTENANCE LIFT · NO POWER. Find the breaker', countdown, inZone };
      if (input.wasPressed('KeyE')) {
        this.liftRemaining = LIFT_TIME;
        this.liftHum = 0;
        this.audio.sfx('keycard', px, py);
      }
      return { prompt: '[E] RIDE THE LIFT UP. Stay on the platform', countdown, inZone };
    }
    if (zone?.kind === 'lift') return { prompt: null, countdown, inZone };

    // --- Lootables
    let nearest: Lootable | null = null;
    let best = REACH;
    for (const l of this.lootables) {
      if (l.kind === 'pile' && !this.pileHasItems(l)) continue;
      const p = l.pos();
      const d = Math.hypot(p.x - px, p.y - py);
      if (d < best) {
        best = d;
        nearest = l;
      }
    }
    // Breakers, security doors and terminals, when they're closer than any container.
    const fx = this.nearestFixture(px, py, best);
    if (fx) {
      if (this.searching && this.searching !== fx) this.searching = null;
      return { prompt: this.useFixture(fx, dt, input, moving), countdown, inZone };
    }
    if (this.searching && this.searching !== nearest) this.searching = null;
    if (!nearest) return { prompt: null, countdown, inZone };

    if (nearest.searched) {
      if (input.wasPressed('KeyE')) this.open(nearest);
      const n = useRaid.getState().containers[nearest.id]?.items.length ?? 0;
      return { prompt: `[E] OPEN ${nearest.label}${n ? '' : ' (EMPTY)'}`, countdown, inZone };
    }

    const holding = input.isDown('KeyE');
    if (holding && !moving) {
      if (this.searching !== nearest) {
        this.searching = nearest;
        this.progress = 0;
      }
      this.progress += dt / nearest.searchTime;
      this.rummageTimer -= dt;
      const p = nearest.pos();
      if (this.rummageTimer <= 0) {
        this.rummageTimer = 0.28;
        this.audio.sfx('rummage', p.x, p.y);
        this.ev.onNoise(p.x, p.y, 70);
      }
      // The thing being rummaged through jostles.
      if (nearest.sprite && nearest.home) nearest.sprite.x = nearest.home.x + (Math.floor(this.progress * 18) % 2 === 0 ? 0 : 1);
      this.drawBar(p.x, p.y, Math.min(1, this.progress));
      if (this.progress >= 1) this.finishSearch(nearest);
    } else {
      this.searching = null;
      this.progress = 0;
    }
    return { prompt: `[HOLD E] SEARCH ${nearest.label}`, countdown, inZone };
  }

  private finish(px: number, py: number, inZone: boolean): InteractionView {
    this.done = true;
    this.audio.sfx('extracted', px, py);
    this.ev.onExtracted();
    return { prompt: null, countdown: 0, inZone };
  }

  private nearestFixture(px: number, py: number, within: number): Fixture | null {
    let best: Fixture | null = null;
    let bd = within;
    for (const f of this.fixtures) {
      if (f.done && f.kind !== 'terminal') continue;
      const d = Math.hypot(f.x - px, f.y - py);
      if (d < bd) {
        bd = d;
        best = f;
      }
    }
    return best;
  }

  /** Prompt and hold-to-use for a fixture. */
  private useFixture(f: Fixture, dt: number, input: Input, moving: boolean): string {
    if (f.kind === 'terminal') {
      if (input.wasPressed('KeyE')) {
        this.audio.ui('open');
        this.ev.onTerminal?.(f.entry ?? 0);
      }
      return '[E] READ TERMINAL';
    }
    let label: string;
    let time: number;
    if (f.kind === 'lock') {
      const card = this.keycard();
      if (!card) return 'SECURITY DOOR · SEALED. Needs a vault keycard';
      label = `[HOLD E] SWIPE KEYCARD (${card.dur ?? 1} USE${card.dur === 1 ? '' : 'S'} LEFT)`;
      time = SWIPE_TIME;
    } else {
      label = '[HOLD E] THROW THE BREAKER. It will be loud';
      time = BREAKER_TIME;
    }
    if (input.isDown('KeyE') && !moving) {
      if (this.searching !== f) {
        this.searching = f;
        this.progress = 0;
      }
      this.progress += dt / time;
      this.drawBar(f.x, f.y + 6, Math.min(1, this.progress));
      if (this.progress >= 1) this.completeFixture(f);
    } else {
      this.searching = null;
      this.progress = 0;
    }
    return label;
  }

  private completeFixture(f: Fixture): void {
    this.searching = null;
    this.progress = 0;
    f.done = true;
    if (f.kind === 'breaker' && f.exit) {
      this.powered.add(f.exit);
      this.drawLiftLamps();
      this.audio.sfx('breaker', f.x, f.y);
      this.ev.onNoise(f.x, f.y, 380);
      this.ev.onLight(f.x, f.y - 10, 90, 0xffe0a0, 0.9);
      raid.notice('Breaker thrown: the maintenance lift has power', 'ok');
    } else if (f.kind === 'lock' && f.door) {
      const card = this.keycard();
      if (!card) {
        f.done = false;
        return;
      }
      raid.consume(card.uid, 1);
      this.audio.sfx('keycard', f.x, f.y);
      const left = (card.dur ?? 1) - 1;
      raid.notice(left > 0 ? `Security door open · keycard ${left} use${left === 1 ? '' : 's'} left` : 'Security door open · the keycard is spent', 'ok');
      this.ev.onUnlock?.(f.door);
    }
  }

  private keycard() {
    return loadoutItems(useRaid.getState().loadout).find((i) => ITEMS[i.id]?.kind === 'key') ?? null;
  }

  private drawLiftLamps(): void {
    const g = this.liftLamps.clear();
    for (const e of this.map.exits) {
      if (e.kind !== 'lift') continue;
      const on = this.powered.has(e);
      const x = (e.x + e.w / 2) * TILE;
      const y = e.y * TILE - 30;
      g.rect(x - 5, y - 3, 10, 6).fill({ color: 0x14110e });
      g.rect(x - 3, y - 1, 6, 2).fill({ color: on ? 0x7dff9a : 0xff3a2a });
      // The breaker panel gets a lamp and hazard tape so it can be found in the dark.
      if (e.breaker) {
        const bx = e.breaker.tx * TILE + TILE / 2;
        const by = e.breaker.ty * TILE;
        for (let i = 0; i < 4; i++) g.rect(bx - 12 + i * 6, by - 4, 3, 2).fill({ color: i % 2 ? 0x1a1a1a : 0xe0b030 });
        g.rect(bx + 10, by - 30, 5, 5).fill({ color: 0x14110e });
        g.rect(bx + 11, by - 29, 3, 3).fill({ color: on ? 0x7dff9a : 0xff3a2a });
      }
    }
  }

  private finishSearch(l: Lootable): void {
    l.searched = true;
    l.bump = 0.22;
    if (l.sprite && l.home) l.sprite.x = l.home.x;
    this.searching = null;
    if (!raid.hasContainer(l.id)) raid.setContainer(l.id, l.roll());
    if (l.kind === 'container') raid.searched();
    const p = l.pos();
    const n = useRaid.getState().containers[l.id].items.length;
    this.audio.sfx(n ? 'loot' : 'dryfire', p.x, p.y);
    this.open(l);
  }

  private open(l: Lootable): void {
    if (!raid.hasContainer(l.id)) raid.setContainer(l.id, l.roll());
    raid.openContainer(l.id, l.label);
    this.audio.sfx('rummage', l.pos().x, l.pos().y);
  }

  private pileHasItems(l: Lootable): boolean {
    return (useRaid.getState().containers[l.id]?.items.length ?? 0) > 0;
  }

  /** Searched containers go dark when empty; empty piles disappear. */
  private refreshPiles(dt: number): void {
    const containers = useRaid.getState().containers;
    for (const l of this.lootables) {
      if (l.bump !== undefined && l.bump > 0 && l.sprite && l.home) {
        l.bump -= dt;
        l.sprite.y = l.home.y - Math.round(Math.sin((1 - l.bump / 0.22) * Math.PI) * 2);
      }
      if (!l.sprite || !l.searched) continue;
      const empty = (containers[l.id]?.items.length ?? 0) === 0;
      if (l.kind === 'pile') l.sprite.visible = !empty;
      else l.sprite.tint = empty ? 0x4a4642 : 0x8a847c;
    }
  }

  private drawBar(bx: number, by: number, p: number): void {
    const x = Math.round(bx - 12);
    const y = Math.round(by - 26);
    this.bar.rect(x - 1, y - 1, 26, 4).fill({ color: 0x000000, alpha: 0.8 });
    this.bar.rect(x, y, Math.round(24 * p), 2).fill({ color: 0xf2a33a });
  }

  /** Hazard-striped floor outlines so exits read even in the dark. */
  private zoneMarkings(): Graphics {
    const g = new Graphics();
    for (const e of this.map.exits) {
      const x0 = e.x * TILE;
      const y0 = e.y * TILE;
      const w = e.w * TILE;
      const h = e.h * TILE;
      if (e.kind === 'lift') {
        // Grated platform on rails.
        g.rect(x0 + 2, y0 + 2, w - 4, h - 4).fill({ color: 0x0c0c0e, alpha: 0.55 });
        for (let i = 6; i < h - 4; i += 5) g.rect(x0 + 4, y0 + i, w - 8, 1).fill({ color: 0x5a5448, alpha: 0.6 });
        g.rect(x0 + 2, y0 + 2, 2, h - 4).fill({ color: 0x8a8070, alpha: 0.8 });
        g.rect(x0 + w - 4, y0 + 2, 2, h - 4).fill({ color: 0x8a8070, alpha: 0.8 });
      }
      for (let i = 0; i < w; i += 8) {
        const c = (i / 8) % 2 === 0 ? 0xe0b030 : 0x1a1a1a;
        g.rect(x0 + i, y0, 4, 2).fill({ color: c, alpha: 0.7 });
        g.rect(x0 + i, y0 + h - 2, 4, 2).fill({ color: c, alpha: 0.7 });
      }
      for (let i = 0; i < h; i += 8) {
        const c = (i / 8) % 2 === 0 ? 0xe0b030 : 0x1a1a1a;
        g.rect(x0, y0 + i, 2, 4).fill({ color: c, alpha: 0.7 });
        g.rect(x0 + w - 2, y0 + i, 2, 4).fill({ color: c, alpha: 0.7 });
      }
      if (e.kind === 'pad') {
        g.rect(x0 + w / 2 - 6, y0 + h / 2 - 1, 12, 2).fill({ color: 0x7dff9a, alpha: 0.5 });
        g.rect(x0 + w / 2 - 1, y0 + h / 2 - 6, 2, 12).fill({ color: 0x7dff9a, alpha: 0.5 });
      }
    }
    return g;
  }
}
