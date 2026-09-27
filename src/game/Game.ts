import { Application, Container, Graphics, type Ticker } from 'pixi.js';
import { loadAssets } from '../engine/assets';
import { AudioService } from '../engine/audio';
import { Camera } from '../engine/camera';
import { GUN_HEIGHT, MAX_DT, VIEW_H, VIEW_W } from '../engine/config';
import { Input } from '../engine/input';
import { ENEMIES } from '../data/enemies';
import { TEST_LOADOUT } from '../data/weapons';
import { TEST_RANGE } from '../data/testRange';
import { expedition, useExpedition } from '../state/expeditionStore';
import { syncHud } from '../state/hudStore';
import { useProfile } from '../state/profileStore';
import { Enemy } from './ai/Enemy';
import { Projectiles, type Bullet, type Hittable } from './combat/projectiles';
import type { GameContext } from './context';
import { Player, type Operator } from './entities/Player';
import { Effects } from './fx/effects';
import { Interactions } from './interaction';
import { Lighting } from './render/lighting';
import { buildMapView } from './render/mapView';
import { ScreenOverlay } from './render/screenOverlay';
import { hasLineOfSight, type RayHit } from './world/collision';
import { Doors } from './world/doors';
import { generateFacility } from './world/facilityGen';
import { mapFromAscii, type TileMap } from './world/tilemap';

export interface GameOptions {
  mode: 'range' | 'facility';
  seed: number;
  operator: Operator;
  volume: number;
}

/** Seconds the K.I.A. screen shows before a facility run ends. */
const DEATH_LINGER = 2.2;

/**
 * Owns the Pixi application and the game loop for one play session.
 * React mounts it into a DOM element and destroys it on unmount. That is the only coupling.
 *
 * Layer order:
 *   worldLit   ground, doors, decals, actors, lit effects  ← darkened by the lighting
 *   lighting   light buffer, multiplied over worldLit
 *   worldGlow  flashes, sparks, tracers, interaction UI    ← emissive, drawn on top
 *   overlay    crosshair, damage feedback (screen space)
 */
export class Game {
  private app = new Application();
  private destroyed = false;
  private initialised = false;
  private host: HTMLElement | null = null;

  private input!: Input;
  private audio = new AudioService();
  private camera!: Camera;
  private map!: TileMap;
  private projectiles = new Projectiles();
  private effects!: Effects;
  private overlay!: ScreenOverlay;
  private lighting: Lighting | null = null;
  private doors: Doors | null = null;
  private interactions!: Interactions;
  private ctx!: GameContext;

  private worldLit = new Container();
  private worldGlow = new Container();
  private actorLayer = new Container();
  private tracers = new Graphics();

  private player!: Player;
  private enemies: Enemy[] = [];
  private targets: Hittable[] = [];
  private hitstopTime = 0;
  private deadTime = 0;
  private ended = false;

  constructor(private opts: GameOptions) {}

  async init(host: HTMLElement): Promise<void> {
    await this.app.init({
      width: VIEW_W,
      height: VIEW_H,
      background: 0x07070a,
      antialias: false,
      roundPixels: true,
      resolution: 1,
      preference: 'webgl',
    });
    await loadAssets();
    if (this.destroyed) {
      this.app.destroy({ removeView: true }, { children: true });
      return;
    }
    this.initialised = true;
    this.host = host;
    const canvas = this.app.canvas;
    canvas.className = 'game-canvas';
    host.appendChild(canvas);
    window.addEventListener('resize', this.fit);
    this.fit();

    this.input = new Input(canvas);
    this.audio.volume = this.opts.volume;
    window.addEventListener('pointerdown', this.unlockAudio);
    window.addEventListener('keydown', this.unlockAudio);

    this.overlay = new ScreenOverlay();
    this.startRun();
    this.app.ticker.add(this.tick);
    if (import.meta.env.DEV) (window as unknown as { __sj: Game }).__sj = this;
  }

  /** Dev-only inspection used by automated play tests. */
  debugSnapshot() {
    return {
      camera: { left: this.camera.left, top: this.camera.top },
      player: { x: Math.round(this.player.x), y: Math.round(this.player.y), hp: this.player.hp },
      enemies: this.enemies.map((e) => ({ x: Math.round(e.x), y: Math.round(e.y), hp: e.hp, state: e.state })),
      extraction: this.map.extraction,
      containers: this.map.containers.map((c) => ({ tx: c.tx, ty: c.ty })),
    };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (!this.initialised) return; // init() will clean up when it resumes
    this.app.ticker.remove(this.tick);
    window.removeEventListener('resize', this.fit);
    window.removeEventListener('pointerdown', this.unlockAudio);
    window.removeEventListener('keydown', this.unlockAudio);
    this.input.destroy();
    this.audio.destroy();
    this.lighting?.destroy();
    this.app.destroy({ removeView: true }, { children: true });
    this.host = null;
  }

  // ---------------------------------------------------------------------------

  private startRun(): void {
    // Tear down the previous run's display objects (textures are shared and kept).
    this.app.stage.removeChildren();
    this.worldLit.destroy({ children: true });
    this.worldGlow.destroy({ children: true });
    this.lighting?.destroy();
    this.worldLit = new Container();
    this.worldGlow = new Container();
    this.actorLayer = new Container();
    this.actorLayer.sortableChildren = true;
    this.tracers = new Graphics();
    this.projectiles.clear();
    this.hitstopTime = 0;
    this.deadTime = 0;
    this.ended = false;

    this.map = this.opts.mode === 'facility' ? generateFacility(this.opts.seed) : mapFromAscii(TEST_RANGE);
    expedition.start(this.opts.mode, this.opts.seed);
    this.camera = new Camera(this.map.pixelWidth, this.map.pixelHeight);
    this.effects = new Effects(this.map, this.audio);
    this.lighting = this.map.ambient < 1 ? new Lighting(this.app.renderer, this.map) : null;

    this.ctx = {
      map: this.map,
      projectiles: this.projectiles,
      effects: this.effects,
      audio: this.audio,
      camera: this.camera,
      emitNoise: (x, y, r) => {
        for (const e of this.enemies) e.hear(x, y, r);
      },
      hitstop: (s) => {
        this.hitstopTime = Math.max(this.hitstopTime, s);
      },
      lightFlash: (x, y, r, color, intensity) => this.lighting?.flash(x, y, r, color, intensity),
    };

    const { ground, props } = buildMapView(this.map);
    this.doors = this.map.doors.length ? new Doors(this.map, this.audio, this.ctx.emitNoise) : null;
    this.interactions = new Interactions(this.map, this.audio, {
      onLoot: (items) => expedition.addLoot(items),
      onNoise: this.ctx.emitNoise,
      onLight: this.ctx.lightFlash,
      onExtracted: () => this.endRun('extracted'),
    });

    this.worldLit.addChild(ground);
    if (this.doors) this.worldLit.addChild(this.doors.container);
    this.worldLit.addChild(this.effects.decals, this.actorLayer, this.effects.lit);
    this.worldGlow.addChild(this.interactions.overlay, this.effects.overlay, this.tracers);
    for (const p of props) this.actorLayer.addChild(p);
    for (const s of this.interactions.sprites) this.actorLayer.addChild(s);

    const spawn = this.map.spawns.find((s) => s.kind === 'player')!;
    this.player = new Player(this.ctx, spawn.x, spawn.y, this.opts.operator, TEST_LOADOUT);
    this.actorLayer.addChild(this.player.view.container);

    this.enemies = this.map.spawns
      .filter((s) => s.kind in ENEMIES)
      .map((s) => new Enemy(this.ctx, ENEMIES[s.kind], s.x, s.y, s.patrol ?? null));
    for (const e of this.enemies) this.actorLayer.addChild(e.view.container);
    this.targets = [this.player, ...this.enemies];

    this.app.stage.addChild(this.worldLit);
    if (this.lighting) this.app.stage.addChild(this.lighting.overlay);
    this.app.stage.addChild(this.worldGlow, this.overlay.container);
    this.camera.snapTo(this.player.x, this.player.y);
  }

  private endRun(status: 'extracted' | 'dead'): void {
    if (this.ended) return;
    this.ended = true;
    const bag = useExpedition.getState().bag;
    if (status === 'extracted') useProfile.getState().bankLoot(bag);
    else useProfile.getState().recordDeath();
    expedition.end(status);
  }

  private tick = (ticker: Ticker): void => {
    const dt = Math.min(ticker.deltaMS / 1000, MAX_DT);

    if (!this.player.alive) {
      this.deadTime += dt;
      if (this.opts.mode === 'range' && this.input.wasPressed('KeyR')) {
        this.startRun();
        this.input.endFrame();
        return;
      }
      if (this.opts.mode === 'facility' && this.deadTime > DEATH_LINGER) this.endRun('dead');
    }

    if (this.hitstopTime > 0) {
      this.hitstopTime -= dt;
    } else if (!this.ended) {
      this.simulate(dt);
    }
    this.render(dt);
    this.input.endFrame();
  };

  private simulate(dt: number): void {
    const p = this.player;
    const aim = this.camera.toWorld(this.input.mouseX, this.input.mouseY);
    p.update(dt, this.input, aim.x, aim.y);

    // How visible the player is: flashlight and gunfire give you away.
    const lightHere = this.lighting ? this.lighting.levelAt(p.x, p.y) : 1;
    p.conspicuity = p.flashlight || p.lastShotAgo < 1.5 ? 1 : lightHere > 0.3 ? 0.75 : 0.42;

    for (const e of this.enemies) e.update(dt, p, this.enemies);
    this.doors?.update(dt, p, this.enemies);
    this.projectiles.update(dt, this.map, this.targets, {
      onWall: this.onBulletWall,
      onActor: this.onBulletActor,
    });
    this.effects.update(dt);

    const view = this.interactions.update(dt, this.input, p.x, p.y, !p.alive, p.speed > 25);
    expedition.patch({
      prompt: view.prompt,
      extractCountdown: view.countdown === null ? null : Math.ceil(view.countdown * 10) / 10,
      extractInZone: view.inZone,
      flashlight: p.flashlight,
    });
  }

  private render(dt: number): void {
    const p = this.player;
    this.camera.update(dt, p.x, p.y - GUN_HEIGHT, this.input.mouseX, this.input.mouseY);
    this.worldLit.position.set(-this.camera.left, -this.camera.top);
    this.worldGlow.position.set(-this.camera.left, -this.camera.top);
    this.audio.setListener(p.x, p.y);

    if (this.lighting) {
      this.lighting.flashlightOn = p.flashlight && p.alive;
      this.lighting.update(dt, this.camera.left, this.camera.top, p.x, p.y, p.aim);
      this.updateEnemyVisibility(dt);
    }

    this.tracers.clear();
    this.projectiles.render(this.tracers);

    // Crosshair spread: cone half-angle projected to the cursor distance.
    const w = p.weapon;
    const psx = p.x - this.camera.left;
    const psy = p.y - GUN_HEIGHT - this.camera.top;
    const dist = Math.hypot(this.input.mouseX - psx, this.input.mouseY - psy);
    const moveFactor = Math.min(1, p.speed / 112);
    const spreadPx = Math.tan((w.spread(moveFactor) * Math.PI) / 180) * dist;
    this.overlay.update(dt, this.input.mouseX, this.input.mouseY, spreadPx,
      w.reloading ? w.reloadProgress : -1, psx, psy, p.hp / p.maxHp);

    const hostiles = this.enemies.filter((e) => e.alive).length;
    syncHud({
      hp: Math.ceil(p.hp),
      maxHp: p.maxHp,
      weaponName: w.def.name,
      weaponSlot: p.current,
      ammo: w.ammo,
      magSize: w.def.magSize,
      reserve: w.reserve,
      reloading: w.reloading,
      hostiles,
      dead: !p.alive,
      cleared: hostiles === 0,
    });
  }

  /**
   * In the dark you only see enemies that are in your line of sight AND lit (by your
   * flashlight, a lamp, or their own muzzle flash). Otherwise you only hear them.
   */
  private updateEnemyVisibility(dt: number): void {
    const p = this.player;
    const L = this.lighting!;
    for (const e of this.enemies) {
      const seen = hasLineOfSight(this.map, p.x, p.y - 6, e.x, e.y - 6)
        && (L.litByPlayer(e.x, e.y) || L.levelAt(e.x, e.y) > 0.22 || e.lastShotAgo < 0.12);
      const c = e.view.container;
      const target = seen ? 1 : 0;
      c.alpha += (target - c.alpha) * Math.min(1, dt * (seen ? 22 : 5));
      c.visible = c.alpha > 0.02;
    }
  }

  private onBulletWall = (b: Bullet, hit: RayHit): void => {
    this.effects.wallImpact(hit.x, hit.y, hit.nx, hit.ny);
    this.audio.sfx('impactWall', hit.x, hit.y);
    // Bullets snapping into walls nearby are something enemies notice.
    if (b.faction === 'player') this.ctx.emitNoise(hit.x, hit.y, 90);
  };

  private onBulletActor = (b: Bullet, target: Hittable, x: number, y: number): void => {
    this.effects.bloodHit(x, y, b.dx, b.dy, 6);
    this.audio.sfx('impactFlesh', x, y);
    if (target === this.player) {
      this.player.takeDamage(b.damage, b.dx, b.dy);
      this.overlay.damaged(Math.atan2(-b.dy, -b.dx));
      return;
    }
    const enemy = target as Enemy;
    const killed = enemy.takeDamage(b.damage, b.dx, b.dy, b.knockback, this.player.x, this.player.y);
    if (killed) {
      expedition.kill();
      this.overlay.kill();
      this.effects.bloodPool(enemy.x, enemy.y, true);
      this.effects.bloodHit(x, y, b.dx, b.dy, 14);
      this.audio.sfx('kill', x, y);
      this.hitstopTime = Math.max(this.hitstopTime, 0.045);
      this.camera.shake(0.15);
    } else {
      this.overlay.hit();
      if (Math.random() < 0.5) this.effects.bloodPool(x + b.dx * 10, y + b.dy * 10, false);
    }
  };

  /** Largest whole-number scale that fits the window, keeping pixels square and crisp. */
  private fit = (): void => {
    if (!this.host) return;
    const scale = Math.max(1, Math.floor(Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H)));
    const c = this.app.canvas;
    c.style.width = `${VIEW_W * scale}px`;
    c.style.height = `${VIEW_H * scale}px`;
  };

  private unlockAudio = (): void => {
    this.audio.unlock();
  };
}
