import { Application, Container, Graphics, Sprite, type Ticker } from 'pixi.js';
import { anim, loadAssets, tex } from '../../engine/assets';
import { audio } from '../../engine/audio';
import { Camera } from '../../engine/camera';
import { MAX_DT, TILE, VIEW_H, VIEW_W } from '../../engine/config';
import { Input } from '../../engine/input';
import { CREW, type CrewId } from '../../data/crew';
import { questsFor } from '../../core/quests';
import { useProfile } from '../../state/profileStore';
import { buildShip, type ShipInteractable, type ShipLayout } from '../../data/shipLayout';
import { shipUi, useShip } from '../../state/shipStore';
import { ActorView } from '../entities/ActorView';
import { Lighting } from '../render/lighting';
import { AmbientFx } from '../fx/ambient';
import { Effects } from '../fx/effects';
import { buildMapView, FLOOR_DECK } from '../render/mapView';
import { hasLineOfSight, moveCircle } from '../world/collision';
import { Doors } from '../world/doors';
import { emitterLevels, emittersFrom, type Emitter } from '../world/emitters';
import { CrewActor } from './CrewActor';
import type { Sfx } from '../../engine/audio';

/** What each crew member sounds like at work. */
const CREW_SOUND: Record<CrewId, Sfx> = { hacker: 'typing', medic: 'beeps', trader: 'radio', merc: 'sharpen', smuggler: 'cards' };

const SPEED = 92;
const ACCEL = 1200;
const REACH = 38;

/**
 * The Lastochka: a walkable hub. Crew at their stations, your bunk, the lockers,
 * the pilot's seat and the airlock. React draws the panels; this draws the ship.
 */
export class ShipScene {
  private app = new Application();
  private destroyed = false;
  private initialised = false;
  private host: HTMLElement | null = null;
  private input!: Input;
  private camera!: Camera;
  private lighting!: Lighting;
  private effects!: Effects;
  private ambientFx!: AmbientFx;
  private layout!: ShipLayout;
  private doors!: Doors;
  private world = new Container();
  private glowWorld = new Container();
  private glow = new Container();
  private actors = new Container();
  private stars = new Graphics();
  private markers = new Graphics();
  private markerTimer = 0;
  private markerState = new Map<CrewId, 'new' | 'ready' | null>();
  private player!: ActorView;
  private crew: CrewActor[] = [];
  private bobbers: { s: Sprite; y: number; t: number }[] = [];
  private px = 0;
  private py = 0;
  private placed = false;
  private vx = 0;
  private vy = 0;
  private time = 0;
  private starField: { x: number; y: number; b: number; tw: number }[] = [];
  private jumpT = -1;

  /** @param start where the operator stands (keeps position when the ship is rebuilt). */
  constructor(private operator: 'm' | 'f', private start?: { x: number; y: number }) {}

  /** Where the operator stands, once the ship is built (null before that). */
  get position(): { x: number; y: number } | null {
    return this.placed ? { x: this.px, y: this.py } : null;
  }

  async init(host: HTMLElement): Promise<void> {
    await this.app.init({
      width: VIEW_W, height: VIEW_H, background: 0x020205, antialias: false, roundPixels: true,
      resolution: 1, preference: 'webgl',
    });
    await loadAssets();
    if (this.destroyed) {
      this.app.destroy({ removeView: true }, { children: true });
      return;
    }
    this.initialised = true;
    this.host = host;
    this.app.canvas.className = 'game-canvas ship-canvas';
    host.appendChild(this.app.canvas);
    window.addEventListener('resize', this.fit);
    this.fit();
    this.input = new Input(this.app.canvas);
    audio.unlock();
    audio.setRoom('ship');
    audio.startAmbience('ship');
    this.build();
    this.app.ticker.add(this.tick);
    if (import.meta.env.DEV) Object.assign(window, { __ship: this });
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (!this.initialised) return;
    audio.stopAmbience();
    audio.setOccluder(null);
    this.app.ticker.remove(this.tick);
    window.removeEventListener('resize', this.fit);
    this.input.destroy();
    this.lighting.destroy();
    this.app.destroy({ removeView: true }, { children: true });
    this.host = null;
  }

  /** Dev-only: where things are (automated play tests). */
  debugSnapshot() {
    return {
      player: { x: Math.round(this.px), y: Math.round(this.py) },
      interactables: this.layout.interactables.map((i) => ({ kind: i.kind, crew: i.crew, x: i.x, y: i.y })),
    };
  }

  debugTeleport(x: number, y: number): void {
    this.px = x;
    this.py = y;
    this.camera.snapTo(x, y);
  }

  /** Dev-only: walk to a point along the grid (tests the real collision, doors included). */
  debugState() {
    return { x: this.px, y: this.py, prompt: useShip.getState().prompt, panel: useShip.getState().panel };
  }

  private build(): void {
    const prof = useProfile.getState();
    const L = buildShip(prof.upgrades, Object.entries(prof.quests).filter(([, q]) => q.status === 'turnedIn').map(([id]) => id));
    this.layout = L;
    const map = L.map;
    this.emitters = emittersFrom(L.props);
    this.camera = new Camera(map.pixelWidth, map.pixelHeight);
    this.camera.lookAhead = 0.08;

    // Space outside the hull.
    for (let i = 0; i < 260; i++) {
      this.starField.push({ x: Math.random() * VIEW_W * 1.6, y: Math.random() * VIEW_H * 1.6, b: Math.random(), tw: Math.random() * 6 });
    }

    const { ground } = buildMapView(map, { floor: FLOOR_DECK, floorTint: 0xf0e4d4, wall: 'wall_face_a', wallTint: 0xffffff, trim: 0x7a2e20 });
    // The cockpit is one painted piece over the nose of the ship.
    const cockpit = new Sprite(tex('ship_cockpit'));
    cockpit.anchor.set(0.5, 1);
    cockpit.position.set(L.cockpit.x, L.cockpit.y);
    ground.addChild(cockpit);

    const floorProps = new Container();
    // Hazard striping around the airlock chamber and its outer hatch.
    const hz = new Graphics();
    const a = L.airlock;
    const x0 = a.x * TILE;
    const y0 = a.y * TILE;
    const w = a.w * TILE;
    const h = a.h * TILE;
    for (let i = 0; i < w; i += 8) {
      const c = (i / 8) % 2 === 0 ? 0xc89a2a : 0x151210;
      hz.rect(x0 + i, y0 + h - 6, 4, 6).fill({ color: c, alpha: 0.85 });
      hz.rect(x0 + i, y0, 4, 3).fill({ color: c, alpha: 0.6 });
    }
    hz.rect(x0 + w / 2 - 28, y0 + h - 22, 56, 14).fill({ color: 0x2a2320 }).stroke({ width: 1, color: 0x6a5a48 });
    hz.rect(x0 + w / 2 - 1, y0 + h - 22, 2, 14).fill({ color: 0x0a0908 });
    floorProps.addChild(hz);
    const wallProps = new Container();
    this.actors.sortableChildren = true;
    // Cables snake across the deck, with a highlight so they read as round.
    const cables = new Graphics();
    for (const line of L.cables) {
      for (const [w, c, a] of [[2, 0x0c0b0a, 0.55], [1, 0x4a4238, 0.8]] as const) {
        cables.moveTo(line[0][0], line[0][1]);
        for (const [x, y] of line.slice(1)) cables.lineTo(x, y);
        cables.stroke({ width: w, color: c, alpha: a });
      }
    }
    floorProps.addChild(cables);
    for (const p of L.props) {
      const s = new Sprite(tex(p.sprite));
      s.anchor.set(0.5, 1);
      s.position.set(Math.round(p.x), Math.round(p.y - (p.lift ?? 0)));
      if (p.flip) s.scale.x = -1;
      if (p.floor) floorProps.addChild(s);
      else if (p.wall) wallProps.addChild(s);
      else {
        s.zIndex = p.y + (p.lift ? 1 : 0);
        this.actors.addChild(s);
      }
      if (p.bob) this.bobbers.push({ s, y: s.y, t: Math.random() * 6 });
    }

    this.doors = new Doors(map, audio, () => {});
    for (const st of L.crew) {
      const a = new CrewActor(st, CREW[st.crew].sprite);
      this.crew.push(a);
      this.actors.addChild(a.container);
    }
    this.player = new ActorView({ walk: anim(`op_${this.operator}_walk_unarmed`), death: anim(`op_${this.operator}_death`) });
    this.player.setWeapon(null);
    this.actors.addChild(this.player.container);
    this.px = this.start?.x ?? L.spawn.x;
    this.py = this.start?.y ?? L.spawn.y;
    this.placed = true;

    this.lighting = new Lighting(this.app.renderer, map);
    audio.setOccluder((x0, y0, x1, y1) => !hasLineOfSight(map, x0, y0, x1, y1));
    this.lighting.flashlightOn = false;

    // The ship's own small life: status lights, a machine that sparks, steam, dust.
    this.effects = new Effects(map, audio);
    this.ambientFx = new AmbientFx(L.props, this.effects, audio, (x, y, r, c, i) => this.lighting.flash(x, y, r, c, i));
    this.world.addChild(ground, floorProps, this.effects.decals, this.doors.container, wallProps, this.actors, this.effects.lit, this.ambientFx.dust);
    this.glowWorld.addChild(this.ambientFx.glow, this.effects.overlay, this.markers);
    this.app.stage.addChild(this.stars, this.world, this.lighting.overlay, this.glowWorld, this.glow);
    this.camera.snapTo(this.px, this.py);
  }

  private tick = (ticker: Ticker): void => {
    const dt = Math.min(ticker.deltaMS / 1000, MAX_DT);
    this.time += dt;
    const ship = useShip.getState();
    const busy = !!ship.panel;

    // --- Movement (frozen while a panel is open)
    this.input.poll(dt);
    const mv = busy ? { x: 0, y: 0 } : this.input.move();
    const len = Math.hypot(mv.x, mv.y);
    const push = Math.min(1, len);
    const tx = len ? (mv.x / len) * SPEED * push : 0;
    const ty = len ? (mv.y / len) * SPEED * push : 0;
    this.vx = approach(this.vx, tx, ACCEL * dt);
    this.vy = approach(this.vy, ty, ACCEL * dt);
    const pos = { x: this.px, y: this.py };
    moveCircle(this.layout.map, pos, 6, this.vx * dt, this.vy * dt);
    // Crew are solid: slide around them.
    for (const c of this.layout.crew) {
      const dx = pos.x - c.x;
      const dy = pos.y - c.y;
      const d = Math.hypot(dx, dy);
      if (d < 13 && d > 0.01) {
        pos.x = c.x + (dx / d) * 13;
        pos.y = c.y + (dy / d) * 13;
      }
    }
    moveCircle(this.layout.map, pos, 6, 0, 0);
    const moved = Math.hypot(pos.x - this.px, pos.y - this.py);
    this.vx = (pos.x - this.px) / dt;
    this.vy = (pos.y - this.py) / dt;
    this.px = pos.x;
    this.py = pos.y;
    const facing = Math.abs(this.vx) > 4 ? (this.vx > 0 ? 0 : Math.PI) : this.lastFacing;
    this.lastFacing = facing;
    this.player.update(dt, this.px, this.py, facing, moved, false, 0);
    if (this.player.stepped) audio.step(this.px, this.py, 'plate', 1, true);

    // --- Crew, props, doors
    const talking = ship.panel?.kind === 'crew' ? ship.panel.crew : null;
    for (const c of this.crew) {
      c.update(dt, this.px, this.py, talking === c.station.crew);
      // Everyone aboard makes their own small noises: you can find them with your ears.
      if (c.busied) audio.sfx(CREW_SOUND[c.station.crew], c.station.x, c.station.y);
    }
    for (const b of this.bobbers) {
      b.t += dt;
      b.s.y = Math.round(b.y + Math.sin(b.t * 2.2) * 2);
    }
    this.doors.update(dt, { x: this.px, y: this.py, alive: true }, []);

    // --- Interaction
    const near = busy ? null : this.nearest();
    shipUi.patch({ prompt: near ? this.promptFor(near) : null });
    if (near && this.input.pressed('interact')) {
      audio.ui('open');
      if (near.kind === 'crew') shipUi.open({ kind: 'crew', crew: near.crew! });
      else shipUi.open({ kind: near.kind } as never);
    } else if (!busy && this.input.pressed('inventory')) {
      audio.ui('open');
      shipUi.open({ kind: 'stash' });
    }

    // --- Jump effect
    if (ship.jumping && this.jumpT < 0) {
      this.jumpT = 0;
      audio.jump();
    }
    if (this.jumpT >= 0) {
      this.jumpT += dt;
      if (this.jumpT > 1.5 && this.jumpT < 2.6) this.camera.shake(dt * 3);
      if (this.jumpT > 3.4) {
        this.jumpT = -1;
        shipUi.patch({ jumping: false });
      }
    }

    // --- Render
    // Look around with the mouse, or lean the view with the right stick.
    const look = this.input.padAiming
      ? { x: VIEW_W / 2 + this.input.aimStick.x * 150, y: VIEW_H / 2 + this.input.aimStick.y * 110 }
      : { x: this.input.mouseX, y: this.input.mouseY };
    this.camera.update(dt, this.px, this.py - 16, look.x, look.y);
    this.world.position.set(-this.camera.left, -this.camera.top);
    this.glowWorld.position.set(-this.camera.left, -this.camera.top);
    this.updateMarkers(dt);
    audio.setListener(this.px, this.py);
    const dr = Math.hypot(this.px - this.layout.reactor.x, this.py - this.layout.reactor.y);
    audio.setAmbienceIntensity(Math.max(0, 1 - dr / 260));
    this.emitterTimer -= dt;
    if (this.emitterTimer <= 0) {
      this.emitterTimer = 0.2;
      const map = this.layout.map;
      audio.setEmitters(emitterLevels(this.emitters, this.px, this.py, (x, y) => !hasLineOfSight(map, this.px, this.py - 8, x, y - 8)));
    }
    this.effects.update(dt);
    this.ambientFx.update(dt, this.camera.left, this.camera.top, VIEW_W, VIEW_H);
    this.lighting.update(dt, this.camera.left, this.camera.top, this.px, this.py, 0);
    this.drawStars();
    this.input.endFrame();
  };

  private lastFacing = 0;
  private emitters: Emitter[] = [];
  private emitterTimer = 0;

  /** "!" over crew with new contracts, "?" when you can hand one in. Emissive, above the dark. */
  private updateMarkers(dt: number): void {
    this.markerTimer -= dt;
    if (this.markerTimer <= 0) {
      this.markerTimer = 0.5;
      const p = useProfile.getState();
      for (const c of this.layout.crew) {
        const qs = questsFor(p, c.crew);
        this.markerState.set(c.crew, qs.some((q) => q.status === 'ready') ? 'ready' : qs.some((q) => q.status === 'available') ? 'new' : null);
      }
    }
    const g = this.markers;
    g.clear();
    const talking = useShip.getState().panel?.kind === 'crew';
    if (talking) return;
    const bob = Math.round(Math.sin(this.time * 3) * 1.5);
    for (const c of this.layout.crew) {
      const m = this.markerState.get(c.crew);
      if (!m) continue;
      const x = Math.round(c.x);
      const y = Math.round(c.y) - 52 + bob;
      const col = m === 'ready' ? 0x8fd18a : 0xf2a33a;
      if (m === 'new') {
        g.rect(x - 2, y - 1, 5, 9).fill({ color: 0x000000 });
        g.rect(x - 2, y + 9, 5, 4).fill({ color: 0x000000 });
        g.rect(x - 1, y, 3, 7).fill({ color: col });
        g.rect(x - 1, y + 10, 3, 2).fill({ color: col });
      } else {
        // A small check mark.
        g.rect(x - 5, y + 2, 11, 9).fill({ color: 0x000000 });
        for (const [dx, dy] of [[-4, 5], [-3, 6], [-2, 7], [-1, 6], [0, 5], [1, 4], [2, 3], [3, 2]]) g.rect(x + dx, y + dy + 1, 2, 2).fill({ color: col });
      }
    }
  }

  private nearest(): ShipInteractable | null {
    let best: ShipInteractable | null = null;
    let bd = REACH;
    for (const i of this.layout.interactables) {
      const d = Math.hypot(i.x - this.px, i.y - this.py);
      const reach = i.kind === 'crew' ? REACH + 14 : REACH;
      if (d < reach && d < bd + (i.kind === 'crew' ? 14 : 0)) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  private promptFor(i: ShipInteractable): string {
    if (i.kind === 'crew') return `{interact} TALK TO ${CREW[i.crew!].callsign}`;
    return `{interact} ${i.label}`;
  }

  /** Slow parallax starfield; streaks during a jump. */
  private drawStars(): void {
    const g = this.stars;
    g.clear();
    const jumping = this.jumpT >= 0 && this.jumpT < 3.4;
    const streak = jumping ? Math.min(1, Math.max(0, (this.jumpT - 0.6) / 1)) * (this.jumpT < 2.8 ? 1 : Math.max(0, (3.4 - this.jumpT) / 0.6)) : 0;
    const ox = -this.camera.left * 0.15 - this.time * 3;
    const oy = -this.camera.top * 0.15;
    const W = VIEW_W * 1.6;
    const H = VIEW_H * 1.6;
    for (const s of this.starField) {
      const x = ((((s.x + ox) % W) + W) % W) - VIEW_W * 0.3;
      const y = ((((s.y + oy) % H) + H) % H) - VIEW_H * 0.3;
      const tw = 0.55 + 0.45 * Math.sin(this.time * (0.6 + s.b) + s.tw);
      const c = s.b > 0.85 ? 0xcfe0ff : s.b > 0.6 ? 0x8a93a8 : 0x4a4e5c;
      const len = 1 + streak * (6 + s.b * 40);
      g.rect(Math.round(x - len), Math.round(y), Math.round(len), 1).fill({ color: c, alpha: tw });
    }
  }

  private fit = (): void => {
    if (!this.host) return;
    const scale = Math.max(1, Math.floor(Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H)));
    this.app.canvas.style.width = `${VIEW_W * scale}px`;
    this.app.canvas.style.height = `${VIEW_H * scale}px`;
  };
}

function approach(v: number, target: number, step: number): number {
  return v < target ? Math.min(v + step, target) : Math.max(v - step, target);
}

export { TILE };
