import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { VIEW_H, VIEW_W } from '../../engine/config';

const HITMARK_TIME = 0.12;
const KILLMARK_TIME = 0.3;
const DAMAGE_DIR_TIME = 0.7;

/**
 * Screen-space feedback drawn by Pixi (it moves every frame, so it stays out of React):
 * crosshair with live spread, hit/kill markers, damage direction, vignette and pain flash.
 */
export class ScreenOverlay {
  readonly container = new Container();
  private cross = new Graphics();
  private indicators = new Graphics();
  private pain = new Sprite(Texture.WHITE);
  private hitmark = 0;
  private killmark = 0;
  private hitBlocked = false;
  private hitHead = false;
  private bleedPulse = 0;
  private damageDirs: { angle: number; t: number }[] = [];

  constructor() {
    const vignette = new Sprite(makeVignette());
    this.pain.tint = 0x8a0000;
    this.pain.width = VIEW_W;
    this.pain.height = VIEW_H;
    this.pain.alpha = 0;
    this.container.addChild(vignette, this.pain, this.indicators, this.cross);
  }

  /** @param blocked armor stopped most of it (grey marker) */
  hit(blocked = false, headshot = false): void {
    this.hitmark = HITMARK_TIME;
    this.hitBlocked = blocked;
    this.hitHead = headshot;
  }

  kill(headshot = false): void {
    this.killmark = KILLMARK_TIME * (headshot ? 1.4 : 1);
    this.hitHead = headshot;
  }

  /** A round snapped past: a brief tightening of the edges. */
  suppressed(): void {
    this.pain.alpha = Math.max(this.pain.alpha, 0.07);
  }

  /** Damage came from `angle` (world direction from player toward the attacker). */
  damaged(angle: number): void {
    this.damageDirs.push({ angle, t: DAMAGE_DIR_TIME });
    this.pain.alpha = 0.28;
  }

  /**
   * @param spreadPx current cone radius at the cursor distance
   * @param reload 0..1 reload progress, or -1
   */
  update(dt: number, mx: number, my: number, spreadPx: number, reload: number,
    playerSx: number, playerSy: number, hpFrac: number, showCrosshair = true, bleeding = false): void {
    this.hitmark = Math.max(0, this.hitmark - dt);
    this.killmark = Math.max(0, this.killmark - dt);

    // Pain flash decays; low health keeps a slow pulse, bleeding a heartbeat.
    const lowHp = hpFrac < 0.35 && hpFrac > 0 ? (0.08 + 0.06 * Math.sin(performance.now() / 180)) : 0;
    this.bleedPulse = bleeding ? (this.bleedPulse + dt) % 1.1 : 0;
    const beat = bleeding ? Math.max(0, 0.16 - this.bleedPulse * 0.5) : 0;
    this.pain.alpha = Math.max(lowHp, beat, this.pain.alpha - dt * 1.2);

    this.cross.visible = showCrosshair;

    // Lines are drawn on pixel centres (+0.5), fills on pixel corners.
    const px = Math.round(mx);
    const py = Math.round(my);
    const x = px + 0.5;
    const y = py + 0.5;
    const gap = Math.round(Math.max(3, Math.min(40, spreadPx)));
    const g = this.cross;
    g.clear();
    const col = this.killmark > 0 ? 0xff3b30
      : this.hitmark > 0 ? (this.hitBlocked ? 0x9aa3ad : this.hitHead ? 0xffe066 : 0xffb14a)
        : 0xe8e2d0;
    const len = 4;
    // Dark outline first so the crosshair reads on any floor.
    for (const [w, c, a] of [[3, 0x000000, 0.6], [1, col, 1]] as const) {
      g.moveTo(x - gap - len, y).lineTo(x - gap, y)
        .moveTo(x + gap, y).lineTo(x + gap + len, y)
        .moveTo(x, y - gap - len).lineTo(x, y - gap)
        .moveTo(x, y + gap).lineTo(x, y + gap + len)
        .stroke({ width: w, color: c, alpha: a });
    }
    g.rect(px, py, 1, 1).fill({ color: col });
    if (this.hitmark > 0 || this.killmark > 0) {
      const s = this.killmark > 0 ? (this.hitHead ? 8 : 6) : this.hitHead ? 5 : 4;
      g.moveTo(x - s - 2, y - s - 2).lineTo(x - 2, y - 2)
        .moveTo(x + s + 2, y - s - 2).lineTo(x + 2, y - 2)
        .moveTo(x - s - 2, y + s + 2).lineTo(x - 2, y + 2)
        .moveTo(x + s + 2, y + s + 2).lineTo(x + 2, y + 2)
        .stroke({ width: 1, color: col });
    }
    if (reload >= 0) {
      g.rect(px - 10, py + gap + len + 4, 20, 3).fill({ color: 0x000000, alpha: 0.7 });
      g.rect(px - 9, py + gap + len + 5, Math.round(18 * reload), 1).fill({ color: 0xf2a33a });
    }

    const ind = this.indicators;
    ind.clear();
    for (let i = this.damageDirs.length - 1; i >= 0; i--) {
      const d = this.damageDirs[i];
      d.t -= dt;
      if (d.t <= 0) {
        this.damageDirs.splice(i, 1);
        continue;
      }
      const r = 34;
      const a0 = d.angle - 0.35;
      const a1 = d.angle + 0.35;
      ind.arc(playerSx, playerSy, r, a0, a1).stroke({ width: 3, color: 0xd11f1f, alpha: d.t / DAMAGE_DIR_TIME });
    }
  }
}

function makeVignette(): Texture {
  const c = document.createElement('canvas');
  c.width = VIEW_W;
  c.height = VIEW_H;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.3, VIEW_W / 2, VIEW_H / 2, VIEW_W * 0.62);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.65)');
  g.fillStyle = grad;
  g.fillRect(0, 0, VIEW_W, VIEW_H);
  return Texture.from(c);
}
