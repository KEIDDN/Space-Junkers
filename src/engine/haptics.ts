import type { WeaponDef } from '../data/weapons';
import { useDevice } from '../state/deviceStore';
import { useSettings } from '../state/settingsStore';
import { padShared } from './pad';

/**
 * Controller rumble. Events add short envelopes (an attack, then a decay) that are mixed
 * and streamed to the pad in small slices, so a long low rumble (an extraction alarm) can
 * carry a sharp shot on top of it and come back after. Strong = the heavy low motor,
 * weak = the light high one. Silent unless a controller is the device in use.
 */

export interface Envelope {
  t: number;
  dur: number;
  strong: number;
  weak: number;
  /** Fade out over the duration (else hold flat). */
  decay: boolean;
  /** Seconds before it starts. */
  delay: number;
}

const SLICE_MS = 34;

/** Mix the active envelopes at their current age. Exported for tests. */
export function mixEnvelopes(list: readonly Envelope[]): { strong: number; weak: number } {
  let strong = 0;
  let weak = 0;
  for (const e of list) {
    if (e.delay > 0 || e.t >= e.dur) continue;
    const k = e.decay ? (1 - e.t / e.dur) ** 2 : 1;
    // Louder things mask quieter ones rather than simply stacking.
    strong = Math.max(strong, e.strong * k) + Math.min(strong, e.strong * k) * 0.35;
    weak = Math.max(weak, e.weak * k) + Math.min(weak, e.weak * k) * 0.35;
  }
  return { strong: Math.min(1, strong), weak: Math.min(1, weak) };
}

type Actuator = {
  playEffect?(type: string, params: Record<string, number>): Promise<unknown>;
  reset?(): Promise<unknown>;
  pulse?(value: number, duration: number): Promise<unknown>;
};

class Haptics {
  private active: Envelope[] = [];
  private timer = 0;
  private lastT = 0;
  private sent = false;

  /** Raw pulse: 0..1 strong and weak motor, for `ms`. */
  pulse(strong: number, weak: number, ms: number, decay = true, delayMs = 0): void {
    if (!this.enabled()) return;
    const g = useSettings.getState().vibration;
    if (g <= 0) return;
    if (this.active.length > 24) this.active.shift();
    this.active.push({ t: 0, dur: ms / 1000, strong: strong * g, weak: weak * g, decay, delay: delayMs / 1000 });
    this.start();
  }

  /** A shot from the player's gun: bigger guns shove harder and ring longer. */
  fire(def: WeaponDef): void {
    const k = def.cameraKick;
    const strong = Math.min(1, (k / 9.5) ** 1.2);
    const weak = 0.35 + Math.min(0.35, k / 20);
    let ms = 45 + k * 20;
    if (def.automatic) ms = Math.min(ms, (0.8 / def.fireRate) * 1000);
    this.pulse(strong, weak, ms);
  }

  /** Took a hit: the heavier the wound, the deeper the thump. Armor makes it a sharp knock. */
  hurt(damage: number, blocked: boolean): void {
    if (blocked) this.pulse(0.3, 0.7, 110);
    else this.pulse(Math.min(1, 0.45 + damage / 60), 0.5, 170 + Math.min(200, damage * 4));
  }

  /** An explosion at a distance (px). */
  blast(dist: number): void {
    const k = Math.max(0, 1 - dist / 520);
    if (k <= 0.05) return;
    this.pulse(k, k * 0.6, 250 + 450 * k);
  }

  /** A kill: one firm beat of confirmation. */
  confirm(): void {
    this.pulse(0.25, 0.3, 90);
  }

  /** Low health: lub-dub. */
  heartbeat(k: number): void {
    this.pulse(0.3 + 0.3 * k, 0, 70);
    this.pulse(0.2 + 0.2 * k, 0, 60, true, 170);
  }

  /** Something worked (a search finished, a breaker thrown): a light tick. */
  tick(strength = 0.2): void {
    this.pulse(0, strength, 40);
  }

  /** A long low rumble (extraction under way, a jump, a death). */
  rumble(strong: number, weak: number, ms: number, decay = true): void {
    this.pulse(strong, weak, ms, decay);
  }

  stop(): void {
    this.active = [];
    this.send(0, 0);
  }

  private enabled(): boolean {
    return useDevice.getState().device === 'pad';
  }

  private start(): void {
    if (this.timer) return;
    this.lastT = performance.now();
    this.timer = window.setInterval(this.step, SLICE_MS);
    this.step();
  }

  private step = (): void => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastT) / 1000);
    this.lastT = now;
    for (const e of this.active) {
      if (e.delay > 0) e.delay -= dt;
      else e.t += dt;
    }
    this.active = this.active.filter((e) => e.t < e.dur);
    const { strong, weak } = mixEnvelopes(this.active);
    if (strong < 0.02 && weak < 0.02) {
      if (this.sent) this.send(0, 0);
      if (!this.active.length) {
        window.clearInterval(this.timer);
        this.timer = 0;
      }
      return;
    }
    this.send(strong, weak);
  };

  private send(strong: number, weak: number): void {
    const pad = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads()[padShared.lastIndex] : null;
    const act = (pad as unknown as { vibrationActuator?: Actuator; hapticActuators?: Actuator[] } | null);
    if (!act) return;
    this.sent = strong > 0 || weak > 0;
    try {
      const v = act.vibrationActuator;
      if (v?.playEffect) {
        if (!this.sent) void v.reset?.().catch(() => {});
        else void v.playEffect('dual-rumble', { startDelay: 0, duration: SLICE_MS + 30, strongMagnitude: strong, weakMagnitude: weak }).catch(() => {});
        return;
      }
      const h = act.hapticActuators?.[0];
      if (h?.pulse && this.sent) void h.pulse(Math.max(strong, weak), SLICE_MS + 30).catch(() => {});
    } catch {
      // A pad that says it can rumble and then can't: stay quiet, never break the game.
    }
  }
}

export const haptics = new Haptics();
export type { Haptics };
