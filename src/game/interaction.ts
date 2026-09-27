import { Container, Graphics, Sprite } from 'pixi.js';
import { tex } from '../engine/assets';
import type { AudioService } from '../engine/audio';
import { TILE } from '../engine/config';
import type { Input } from '../engine/input';
import { Rng } from '../engine/rng';
import { CONTAINERS, rollLoot, type ContainerDef } from '../data/loot';
import type { ContainerPlacement, TileMap } from './world/tilemap';

const REACH = 40; // px from player to container centre
const EXTRACT_TIME = 12; // seconds holding the zone
const ALARM_INTERVAL = 4;
const ALARM_RADIUS = 720;

interface LootBox {
  def: ContainerDef;
  place: ContainerPlacement;
  sprite: Sprite;
  x: number;
  y: number;
  searched: boolean;
  seed: number;
}

export interface InteractionEvents {
  onLoot(items: string[]): void;
  onNoise(x: number, y: number, radius: number): void;
  onLight(x: number, y: number, radius: number, color: number, intensity: number): void;
  onExtracted(): void;
}

export interface InteractionView {
  prompt: string | null;
  countdown: number | null;
  inZone: boolean;
}

/**
 * Player-world interactions: searching containers (hold E) and extraction
 * (E in the zone starts a countdown that sounds an alarm; stay in the zone to leave).
 */
export class Interactions {
  /** Container sprites, depth-sorted with actors. */
  readonly sprites: Sprite[] = [];
  /** World-space UI (progress bars, zone markings) drawn above the darkness. */
  readonly overlay = new Container();

  private boxes: LootBox[] = [];
  private bar = new Graphics();
  private searching: LootBox | null = null;
  private progress = 0;
  private rummageTimer = 0;
  private extractRemaining: number | null = null;
  private alarmTimer = 0;
  private beaconTimer = 0;
  private done = false;

  constructor(private map: TileMap, private audio: AudioService, private ev: InteractionEvents) {
    map.containers.forEach((place, i) => {
      const def = CONTAINERS[place.type];
      const sprite = new Sprite(tex(def.sprite));
      sprite.anchor.set(0.5, 1);
      const x = place.tx * TILE + TILE / 2;
      const y = place.ty * TILE + TILE - 3;
      sprite.position.set(x, y);
      sprite.zIndex = y;
      this.sprites.push(sprite);
      this.boxes.push({ def, place, sprite, x, y: y - 10, searched: false, seed: map.seed * 7919 + i * 104729 });
    });
    this.overlay.addChild(this.zoneMarkings(), this.bar);
  }

  get extracting(): boolean {
    return this.extractRemaining !== null;
  }

  /**
   * @param busy player can't interact right now (dead, hurt this frame, etc.)
   * @param moving player is moving (cancels searching)
   */
  update(dt: number, input: Input, px: number, py: number, busy: boolean, moving: boolean): InteractionView {
    this.bar.clear();
    if (this.done) return { prompt: null, countdown: null, inZone: false };

    const inZone = this.map.inExtraction(px, py);
    const extracting = this.extractRemaining !== null;

    // --- Extraction countdown
    if (this.extractRemaining !== null) {
      this.beaconTimer -= dt;
      this.alarmTimer -= dt;
      const e = this.map.extraction!;
      const zx = (e.x + e.w / 2) * TILE;
      const zy = (e.y + e.h / 2) * TILE;
      if (this.beaconTimer <= 0) {
        this.beaconTimer = inZone ? 1 : 0.5;
        this.audio.sfx('beacon', zx, zy);
        this.ev.onLight(zx, zy, 140, 0x7dff9a, 0.7);
      }
      if (this.alarmTimer <= 0) {
        this.alarmTimer = ALARM_INTERVAL;
        this.audio.sfx('alarm', zx, zy);
        this.ev.onNoise(zx, zy, ALARM_RADIUS);
      }
      if (inZone && !busy) this.extractRemaining -= dt;
      if (this.extractRemaining <= 0) {
        this.done = true;
        this.audio.sfx('extracted', px, py);
        this.ev.onExtracted();
        return { prompt: null, countdown: 0, inZone };
      }
    }

    if (busy) {
      this.searching = null;
      return { prompt: null, countdown: this.extractRemaining, inZone };
    }

    if (inZone && !extracting) {
      if (input.wasPressed('KeyE')) {
        this.extractRemaining = EXTRACT_TIME;
        this.alarmTimer = 0;
        this.beaconTimer = 0;
      }
      return { prompt: '[E] SIGNAL EXTRACTION. Alarm will sound', countdown: null, inZone };
    }

    // --- Containers
    let nearest: LootBox | null = null;
    let best = REACH;
    for (const b of this.boxes) {
      if (b.searched) continue;
      const d = Math.hypot(b.x - px, b.y - py);
      if (d < best) {
        best = d;
        nearest = b;
      }
    }
    if (this.searching && this.searching !== nearest) this.searching = null;
    if (!nearest) return { prompt: null, countdown: this.extractRemaining, inZone };

    const holding = input.isDown('KeyE');
    if (holding && !moving) {
      if (this.searching !== nearest) {
        this.searching = nearest;
        this.progress = 0;
      }
      this.progress += dt / nearest.def.searchTime;
      this.rummageTimer -= dt;
      if (this.rummageTimer <= 0) {
        this.rummageTimer = 0.28;
        this.audio.sfx('rummage', nearest.x, nearest.y);
        this.ev.onNoise(nearest.x, nearest.y, 70);
      }
      this.drawBar(nearest, Math.min(1, this.progress));
      if (this.progress >= 1) this.open(nearest);
    } else {
      this.searching = null;
      this.progress = 0;
    }
    const label = nearest.def.tier === 'valuable' ? 'SECURE CASE' : nearest.def.tier === 'military' ? 'MILITARY CRATE' : 'SUPPLY BOX';
    return { prompt: `[HOLD E] SEARCH ${label}`, countdown: this.extractRemaining, inZone };
  }

  private open(b: LootBox): void {
    b.searched = true;
    this.searching = null;
    b.sprite.tint = 0x5a5550;
    const items = rollLoot(new Rng(b.seed), b.def, b.place.risk);
    if (items.length) {
      this.audio.sfx('loot', b.x, b.y);
      this.ev.onLoot(items);
    } else {
      this.audio.sfx('dryfire', b.x, b.y);
    }
  }

  private drawBar(b: LootBox, p: number): void {
    const x = Math.round(b.x - 12);
    const y = Math.round(b.y - 26);
    this.bar.rect(x - 1, y - 1, 26, 4).fill({ color: 0x000000, alpha: 0.8 });
    this.bar.rect(x, y, Math.round(24 * p), 2).fill({ color: 0xf2a33a });
  }

  /** Hazard-striped floor outline so the zone reads even in the dark. */
  private zoneMarkings(): Graphics {
    const g = new Graphics();
    const e = this.map.extraction;
    if (!e) return g;
    const x0 = e.x * TILE;
    const y0 = e.y * TILE;
    const w = e.w * TILE;
    const h = e.h * TILE;
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
    g.rect(x0 + w / 2 - 6, y0 + h / 2 - 1, 12, 2).fill({ color: 0x7dff9a, alpha: 0.5 });
    g.rect(x0 + w / 2 - 1, y0 + h / 2 - 6, 2, 12).fill({ color: 0x7dff9a, alpha: 0.5 });
    return g;
  }
}
