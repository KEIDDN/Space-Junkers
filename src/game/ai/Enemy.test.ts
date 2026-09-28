import { describe, expect, it, vi } from 'vitest';

// The AI is pure logic plus an ActorView; stub the view so it runs without a renderer.
vi.mock('../entities/ActorView', () => ({
  ActorView: class {
    stepped = false;
    thudded = false;
    events = [];
    container = { x: 0, y: 0 };
    muzzleAngle = 0;
    pulse() {}
    ejectWorld(x: number, y: number) {
      return { x, y: y - 17 };
    }
    setWeapon() {}
    update() {}
    hitFlash() {}
    flinch() {}
    playDeath() {}
    kick() {}
    muzzleWorld(x: number, y: number) {
      return { x, y: y - 17 };
    }
  },
}));
vi.mock('../../engine/assets', () => ({ anim: () => [], hasAnim: () => false, tex: () => ({}) }));

import { DEFAULT_AI, ENEMIES, FIRST_RAID_AI } from '../../data/enemies';
import type { GameContext } from '../context';
import { mapFromAscii } from '../world/tilemap';
import { Enemy, type Target } from './Enemy';

const MAP = mapFromAscii([
  '##############################',
  '#............................#',
  '#............................#',
  '#............................#',
  '#............#...............#',
  '#............#...............#',
  '#............#...............#',
  '#............................#',
  '##############################',
]);

function ctx(extra: Partial<GameContext> = {}): GameContext & { shots: number; grenades: number } {
  const c = {
    map: MAP,
    shots: 0,
    grenades: 0,
    projectiles: { fire: () => { c.shots++; } },
    effects: { muzzleFlash() {}, smoke() {}, casing() {}, dropMag() {}, stepDust() {} },
    audio: { sfx() {}, gunshot() {}, step() {} },
    camera: { shake() {}, kick() {} },
    emitNoise() {},
    hitstop() {},
    lightFlash() {},
    smokeBetween: () => false,
    throwGrenade: () => { c.grenades++; },
    surfaceAt: () => 'deck',
    ...extra,
  };
  return c as unknown as GameContext & { shots: number; grenades: number };
}

const T = (x: number, y: number, conspicuity = 1): Target => ({ x, y, alive: true, conspicuity });
const tile = (t: number) => t * 32 + 16;

function run(e: Enemy, t: Target, seconds: number, others: Enemy[] = [e]) {
  for (let i = 0; i < seconds * 60; i++) e.update(1 / 60, t, others);
}

function faceTarget(e: Enemy, t: Target) {
  (e as unknown as { facing: number }).facing = Math.atan2(t.y - e.y, t.x - e.x);
}

describe('enemy AI', () => {
  it('awareness takes a moment at range, near-instant up close', () => {
    const far = new Enemy(ctx(), ENEMIES.scavenger, tile(2), tile(2));
    const t = T(tile(10), tile(2));
    faceTarget(far, t);
    run(far, t, 0.15);
    expect(far.state).not.toBe('combat');
    run(far, t, 1.5);
    expect(far.state).toBe('combat');

    const near = new Enemy(ctx(), ENEMIES.scavenger, tile(2), tile(2));
    const t2 = T(tile(3), tile(2));
    run(near, t2, 0.2);
    expect(near.state).toBe('combat');
  });

  it('does not see through walls or smoke, and darkness shortens sight', () => {
    const e = new Enemy(ctx(), ENEMIES.soldier, tile(10), tile(5));
    const behindWall = T(tile(16), tile(5));
    faceTarget(e, behindWall);
    run(e, behindWall, 2);
    expect(e.state).not.toBe('combat');

    const smoky = new Enemy(ctx({ smokeBetween: () => true }), ENEMIES.soldier, tile(2), tile(2));
    const t = T(tile(6), tile(2));
    faceTarget(smoky, t);
    run(smoky, t, 2);
    expect(smoky.state).not.toBe('combat');

    const dark = new Enemy(ctx(), ENEMIES.scavenger, tile(2), tile(2));
    const shadowy = T(tile(11), tile(2), 0.42); // 9 tiles away in the dark, flashlight off
    faceTarget(dark, shadowy);
    run(dark, shadowy, 3);
    expect(dark.state).not.toBe('combat');
  });

  it('hears gunfire and goes to look, with some error', () => {
    const e = new Enemy(ctx(), ENEMIES.scavenger, tile(2), tile(2));
    e.hear(tile(12), tile(2), 560); // an AKR-74 shot in the open, ~10 tiles away
    expect(['alert', 'investigate']).toContain(e.state);
    const before = e.x;
    run(e, T(-9999, -9999), 2);
    expect(e.x).toBeGreaterThan(before);
  });

  it('shouts to allies when it engages', () => {
    const c = ctx();
    const a = new Enemy(c, ENEMIES.soldier, tile(2), tile(2));
    const b = new Enemy(c, ENEMIES.soldier, tile(6), tile(6));
    a.allies = b.allies = [a, b];
    const t = T(tile(3), tile(2));
    run(a, t, 0.3, [a, b]);
    expect(a.state).toBe('combat');
    // b can't see the target from where it stands, but heard the shout.
    for (let i = 0; i < 60; i++) b.update(1 / 60, T(-9999, -9999), [a, b]);
    expect(['chase', 'search', 'flank']).toContain(b.state);
  });

  it('fights back: opens fire after reacting', () => {
    const c = ctx();
    const e = new Enemy(c, ENEMIES.soldier, tile(2), tile(2));
    const t = T(tile(8), tile(2));
    faceTarget(e, t);
    run(e, t, 3);
    expect(c.shots).toBeGreaterThan(0);
  });

  it('suppression sends it into cover', () => {
    const e = new Enemy(ctx(), ENEMIES.soldier, tile(10), tile(2));
    const t = T(tile(18), tile(2));
    faceTarget(e, t);
    run(e, t, 1.5);
    expect(e.state).toBe('combat');
    for (let i = 0; i < 4; i++) e.nearMiss(t.x, t.y);
    run(e, t, 0.1);
    expect(['cover', 'combat']).toContain(e.state);
    expect(e.suppression).toBeGreaterThan(0.5);
  });

  it('a learning operator gets longer to react before the first shot', () => {
    const firstShot = (tuning: typeof DEFAULT_AI) => {
      let total = 0;
      for (let k = 0; k < 20; k++) {
        const c = ctx();
        const e = new Enemy(c, ENEMIES.scavenger, tile(2), tile(2), null, tuning);
        const t = T(tile(8), tile(2));
        faceTarget(e, t);
        let i = 0;
        while (c.shots === 0 && i < 600) {
          e.update(1 / 60, t, [e]);
          i++;
        }
        total += i / 60;
      }
      return total / 20;
    };
    expect(firstShot(FIRST_RAID_AI)).toBeGreaterThan(firstShot(DEFAULT_AI) + 0.25);
  });

  it('fires wild in the first moments of a fight, then settles', () => {
    // Single aimed shots (no bloom): the first one after contact against later ones.
    let first = 0;
    let later = 0;
    let n = 0;
    for (let k = 0; k < 60; k++) {
      const shots: { t: number; a: number }[] = [];
      let now = 0;
      const t = T(tile(9), tile(2));
      const box: { e?: Enemy } = {};
      const c = ctx({
        projectiles: {
          fire: (_x: number, _y: number, a: number) => {
            const bearing = Math.atan2(t.y - box.e!.y, t.x - box.e!.x);
            shots.push({ t: now, a: Math.atan2(Math.sin(a - bearing), Math.cos(a - bearing)) });
          },
        } as never,
      });
      const def = { ...ENEMIES.scavenger, weapons: ['pm9'], burst: [1, 1] as [number, number] };
      const e = new Enemy(c, def, tile(2), tile(2), null, FIRST_RAID_AI);
      box.e = e;
      faceTarget(e, t);
      for (let i = 0; i < 60 * 8; i++, now += 1 / 60) e.update(1 / 60, t, [e]);
      const late = shots.filter((q) => q.t > shots[0].t + 3);
      if (!shots.length || !late.length) continue;
      first += Math.abs(shots[0].a);
      later += late.reduce((m, q) => m + Math.abs(q.a), 0) / late.length;
      n++;
    }
    expect(n).toBeGreaterThan(15);
    expect(first / n).toBeGreaterThan((later / n) * 1.3);
  });
});

describe('stations and posts', () => {
  const nobody = { x: 0, y: 0, alive: false, conspicuity: 0 };

  it('a guard who went to look at a noise goes back to where they were stationed', () => {
    const e = new Enemy(ctx(), ENEMIES.scavenger, tile(4), tile(2), null, DEFAULT_AI);
    e.hear(tile(10), tile(2), 400);
    run(e, nobody, 4);
    expect(Math.hypot(e.x - tile(4), e.y - tile(2))).toBeGreaterThan(64);
    run(e, nobody, 40);
    expect(Math.hypot(e.x - tile(4), e.y - tile(2))).toBeLessThan(40);
    expect(e.state).toBe('idle');
  });

  it('a posted guard holds the room: a shout from across the facility turns them, it does not move them', () => {
    const posted = new Enemy(ctx(), ENEMIES.scavenger, tile(2), tile(2), null, DEFAULT_AI, undefined, true);
    posted.alertTo(tile(27), tile(6), 0);
    posted.hear(tile(27), tile(6), 600);
    run(posted, nobody, 5);
    expect(Math.hypot(posted.x - tile(2), posted.y - tile(2))).toBeLessThan(40);
    const free = new Enemy(ctx(), ENEMIES.scavenger, tile(2), tile(2), null, DEFAULT_AI);
    free.alertTo(tile(27), tile(6), 0);
    run(free, nobody, 5);
    expect(Math.hypot(free.x - tile(2), free.y - tile(2))).toBeGreaterThan(64);
  });

  it('a posted guard still answers what happens in their own room', () => {
    const posted = new Enemy(ctx(), ENEMIES.scavenger, tile(2), tile(2), null, DEFAULT_AI, undefined, true);
    posted.hear(tile(6), tile(3), 400);
    expect(posted.state === 'alert' || posted.state === 'investigate').toBe(true);
  });
});

