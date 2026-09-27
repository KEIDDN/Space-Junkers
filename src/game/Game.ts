import { Application, Container, Graphics, type Ticker } from 'pixi.js';
import { loadAssets } from '../engine/assets';
import { audio, type ROOMS } from '../engine/audio';
import { Camera } from '../engine/camera';
import { GUN_HEIGHT, MAX_DT, VIEW_H, VIEW_W } from '../engine/config';
import { Input } from '../engine/input';
import { Rng } from '../engine/rng';
import { DESTINATION } from '../data/destinations';
import { loreEntry } from '../data/lore';
import { themeFor, type Theme } from '../data/themes';
import { ENEMIES } from '../data/enemies';
import { ITEMS, type ArmorDef, type WeaponItemDef } from '../data/items';
import { BODY_GRID, BODY_POCKETS, CONTAINERS, GROUND_GRID, foundInstance, rollItemId } from '../data/loot';
import { WEAPONS } from '../data/weapons';
import { TEST_RANGE } from '../data/testRange';
import { addToGrid, createItem, emptyGrid, loadoutCount, loadoutWeight, type Grid } from '../core/inventory';
import type { Operator } from '../core/profile';
import { useProfile } from '../state/profileStore';
import { raid, useRaid } from '../state/raidStore';
import { syncHud } from '../state/hudStore';
import { useSettings } from '../state/settingsStore';
import { Enemy } from './ai/Enemy';
import { Grenades, fragDamage } from './combat/grenades';
import { Projectiles, type Bullet, type Hittable } from './combat/projectiles';
import type { GameContext } from './context';
import { Player } from './entities/Player';
import { Effects } from './fx/effects';
import { Interactions } from './interaction';
import { Lighting } from './render/lighting';
import { DEFAULT_LOOK, buildMapView, floorAt, type MapLook } from './render/mapView';
import { ScreenOverlay } from './render/screenOverlay';
import type { TacticalSnapshot } from './tactical';
import { hasLineOfSight, type RayHit } from './world/collision';
import { emitterLevels, emittersFrom, type Emitter } from './world/emitters';
import { Doors } from './world/doors';
import { generateFacility } from './world/facilityGen';
import { Tile, mapFromAscii, type TileMap } from './world/tilemap';

export interface GameOptions {
  mode: 'range' | 'facility';
  seed: number;
  operator: Operator;
  volume: number;
  /** Called once when a facility raid ends. */
  onEnd?: (status: 'extracted' | 'dead') => void;
}

/** Seconds the K.I.A. screen shows before a facility run ends. */
const DEATH_LINGER = 2.4;
/** Seconds into a raid when another crew lands. */
const SQUAD_TIMES = [330, 640, 930];
/** Orbit window warnings, in seconds left. */
const WARNINGS = [300, 120, 60, 30];
/** How far the operator's map fills in around them (tiles). */
const SURVEY_RADIUS = 9;

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
  private audio = audio;
  private camera!: Camera;
  private map!: TileMap;
  private projectiles = new Projectiles();
  private effects!: Effects;
  private overlay!: ScreenOverlay;
  private lighting: Lighting | null = null;
  private doors: Doors | null = null;
  private interactions!: Interactions;
  private grenades!: Grenades;
  private ctx!: GameContext;
  private unsubscribe: (() => void) | null = null;

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
  private theme: Theme = themeFor(undefined);
  private look: MapLook = DEFAULT_LOOK;
  /** Raid clock (seconds) and the orbit window. */
  private elapsed = 0;
  private window = Infinity;
  private warned = 0;
  private squads = 0;
  private alarmSquad = false;
  /** Tiles the operator has seen, for the tactical map. */
  private explored = new Uint8Array(0);
  private surveyTimer = 0;
  private emitters: Emitter[] = [];
  private emitterTimer = 0;
  private terminalAt: { x: number; y: number } | null = null;
  paused = false;

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
    this.audio.unlock();

    this.overlay = new ScreenOverlay();
    this.startRun();
    this.app.ticker.add(this.tick);
    if (import.meta.env.DEV) Object.assign(window, { __sj: this, __raid: useRaid });
  }

  /** Dev-only inspection used by automated play tests. */
  debugSnapshot() {
    return {
      camera: { left: this.camera.left, top: this.camera.top },
      player: { x: Math.round(this.player.x), y: Math.round(this.player.y), hp: this.player.hp },
      enemies: this.enemies.map((e) => ({ x: Math.round(e.x), y: Math.round(e.y), hp: e.hp, state: e.state, alive: e.alive })),
      extraction: this.map.extraction,
      containers: this.map.containers.map((c) => ({ tx: c.tx, ty: c.ty, type: c.type })),
    };
  }

  /** Dev-only: teleport the player (automated play tests). */
  debugTeleport(x: number, y: number): void {
    this.player.x = x;
    this.player.y = y;
    this.camera.snapTo(x, y);
  }

  /** Dev-only: stand on a free tile next to a tile (e.g. a container). */
  debugStandNear(tx: number, ty: number): void {
    for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) {
      if (!this.map.isSolid(tx + dx, ty + dy)) {
        this.debugTeleport((tx + dx) * 32 + 16, (ty + dy) * 32 + 16);
        return;
      }
    }
  }

  /** Dev-only: kill an enemy by index. */
  debugKill(i: number): void {
    const e = this.enemies[i];
    if (e?.alive) this.onBulletActor({ dx: 1, dy: 0, damage: 999, pen: 9, knockback: 50 } as Bullet, e, e.x, e.y, false);
  }

  setShake(v: number): void {
    if (this.camera) this.camera.shakeScale = v;
  }

  setVolume(v: number): void {
    this.audio.volume = v;
    this.audio.setMasterVolume(v);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (!this.initialised) return; // init() will clean up when it resumes
    this.app.ticker.remove(this.tick);
    this.unsubscribe?.();
    window.removeEventListener('resize', this.fit);
    window.removeEventListener('pointerdown', this.unlockAudio);
    window.removeEventListener('keydown', this.unlockAudio);
    this.input.destroy();
    this.audio.setOccluder(null);
    this.audio.stopAmbience();
    this.audio.destroy();
    this.lighting?.destroy();
    this.app.destroy({ removeView: true }, { children: true });
    this.host = null;
  }

  // ---------------------------------------------------------------------------

  private startRun(): void {
    // Tear down the previous run's display objects (textures are shared and kept).
    this.unsubscribe?.();
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
    this.grenades?.clear();
    this.hitstopTime = 0;
    this.deadTime = 0;
    this.ended = false;

    const dest = DESTINATION[useRaid.getState().destination];
    const facility = this.opts.mode === 'facility';
    this.theme = themeFor(dest?.id);
    this.map = facility
      ? generateFacility(this.opts.seed, { danger: dest?.dangerMul ?? 1, enemies: dest?.enemies, theme: this.theme, lootBonus: dest?.lootBonus ?? 0 })
      : mapFromAscii(TEST_RANGE);
    this.elapsed = 0;
    this.window = facility ? (dest?.minutes ?? 18) * 60 : Infinity;
    this.warned = 0;
    this.squads = 0;
    this.alarmSquad = false;
    this.explored = new Uint8Array(this.map.width * this.map.height);
    this.surveyTimer = 0;
    this.terminalAt = null;
    this.camera = new Camera(this.map.pixelWidth, this.map.pixelHeight);
    this.camera.shakeScale = useSettings.getState().shake;
    const map = this.map;
    this.audio.setOccluder((x0, y0, x1, y1) => !hasLineOfSight(map, x0, y0, x1, y1));
    this.audio.setRoom(facility ? (this.theme.id as keyof typeof ROOMS) : 'range');
    this.audio.startAmbience('facility', facility ? this.theme.id : 'range');
    this.emitters = emittersFrom([
      ...this.map.props,
      ...this.map.containers.map((c) => ({ sprite: CONTAINERS[c.type]?.sprite ?? '', x: c.tx * 32 + 16, y: c.ty * 32 + 16 })),
    ]);
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
      smokeBetween: (x0, y0, x1, y1) => this.grenades.blocks(x0, y0, x1, y1),
      throwGrenade: (fx, fy, tx, ty, kind, faction) => this.grenades.throw(fx, fy, tx, ty, kind, faction),
      surfaceAt: (x, y) => {
        const f = floorAt(this.look, Math.floor(x / 32), Math.floor(y / 32));
        return f === 'floor_grate' ? 'grate' : f === 'floor_plate' ? 'plate' : 'deck';
      },
    };
    this.grenades = new Grenades(this.map, this.audio, {
      onNoise: (x, y, r) => this.ctx.emitNoise(x, y, r),
      onExplode: (x, y, r, dmg, faction) => this.onExplode(x, y, r, dmg, faction),
    });

    const t = this.theme;
    this.look = facility ? { floor: t.floor, floorTint: t.floorTint, wall: t.wall, wallTint: t.wallTint, trim: t.trim } : DEFAULT_LOOK;
    const { ground, props } = buildMapView(this.map, this.look);
    this.doors = this.map.doors.length ? new Doors(this.map, this.audio, this.ctx.emitNoise) : null;
    this.interactions = new Interactions(this.map, this.audio, {
      onNoise: this.ctx.emitNoise,
      onLight: this.ctx.lightFlash,
      onExtracted: () => this.endRun('extracted'),
      onSignal: (x, y) => this.onSignal(x, y),
      onUnlock: (door) => this.doors?.unlock(door),
      onTerminal: (n) => this.openTerminal(n),
    }, this.actorLayer, facility ? t.loot : {});

    this.worldLit.addChild(ground);
    if (this.doors) this.worldLit.addChild(this.doors.container);
    this.worldLit.addChild(this.effects.decals, this.actorLayer, this.grenades.container, this.effects.lit);
    this.worldGlow.addChild(this.interactions.overlay, this.effects.overlay, this.tracers);
    for (const p of props) this.actorLayer.addChild(p);

    const spawn = this.map.spawns.find((s) => s.kind === 'player')!;
    this.player = new Player(this.ctx, spawn.x, spawn.y, this.opts.operator);
    this.player.onNotice = (text, tone) => raid.notice(text, tone);
    this.actorLayer.addChild(this.player.view.container);

    this.enemies = this.map.spawns
      .filter((s) => s.kind in ENEMIES)
      .map((s) => new Enemy(this.ctx, ENEMIES[s.kind], s.x, s.y, s.patrol ?? null));
    for (const e of this.enemies) {
      this.actorLayer.addChild(e.view.container);
      e.allies = this.enemies;
    }
    this.targets = [this.player, ...this.enemies];

    // The inventory UI can change what's equipped at any moment.
    this.unsubscribe = useRaid.subscribe((s, prev) => {
      if (s.loadout !== prev.loadout) this.player.syncLoadout(s.loadout);
    });

    this.app.stage.addChild(this.worldLit);
    if (this.lighting) this.app.stage.addChild(this.lighting.overlay);
    this.app.stage.addChild(this.worldGlow, this.overlay.container);
    this.camera.snapTo(this.player.x, this.player.y);
  }

  private endRun(status: 'extracted' | 'dead', mia = false): void {
    if (this.ended) return;
    this.ended = true;
    raid.end(status, mia);
    this.opts.onEnd?.(status);
  }

  private tick = (ticker: Ticker): void => {
    const dt = Math.min(ticker.deltaMS / 1000, MAX_DT);

    if (this.paused) {
      this.input.endFrame();
      return;
    }

    if (!this.player.alive) {
      this.deadTime += dt;
      if (this.opts.mode === 'range' && this.input.wasPressed('KeyR')) {
        raid.start('range', 0, 'range', useRaid.getState().loadout);
        this.startRun();
        this.input.endFrame();
        return;
      }
      if (this.opts.mode === 'facility' && this.deadTime > DEATH_LINGER) this.endRun('dead');
    }

    if (this.input.wasPressed('Tab') && this.player.alive) raid.toggleInventory();
    if (this.input.wasPressed('KeyM') && this.player.alive && this.opts.mode === 'facility') {
      raid.toggleMap();
      this.audio.ui(useRaid.getState().mapOpen ? 'open' : 'close');
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
    // Reading a terminal ends with E or by walking away. That E press doesn't also reopen it.
    let closedTerminal = false;
    if (this.terminalAt && useRaid.getState().terminal) {
      if (this.input.wasPressed('KeyE') || Math.hypot(p.x - this.terminalAt.x, p.y - this.terminalAt.y) > 36) {
        raid.closeOverlay();
        this.audio.ui('close');
        this.terminalAt = null;
        closedTerminal = true;
      }
    }
    const menuOpen = raid.overlayOpen() || closedTerminal;
    this.runCommands();

    const aim = this.camera.toWorld(this.input.mouseX, this.input.mouseY);
    p.update(dt, this.input, aim.x, aim.y, !menuOpen);

    // How visible the player is: flashlight and gunfire give you away.
    const lightHere = this.lighting ? this.lighting.levelAt(p.x, p.y) : 1;
    const base = p.flashlight || p.lastShotAgo < 1.5 ? 1 : lightHere > 0.3 ? 0.75 : 0.42;
    // Crouched and slow is harder to pick out; a running silhouette catches the eye.
    p.conspicuity = Math.min(1.2, base * (p.sneaking ? 0.7 : p.sprinting ? 1.2 : 1));

    for (const e of this.enemies) e.update(dt, p, this.enemies);
    this.doors?.update(dt, p, this.enemies);
    this.projectiles.update(dt, this.map, this.targets, {
      onWall: this.onBulletWall,
      onActor: this.onBulletActor,
      onNearMiss: this.onNearMiss,
    });
    this.grenades.update(dt);
    this.effects.update(dt);

    this.trackRooms(dt);
    this.survey(dt);
    this.listenToRoom(dt);
    this.heartbeat(dt);
    this.raidClock(dt);
    const view = this.interactions.update(dt, this.input, p.x, p.y, !p.alive, p.speed > 25, menuOpen);
    p.searching = this.interactions.handsBusy ? Math.max(0, p.searching) + dt : -1;
    if (menuOpen && this.input.wasPressed('KeyE')) raid.closeOverlay();
    const zone = this.map.exitAt(p.x, p.y);
    raid.patch({
      prompt: view.prompt,
      extractCountdown: view.countdown === null ? null : Math.ceil(view.countdown * 10) / 10,
      extractInZone: view.inZone,
      extractKind: view.countdown === null ? null : zone?.kind === 'lift' ? 'lift' : 'pad',
      flashlight: p.flashlight,
    });
  }

  private heartTimer = 0;

  /** Badly hurt: your own heartbeat, faster the closer to the end. */
  private heartbeat(dt: number): void {
    const p = this.player;
    const k = p.hp / p.maxHp;
    if (!p.alive || k > 0.3) return;
    this.heartTimer -= dt;
    if (this.heartTimer > 0) return;
    this.heartTimer = 0.55 + k * 1.4;
    this.audio.sfx('heartbeat', p.x, p.y, 0.6 + (0.3 - k) * 2);
  }

  /** Machinery near the player hums in the right ear, quieter through walls. */
  private listenToRoom(dt: number): void {
    this.emitterTimer -= dt;
    if (this.emitterTimer > 0) return;
    this.emitterTimer = 0.2;
    const p = this.player;
    this.audio.setEmitters(emitterLevels(this.emitters, p.x, p.y, (x, y) => !hasLineOfSight(this.map, p.x, p.y - 8, x, y - 8)));
  }

  /** Fill in the operator's map: everything in line of sight nearby. */
  private survey(dt: number): void {
    if (this.opts.mode !== 'facility') return;
    this.surveyTimer -= dt;
    if (this.surveyTimer > 0) return;
    this.surveyTimer = 0.25;
    const map = this.map;
    const ptx = Math.floor(this.player.x / 32);
    const pty = Math.floor(this.player.y / 32);
    const R = SURVEY_RADIUS;
    for (let ty = pty - R; ty <= pty + R; ty++) {
      for (let tx = ptx - R; tx <= ptx + R; tx++) {
        if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) continue;
        const i = ty * map.width + tx;
        if (this.explored[i] || (tx - ptx) ** 2 + (ty - pty) ** 2 > R * R) continue;
        const t = map.get(tx, ty);
        if (t === Tile.Void || t === Tile.Wall) continue;
        if (hasLineOfSight(map, this.player.x, this.player.y - 6, tx * 32 + 16, ty * 32 + 16)) this.explored[i] = 1;
      }
    }
  }

  /**
   * Raid pressure: the Lastochka can only hold orbit so long, and other crews keep landing.
   */
  private raidClock(dt: number): void {
    if (this.opts.mode !== 'facility' || !this.player.alive) return;
    this.elapsed += dt;
    const left = this.window - this.elapsed;
    while (this.warned < WARNINGS.length && left <= WARNINGS[this.warned]) {
      const w = WARNINGS[this.warned++];
      const text = w >= 60 ? `${w / 60} MIN` : `${w} SEC`;
      raid.notice(`FEDYA: orbit window closes in ${text}. I can't wait for you.`, w <= 60 ? 'bad' : 'warn');
      this.audio.ui('error');
    }
    if (left <= 0) {
      raid.notice('The Lastochka broke orbit without you.', 'bad');
      this.endRun('dead', true);
      return;
    }
    if (this.squads < SQUAD_TIMES.length && this.elapsed >= SQUAD_TIMES[this.squads]) {
      this.squads++;
      if (this.spawnSquad(null)) raid.notice('RADIO: fresh voices on the channel. Another crew just landed.', 'warn');
    }
  }

  /** Seconds left in the orbit window (Infinity on the range). */
  get timeLeft(): number {
    return this.window - this.elapsed;
  }

  /** The pad alarm pulls in a squad from elsewhere in the facility. */
  private onSignal(x: number, y: number): void {
    if (this.alarmSquad) return;
    this.alarmSquad = true;
    const squad = this.spawnSquad({ x, y });
    if (squad) raid.notice('The alarm carries. Hostiles moving toward the pad.', 'bad');
  }

  /**
   * Bring in a fresh squad in a room well away from the player.
   * @param rush where they head straight for (the alarm), or null to sweep toward the player.
   */
  private spawnSquad(rush: { x: number; y: number } | null): boolean {
    const map = this.map;
    const dest = DESTINATION[useRaid.getState().destination];
    const mix = dest?.enemies ?? { scavenger: 1 };
    const p = this.player;
    const center = (r: { x: number; y: number; w: number; h: number }) => ({ x: (r.x + r.w / 2) * 32, y: (r.y + r.h / 2) * 32 });
    const rooms = map.rooms
      .filter((r) => r.role !== 'vault')
      .map((r) => ({ r, d: Math.hypot(center(r).x - p.x, center(r).y - p.y) }))
      .filter((q) => q.d > 32 * 14)
      .sort((a, b) => b.d - a.d);
    if (!rooms.length) return false;
    const pick = rooms[Math.floor(Math.random() * Math.min(3, rooms.length))].r;
    const free: [number, number][] = [];
    for (let y = pick.y; y < pick.y + pick.h; y++) {
      for (let x = pick.x; x < pick.x + pick.w; x++) if (map.get(x, y) === Tile.Floor) free.push([x, y]);
    }
    if (!free.length) return false;
    const size = (dest?.danger ?? 1) >= 3 ? 3 : 2;
    const here = map.rooms.find((r) => p.x / 32 >= r.x && p.x / 32 < r.x + r.w && p.y / 32 >= r.y && p.y / 32 < r.y + r.h);
    const goal = rush ?? (here ? center(here) : { x: p.x, y: p.y });
    for (let i = 0; i < size; i++) {
      const [tx, ty] = free[Math.floor(Math.random() * free.length)];
      const kinds = Object.keys(mix);
      const weights = Object.values(mix);
      let roll = Math.random() * weights.reduce((a, b) => a + b, 0);
      let kind = kinds[0];
      for (let k = 0; k < kinds.length; k++) {
        roll -= weights[k];
        if (roll <= 0) {
          kind = kinds[k];
          break;
        }
      }
      const x = tx * 32 + 16;
      const y = ty * 32 + 16;
      const e = new Enemy(this.ctx, ENEMIES[kind], x, y, rush ? null : [{ x, y }, goal, { x, y }]);
      e.allies = this.enemies;
      this.enemies.push(e);
      this.targets.push(e);
      this.actorLayer.addChild(e.view.container);
      if (this.lighting) e.view.container.alpha = 0;
      if (rush) e.alertTo(rush.x + (Math.random() - 0.5) * 60, rush.y + (Math.random() - 0.5) * 60, 0.5 + i * 0.6);
    }
    return true;
  }

  private openTerminal(n: number): void {
    const s = useRaid.getState();
    this.terminalAt = { x: this.player.x, y: this.player.y };
    useRaid.setState({ terminal: loreEntry(s.destination, this.opts.seed, n), inventoryOpen: false, open: null, mapOpen: false });
  }

  /** The tactical map's view of the facility (for the [M] overlay). */
  tacticalSnapshot(): TacticalSnapshot | null {
    if (this.opts.mode !== 'facility' || !this.map) return null;
    const map = this.map;
    const scanner = useProfile.getState().upgrades.includes('scanner');
    return {
      width: map.width,
      height: map.height,
      tiles: map.tiles,
      explored: this.explored,
      doors: map.doors.map((d) => ({ tiles: d.tiles, locked: !!d.locked })),
      exits: map.exits.map((e) => ({
        kind: e.kind, x: e.x, y: e.y, w: e.w, h: e.h,
        powered: this.interactions.isPowered(e),
        breaker: e.breaker ?? null,
        breakerKnown: !!e.breaker && (this.explored[e.breaker.ty * map.width + e.breaker.tx] === 1 || this.interactions.breakerThrown(e)),
      })),
      rooms: map.rooms.map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h, role: r.role, kind: r.kind ?? '' })),
      containers: this.interactions.containerStates(),
      player: { x: this.player.x / 32, y: this.player.y / 32, aim: this.player.aim },
      scanner,
    };
  }

  private roomTimer = 0;

  /** Notes special rooms the player walks into (contracts care about vaults). */
  private trackRooms(dt: number): void {
    this.roomTimer -= dt;
    if (this.roomTimer > 0) return;
    this.roomTimer = 0.3;
    const tx = Math.floor(this.player.x / 32);
    const ty = Math.floor(this.player.y / 32);
    for (const r of this.map.rooms) {
      if (tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h && r.role !== 'standard') raid.visit(r.role);
    }
  }

  /** Requests queued by the inventory UI (drop, use). */
  private runCommands(): void {
    for (const c of raid.takeCommands()) {
      if (c.type === 'use') {
        const it = useRaid.getState().loadout;
        const item = [it.pockets, it.backpack?.contents].flatMap((g) => g?.items ?? []).find((q) => q.item.uid === c.uid)?.item;
        if (item) this.player.useItem(item);
      } else if (c.type === 'drop') {
        const id = this.interactions.dropPile(this.player.x, this.player.y + 2);
        const grid = useRaid.getState().containers[id] ?? emptyGrid(GROUND_GRID[0], GROUND_GRID[1]);
        const r = addToGrid(grid, c.item);
        let g = r.grid;
        // A full pile grows rather than eating the item.
        if (r.rest) g = addToGrid({ ...g, h: g.h + 4 }, r.rest).grid;
        raid.setContainer(id, g);
        this.audio.sfx('drop', this.player.x, this.player.y);
      }
    }
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
    const spreadPx = w ? Math.tan((w.spread(moveFactor) * Math.PI) / 180) * dist : 6;
    const menuOpen = raid.overlayOpen();
    const st = p.status;
    this.overlay.update(dt, this.input.mouseX, this.input.mouseY, spreadPx,
      w?.reloading ? w.reloadProgress : st.using >= 0 ? st.using : -1, psx, psy, p.hp / p.maxHp, !menuOpen && p.alive, st.bleeding);

    const lo = useRaid.getState().loadout;
    const armor = lo.armor ? (lo.armor.dur ?? 0) / (ITEMS[lo.armor.id] as ArmorDef).durability : -1;
    const helmet = lo.helmet ? (lo.helmet.dur ?? 0) / (ITEMS[lo.helmet.id] as ArmorDef).durability : -1;
    const quick = lo.quick.map((id) => (id ? `${id}:${loadoutCount(lo, id)}` : '')).join('|');
    const hostiles = this.enemies.filter((e) => e.alive).length;
    let exfil = '';
    const ex = this.map.extraction;
    if (ex && this.opts.mode === 'facility' && useProfile.getState().upgrades.includes('scanner')) {
      const dx = (ex.x + ex.w / 2) * 32 - p.x;
      const dy = (ex.y + ex.h / 2) * 32 - p.y;
      const arrows = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'];
      const i = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
      exfil = `EXFIL ${arrows[i]} ${Math.round(Math.hypot(dx, dy) / 16)} M`;
    }
    syncHud({
      hp: Math.ceil(p.hp),
      maxHp: p.maxHp,
      bleeding: st.bleeding,
      regen: st.regen,
      boosted: st.boosted,
      armor: Math.round(armor * 20) / 20,
      helmet: Math.round(helmet * 20) / 20,
      using: st.using < 0 ? -1 : Math.round(st.using * 20) / 20,
      stamina: Math.round(st.stamina / 5) * 5,
      gait: st.gait,
      usingName: st.usingName,
      armed: !!w,
      weaponName: w?.def.name ?? 'UNARMED',
      weaponSlot: p.current,
      ammo: w?.ammo ?? 0,
      magSize: w?.def.magSize ?? 0,
      reserve: p.carriedAmmo(),
      ammoName: w?.ammoId ? ITEMS[w.ammoId].short : '',
      reloading: !!w?.reloading,
      jammed: !!w?.jammed,
      quick,
      weight: Math.round(loadoutWeight(lo)),
      exfil,
      timeLeft: Number.isFinite(this.window) ? Math.max(0, Math.ceil(this.window - this.elapsed)) : -1,
      hostiles,
      dead: !p.alive,
      cleared: hostiles === 0,
    });
  }

  /**
   * In the dark you only see enemies that are in your line of sight AND lit (by your
   * flashlight, a lamp, or their own muzzle flash). Otherwise you only hear them.
   * Corpses stay faintly visible once seen, so bodies can be found again.
   */
  private updateEnemyVisibility(dt: number): void {
    const p = this.player;
    const L = this.lighting!;
    for (const e of this.enemies) {
      const seen = hasLineOfSight(this.map, p.x, p.y - 6, e.x, e.y - 6)
        && (L.litByPlayer(e.x, e.y) || L.levelAt(e.x, e.y) > 0.22 || e.lastShotAgo < 0.12)
        && (!this.grenades.blocks(p.x, p.y - 6, e.x, e.y - 6) || e.lastShotAgo < 0.12);
      const c = e.view.container;
      const target = seen ? 1 : 0;
      c.alpha += (target - c.alpha) * Math.min(1, dt * (seen ? 22 : 5));
      c.visible = c.alpha > 0.02;
    }
  }

  private onBulletWall = (b: Bullet, hit: RayHit): void => {
    this.effects.bulletWall(hit.x, hit.y, hit.nx, hit.ny, b.dx, b.dy);
    this.audio.sfx('impactWall', hit.x, hit.y);
    // Bullets snapping into walls nearby are something enemies notice.
    if (b.faction === 'player') this.ctx.emitNoise(hit.x, hit.y, 90);
  };

  private onBulletActor = (b: Bullet, target: Hittable, x: number, y: number, headshot: boolean): void => {
    if (target === this.player) {
      const blocked = this.player.takeHit(b.damage, b.pen, b.dx, b.dy, headshot);
      if (blocked) this.effects.wallImpact(x, y, -b.dx, -b.dy);
      else this.effects.bloodHit(x, y, b.dx, b.dy, headshot ? 12 : 6);
      this.audio.sfx('impactFlesh', x, y);
      this.overlay.damaged(Math.atan2(-b.dy, -b.dx));
      return;
    }
    const enemy = target as Enemy;
    const r = enemy.takeDamage(b.damage, b.pen, headshot, b.dx, b.dy, b.knockback, this.player.x, this.player.y);
    if (r.blocked) {
      this.effects.wallImpact(x, y, -b.dx, -b.dy);
      this.audio.sfx('armor', x, y);
    } else {
      this.effects.bloodHit(x, y, b.dx, b.dy, headshot ? 12 : 6);
      this.audio.sfx('impactFlesh', x, y);
    }
    if (r.killed) {
      this.onEnemyKilled(enemy, x, y, b.dx, b.dy, headshot);
    } else {
      if (headshot) this.audio.sfx('headshot', x, y);
      this.overlay.hit(r.blocked, headshot);
      if (!r.blocked && Math.random() < 0.5) this.effects.bloodPool(x + b.dx * 10, y + b.dy * 10, false);
    }
  };

  private onEnemyKilled(enemy: Enemy, x: number, y: number, dx: number, dy: number, headshot: boolean): void {
    raid.kill(enemy.def.id, headshot);
    this.overlay.kill(headshot);
    this.effects.bloodPool(enemy.x, enemy.y, true);
    this.effects.bloodHit(x, y, dx, dy, 14);
    this.audio.sfx(headshot ? 'headshot' : 'kill', x, y);
    this.hitstopTime = Math.max(this.hitstopTime, headshot ? 0.07 : 0.045);
    this.camera.shake(0.15);
    this.addBody(enemy);
    // Friends who see it happen get scared, and angry.
    for (const e of this.enemies) if (e !== enemy) e.witnessDeath(enemy.x, enemy.y, this.player.x, this.player.y);
  }

  /** A round snapped past someone: enemies get suppressed, the player hears it by their ear. */
  private onNearMiss = (b: Bullet, target: Hittable): void => {
    if (target === this.player) {
      this.audio.sfx('whiz', this.player.x + b.dx * 10, this.player.y + b.dy * 10);
      this.camera.shake(0.06);
      this.overlay.suppressed();
      return;
    }
    (target as Enemy).nearMiss(b.ox, b.oy);
  };

  /** Fragmentation: everyone in the blast with a clear line takes damage, the shooter included. */
  private onExplode(x: number, y: number, radius: number, damage: number, faction: 'player' | 'enemy'): void {
    this.effects.explosion(x, y);
    this.lighting?.flash(x, y - 6, 280, 0xffb060, 1.4, 0.18);
    const pd = Math.hypot(this.player.x - x, this.player.y - y);
    this.camera.shake(Math.max(0.15, 0.9 - pd / 500));
    this.hitstopTime = Math.max(this.hitstopTime, 0.05);
    const pdmg = fragDamage(this.map, x, y, this.player.x, this.player.y, radius, damage);
    if (pdmg > 0 && this.player.alive) {
      const a = Math.atan2(this.player.y - y, this.player.x - x);
      this.player.takeHit(pdmg, 3, Math.cos(a), Math.sin(a), false);
      this.overlay.damaged(a + Math.PI);
    }
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const dmg = fragDamage(this.map, x, y, e.x, e.y, radius, damage);
      if (dmg <= 0) continue;
      const a = Math.atan2(e.y - y, e.x - x);
      const r = e.takeDamage(dmg, 3, false, Math.cos(a), Math.sin(a), 240, x, y);
      this.effects.bloodHit(e.x, e.y - 8, Math.cos(a), Math.sin(a), 8);
      if (r.killed) {
        if (faction === 'player') this.onEnemyKilled(e, e.x, e.y - 8, Math.cos(a), Math.sin(a), false);
        else this.addBody(e);
      }
    }
  }

  /** A corpse carries its gun, some rounds, whatever armor survived, and pocket junk. */
  private addBody(e: Enemy): void {
    const i = this.enemies.indexOf(e);
    const rng = new Rng((this.opts.seed * 31 + i * 7717) >>> 0);
    let grid: Grid = emptyGrid(BODY_GRID[0], BODY_GRID[1]);
    const gunDef = WEAPONS[(ITEMS[e.weaponItem] as WeaponItemDef).weapon];
    grid = addToGrid(grid, createItem(e.weaponItem, { loaded: Math.min(e.weapon.ammo, gunDef.magSize), ammoType: e.weapon.ammoId ?? undefined })).grid;
    const rounds = rng.int(e.def.ammo[0], e.def.ammo[1]);
    if (rounds > 0 && e.weapon.ammoId) grid = addToGrid(grid, createItem(e.weapon.ammoId, { qty: rounds })).grid;
    for (const worn of [e.armor, e.helmet]) {
      if (worn && worn.dur > 0) grid = addToGrid(grid, createItem(worn.id, { dur: Math.round(worn.dur) })).grid;
    }
    const n = rng.int(e.def.pockets[0], e.def.pockets[1]);
    for (let k = 0; k < n; k++) {
      const id = rollItemId(rng, BODY_POCKETS, 0.2);
      if (id) grid = addToGrid(grid, foundInstance(rng, id)).grid;
    }
    // Security and garrison officers sometimes carry a worn vault card.
    const card = e.def.id === 'security' ? 0.12 : e.def.id === 'soldier' ? 0.05 : 0;
    if (rng.chance(card)) grid = addToGrid(grid, createItem('keycard', { dur: rng.int(1, 2) })).grid;
    this.interactions.addBody(`body${i}`, () => ({ x: e.x, y: e.y }), grid);
  }

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
