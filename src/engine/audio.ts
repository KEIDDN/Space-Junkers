/**
 * Audio service. Currently all sounds are synthesised with WebAudio (no sample files
 * exist yet). The public API is sample-agnostic, so recorded sounds can replace the
 * synth voices later without touching gameplay code.
 *
 * Sounds are positional: volume falls off and pans relative to the listener,
 * and distant sounds are muffled. Distance is important information for the player.
 */

export interface GunSound {
  /** Low-frequency body thump (Hz). */
  thump: number;
  /** Brightness of the crack (lowpass cutoff Hz). */
  crack: number;
  /** Crack decay time (s). */
  decay: number;
  /** Room tail length (s). */
  tail: number;
  gain: number;
}

export type Sfx =
  | 'dryfire' | 'switch' | 'step' | 'casing' | 'impactWall' | 'impactFlesh' | 'hurt' | 'kill'
  | 'door' | 'rummage' | 'loot' | 'flashlight' | 'beacon' | 'alarm' | 'extracted'
  | 'shell' | 'cycle' | 'jam' | 'unjam' | 'inject' | 'bandage' | 'heal' | 'armor' | 'headshot' | 'drop'
  | 'bodyfall' | 'whiz' | 'shout' | 'clink' | 'explosion' | 'smokepop' | 'breath'
  | 'breaker' | 'keycard' | 'lift'
  | 'magout' | 'magin' | 'rack' | 'breakopen' | 'breakclose' | 'magdrop' | 'draw' | 'ricochet';

const HEARING_RANGE = 900;
const GUNSHOT_RANGE = 1700;

export type UiSfx = 'click' | 'hover' | 'pickup' | 'drop' | 'error' | 'open' | 'close' | 'buy' | 'sell' | 'equip' | 'tab';

export class AudioService {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private noise!: AudioBuffer;
  private shaper!: WaveShaperNode;
  private listenerX = 0;
  private listenerY = 0;
  /** Reverb send: every positional sound feeds it, more so when far or behind walls. */
  private reverbIn: GainNode | null = null;
  private reverbOut: GainNode | null = null;
  private convolver: ConvolverNode | null = null;
  private room: RoomAcoustics = ROOMS.facility;
  volume = 0.7;

  /** Must be called from a user gesture (browser autoplay policy). */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    comp.attack.value = 0.002;
    comp.release.value = 0.15;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    // Soft saturation gives gunshots weight.
    this.shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * 2.2);
    }
    this.shaper.curve = curve;
    this.shaper.connect(comp);
    this.master.connect(this.shaper);
    comp.connect(ctx.destination);

    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.buildReverb();
  }

  /**
   * Set the acoustics of the space the listener is in: a cramped steel ship, a concrete
   * plant, an ice cavern. Everything positional is heard through it.
   */
  setRoom(kind: keyof typeof ROOMS): void {
    this.room = ROOMS[kind] ?? ROOMS.facility;
    if (this.convolver && this.ctx) this.convolver.buffer = impulse(this.ctx, this.room);
  }

  private buildReverb(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.reverbIn = ctx.createGain();
    this.convolver = ctx.createConvolver();
    this.convolver.buffer = impulse(ctx, this.room);
    this.reverbOut = ctx.createGain();
    this.reverbOut.gain.value = this.room.level;
    this.reverbIn.connect(this.convolver).connect(this.reverbOut).connect(this.master);
  }

  setMasterVolume(v: number): void {
    this.volume = v;
    if (this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  /** Walls between the listener and a sound muffle it. Set by whoever owns the map. */
  private occluder: ((x0: number, y0: number, x1: number, y1: number) => boolean) | null = null;

  setOccluder(fn: ((x0: number, y0: number, x1: number, y1: number) => boolean) | null): void {
    this.occluder = fn;
  }

  setListener(x: number, y: number): void {
    this.listenerX = x;
    this.listenerY = y;
  }

  // ---------------------------------------------------------------------------
  // Ambience: long loops that make a place feel like a place.

  private amb: { stop(): void; hum: GainNode; events: number } | null = null;

  /**
   * Start a looping bed of sound. 'ship': engine hum, air handlers, hull creaks.
   * 'facility': a colder drone, electrical buzz and distant metal groans.
   */
  startAmbience(kind: 'ship' | 'facility'): void {
    this.stopAmbience();
    const ctx = this.ctx;
    if (!ctx) return;
    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0, ctx.currentTime);
    bus.gain.linearRampToValueAtTime(1, ctx.currentTime + 1.5);
    bus.connect(this.master);
    const stops: (() => void)[] = [];

    // Hum: detuned low oscillators through a lowpass.
    const hum = ctx.createGain();
    hum.gain.value = kind === 'ship' ? 0.1 : 0.06;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = kind === 'ship' ? 220 : 160;
    hum.connect(lp).connect(bus);
    for (const [f, g] of (kind === 'ship' ? [[47, 0.7], [94.5, 0.35], [141, 0.12]] : [[38, 0.6], [57.3, 0.3], [113, 0.08]]) as [number, number][]) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      const og = ctx.createGain();
      og.gain.value = g;
      o.connect(og).connect(hum);
      o.start();
      stops.push(() => o.stop());
    }

    // Air: looped noise, band-limited, slowly breathing.
    const air = ctx.createBufferSource();
    air.buffer = this.noise;
    air.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = kind === 'ship' ? 520 : 300;
    bp.Q.value = 0.6;
    const ag = ctx.createGain();
    ag.gain.value = kind === 'ship' ? 0.045 : 0.03;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.015;
    lfo.connect(lfoGain).connect(ag.gain);
    air.connect(bp).connect(ag).connect(bus);
    air.start();
    lfo.start();
    stops.push(() => air.stop(), () => lfo.stop());

    // Occasional events: creaks, clanks, buzzes.
    const events = window.setInterval(() => {
      if (!this.ctx || Math.random() < 0.45) return;
      const t = this.ctx.currentTime;
      const r = Math.random();
      if (r < 0.4) {
        // Hull creak: a slow filtered-noise groan.
        const n = this.noiseSource(t, 1.4);
        const f = this.ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.Q.value = 8;
        f.frequency.setValueAtTime(180 + Math.random() * 120, t);
        f.frequency.linearRampToValueAtTime(90 + Math.random() * 60, t + 1.2);
        n.connect(f).connect(env(this.ctx, t, 0.5, 0.3, 1)).connect(bus);
      } else if (r < 0.75) {
        // Distant clank somewhere in the structure.
        this.thump(bus, t, 70 + Math.random() * 50, 0.25, 0.35);
        this.click(bus, t + 0.01, 900 + Math.random() * 600, 0.25);
      } else if (kind === 'facility') {
        // Electrical buzz from a dying fixture.
        const o = this.ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = 100;
        const f = this.ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 1800;
        o.connect(f).connect(env(this.ctx, t, 0.06, 0.02, 0.5 + Math.random())).connect(bus);
        o.start(t);
        o.stop(t + 1.6);
      } else {
        // Radio chatter bleeding through a bulkhead.
        for (let i = 0; i < 5; i++) this.tone(bus, t + i * 0.09 + Math.random() * 0.05, 700 + Math.random() * 500, 0.06, 0.08);
      }
    }, 4000);

    this.amb = {
      hum,
      events,
      stop: () => {
        window.clearInterval(events);
        const c = this.ctx;
        if (c) bus.gain.setTargetAtTime(0, c.currentTime, 0.2);
        setTimeout(() => {
          for (const s of stops) {
            try {
              s();
            } catch {
              // already stopped
            }
          }
          bus.disconnect();
        }, 900);
      },
    };
  }

  /** 0..1 extra engine loudness (standing next to the reactor). */
  setAmbienceIntensity(k: number): void {
    if (!this.amb || !this.ctx) return;
    this.amb.hum.gain.setTargetAtTime(0.1 + k * 0.25, this.ctx.currentTime, 0.3);
  }

  stopAmbience(): void {
    this.amb?.stop();
    this.amb = null;
  }

  /** A jump to another world: rising whine, a thump, and a long rumble. */
  jump(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const out = ctx.createGain();
    out.gain.value = 0.6;
    out.connect(this.master);
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(60, t);
    o.frequency.exponentialRampToValueAtTime(900, t + 1.6);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(3000, t + 1.6);
    o.connect(f).connect(env(ctx, t, 0.35, 1.2, 0.5)).connect(out);
    o.start(t);
    o.stop(t + 2);
    this.thump(out, t + 1.65, 45, 0.9, 1);
    const n = this.noiseSource(t + 1.6, 2.5);
    const nf = ctx.createBiquadFilter();
    nf.type = 'lowpass';
    nf.frequency.value = 260;
    n.connect(nf).connect(env(ctx, t + 1.6, 0.8, 0.05, 2.2)).connect(out);
  }

  /** One syllable of a character's "voice" while dialogue types out. */
  blip(freq: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const out = ctx.createGain();
    out.gain.value = 0.12;
    out.connect(this.master);
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = freq * (0.92 + Math.random() * 0.16);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1800;
    o.connect(f).connect(env(ctx, t, 0.5, 0.004, 0.05)).connect(out);
    o.start(t);
    o.stop(t + 0.07);
  }

  /** Non-positional interface sounds (menus, inventory). Short, dry, mechanical. */
  ui(kind: UiSfx): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const out = ctx.createGain();
    out.gain.value = 0.32;
    out.connect(this.master);
    const t = ctx.currentTime;
    switch (kind) {
      case 'hover':
        this.click(out, t, 4200, 0.12);
        break;
      case 'click':
        this.click(out, t, 2600, 0.5);
        this.click(out, t + 0.025, 1500, 0.35);
        break;
      case 'tab':
        this.click(out, t, 1800, 0.45);
        this.thump(out, t, 220, 0.04, 0.3);
        break;
      case 'pickup':
        this.click(out, t, 1900, 0.4);
        this.noiseBurst(out, t, 0.05, 1600, 0.25);
        break;
      case 'drop':
        this.thump(out, t, 160, 0.06, 0.55);
        this.click(out, t + 0.01, 1100, 0.45);
        break;
      case 'equip':
        this.click(out, t, 1200, 0.6);
        this.thump(out, t + 0.02, 130, 0.08, 0.6);
        this.click(out, t + 0.07, 2400, 0.4);
        break;
      case 'error':
        this.tone(out, t, 150, 0.09, 0.9);
        this.tone(out, t + 0.1, 120, 0.12, 0.9);
        break;
      case 'open':
        this.noiseBurst(out, t, 0.08, 2400, 0.25);
        this.click(out, t + 0.05, 1600, 0.45);
        break;
      case 'close':
        this.click(out, t, 1400, 0.45);
        this.thump(out, t, 180, 0.05, 0.4);
        break;
      case 'buy':
        this.click(out, t, 2000, 0.5);
        this.tone(out, t + 0.04, 1180, 0.07, 0.5);
        this.tone(out, t + 0.1, 1570, 0.1, 0.5);
        break;
      case 'sell':
        this.tone(out, t, 1570, 0.06, 0.5);
        this.tone(out, t + 0.07, 1180, 0.1, 0.5);
        this.click(out, t + 0.14, 2600, 0.4);
        break;
    }
  }

  /** Silence everything that's playing (scene change). The context stays alive. */
  destroy(): void {
    if (!this.ctx) return;
    const old = this.master;
    const oldReverb = this.reverbOut;
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.shaper);
    old.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02);
    this.buildReverb();
    setTimeout(() => {
      old.disconnect();
      oldReverb?.disconnect();
    }, 200);
  }

  /**
   * A gunshot in layers: the supersonic snap, the powder crack, the body thump, a sub-bass
   * punch for big calibres, and the action cycling. The room does the tail.
   * Close shots are sharp and dry; far ones are a dull boom rolling around the walls.
   */
  gunshot(s: GunSound, x: number, y: number): void {
    const bus = this.spatialBus(x, y, s.gain, GUNSHOT_RANGE, 1.5);
    if (!bus) return;
    const { ctx, out, muffle, d } = bus;
    const t = ctx.currentTime;
    const pitch = 0.94 + Math.random() * 0.12;
    const close = Math.max(0, 1 - d / 450);

    // Snap: a couple of milliseconds of bright noise. Only really there up close.
    if (close > 0.05) {
      const snap = this.noiseSource(t, 0.01);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 2500;
      snap.connect(hp).connect(env(ctx, t, 1.1 * close, 0.0005, 0.012)).connect(out);
    }

    // Crack
    const crack = this.noiseSource(t, s.decay + 0.05);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = s.crack * pitch * muffle;
    crack.connect(lp).connect(env(ctx, t, 1.0, 0.001, s.decay)).connect(out);

    // Body thump
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(s.thump * pitch, t);
    osc.frequency.exponentialRampToValueAtTime(s.thump * 0.35, t + 0.14);
    osc.connect(env(ctx, t, 1.1, 0.001, 0.16)).connect(out);
    osc.start(t);
    osc.stop(t + 0.2);

    // Sub punch for shotguns and full-power rifle rounds: felt more than heard.
    if (s.thump < 100) {
      const sub = ctx.createOscillator();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(52, t);
      sub.frequency.exponentialRampToValueAtTime(34, t + 0.25);
      sub.connect(env(ctx, t, 0.9, 0.003, 0.28)).connect(out);
      sub.start(t);
      sub.stop(t + 0.32);
    }

    // The action cycling: slide or bolt carrier slamming home, audible up close.
    if (close > 0.2 && s.decay < 0.2) {
      this.click(out, t + 0.03 + Math.random() * 0.01, 2600, 0.22 * close);
      this.click(out, t + 0.045, 1500, 0.14 * close);
    }

    // A short slap off the nearest walls; the convolver carries the long tail.
    const tail = this.noiseSource(t, s.tail * 0.6 + 0.05);
    const tlp = ctx.createBiquadFilter();
    tlp.type = 'lowpass';
    tlp.frequency.value = 900 * muffle;
    tail.connect(tlp).connect(env(ctx, t + 0.015, 0.22, 0.01, s.tail * 0.6)).connect(out);
  }

  sfx(kind: Sfx, x = this.listenerX, y = this.listenerY, gainMul = 1): void {
    const gains: Record<Sfx, number> = {
      dryfire: 0.45, switch: 0.4, step: 0.14, casing: 0.12,
      impactWall: 0.35, impactFlesh: 0.7, hurt: 0.9, kill: 0.6,
      door: 0.45, rummage: 0.3, loot: 0.5, flashlight: 0.4, beacon: 0.35, alarm: 0.55, extracted: 0.7,
      shell: 0.45, cycle: 0.55, jam: 0.6, unjam: 0.55, inject: 0.45, bandage: 0.4, heal: 0.25,
      armor: 0.6, headshot: 0.8, drop: 0.35,
      bodyfall: 0.55, whiz: 0.6, shout: 0.45, clink: 0.5, explosion: 1.4, smokepop: 0.6, breath: 0.25,
      breaker: 0.7, keycard: 0.45, lift: 0.5,
      magout: 0.45, magin: 0.55, rack: 0.6, breakopen: 0.55, breakclose: 0.65, magdrop: 0.35, draw: 0.3, ricochet: 0.35,
    };
    const bus = this.spatialBus(x, y, gains[kind] * gainMul);
    if (!bus) return;
    const { ctx, out, muffle } = bus;
    const t = ctx.currentTime;
    switch (kind) {
      case 'dryfire':
        this.click(out, t, 3000, 1);
        break;
      case 'switch':
        this.click(out, t, 1500, 0.8);
        this.click(out, t + 0.08, 2400, 0.6);
        break;
      case 'step': {
        const n = this.noiseSource(t, 0.08);
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = (380 + Math.random() * 120) * muffle;
        n.connect(f).connect(env(ctx, t, 1, 0.004, 0.06)).connect(out);
        break;
      }
      case 'casing':
        this.tone(out, t, 4200 + Math.random() * 1800, 0.07, 1);
        this.tone(out, t + 0.09, 4800 + Math.random() * 1500, 0.05, 0.5);
        break;
      case 'impactWall': {
        const n = this.noiseSource(t, 0.08);
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 2400 * muffle;
        f.Q.value = 1.2;
        n.connect(f).connect(env(ctx, t, 1, 0.001, 0.05)).connect(out);
        if (Math.random() < 0.4) this.tone(out, t, 2500 + Math.random() * 2000, 0.12, 0.35);
        break;
      }
      case 'impactFlesh': {
        const n = this.noiseSource(t, 0.12);
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 450 * muffle;
        n.connect(f).connect(env(ctx, t, 1, 0.002, 0.09)).connect(out);
        this.thump(out, t, 110, 0.1, 0.9);
        break;
      }
      case 'hurt': {
        this.thump(out, t, 70, 0.22, 1);
        const n = this.noiseSource(t, 0.15);
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 900;
        n.connect(f).connect(env(ctx, t, 0.7, 0.002, 0.12)).connect(out);
        break;
      }
      case 'kill':
        this.thump(out, t, 55, 0.3, 1);
        break;
      case 'door': {
        // Pneumatic hiss + clunk
        const n = this.noiseSource(t, 0.4);
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 3000 * muffle;
        f.Q.value = 0.7;
        n.connect(f).connect(env(ctx, t, 0.6, 0.02, 0.3)).connect(out);
        this.thump(out, t + 0.18, 90, 0.12, 0.8);
        break;
      }
      case 'rummage':
        for (let i = 0; i < 3; i++) this.click(out, t + i * 0.07 + Math.random() * 0.03, 700 + Math.random() * 1600, 0.6);
        break;
      case 'loot':
        this.tone(out, t, 880, 0.08, 1);
        this.tone(out, t + 0.07, 1320, 0.12, 1);
        break;
      case 'flashlight':
        this.click(out, t, 2600, 1);
        break;
      case 'beacon':
        this.tone(out, t, 1046, 0.12, 1.2);
        break;
      case 'alarm': {
        // Klaxon: two-tone sawtooth, filtered
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(420, t);
        o.frequency.setValueAtTime(560, t + 0.35);
        o.frequency.setValueAtTime(420, t + 0.7);
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 1400 * muffle;
        o.connect(f).connect(env(ctx, t, 0.5, 0.02, 1.0)).connect(out);
        o.start(t);
        o.stop(t + 1.1);
        break;
      }
      case 'extracted':
        this.tone(out, t, 523, 0.35, 1);
        this.tone(out, t + 0.12, 659, 0.35, 1);
        this.tone(out, t + 0.24, 784, 0.6, 1);
        break;
      case 'shell':
        // A round pushed into a tube: click then a dull seat.
        this.click(out, t, 2400, 0.7);
        this.thump(out, t + 0.02, 180, 0.05, 0.5);
        break;
      case 'cycle':
        // Pump or bolt: back and forward, metal on metal.
        this.click(out, t, 1300, 0.9);
        this.noiseBurst(out, t + 0.01, 0.06, 2600 * muffle, 0.35);
        this.click(out, t + 0.13, 1900, 1);
        this.thump(out, t + 0.13, 140, 0.05, 0.6);
        break;
      case 'jam':
        this.click(out, t, 900, 0.8);
        this.noiseBurst(out, t + 0.03, 0.05, 1200 * muffle, 0.4);
        break;
      case 'unjam':
        this.click(out, t, 1500, 0.8);
        this.click(out, t + 0.18, 2200, 0.9);
        this.click(out, t + 0.3, 1700, 0.7);
        break;
      case 'inject':
        this.click(out, t, 3200, 0.6);
        this.noiseBurst(out, t + 0.05, 0.25, 5000, 0.18);
        break;
      case 'bandage': {
        // Fabric tearing: noise that rises in brightness.
        const n = this.noiseSource(t, 0.45);
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.Q.value = 0.9;
        f.frequency.setValueAtTime(900, t);
        f.frequency.linearRampToValueAtTime(2600, t + 0.4);
        n.connect(f).connect(env(ctx, t, 0.7, 0.05, 0.38)).connect(out);
        break;
      }
      case 'heal':
        this.tone(out, t, 392, 0.25, 0.7);
        this.tone(out, t + 0.1, 523, 0.35, 0.7);
        break;
      case 'armor':
        // A round flattening on a plate: bright ping and grit.
        this.tone(out, t, 2900 + Math.random() * 600, 0.14, 0.9);
        this.noiseBurst(out, t, 0.05, 3800 * muffle, 0.6);
        this.thump(out, t, 120, 0.06, 0.6);
        break;
      case 'headshot':
        this.noiseBurst(out, t, 0.03, 6000 * muffle, 0.9);
        this.thump(out, t + 0.01, 90, 0.16, 1);
        break;
      case 'drop':
        this.thump(out, t, 110, 0.09, 0.8);
        this.noiseBurst(out, t, 0.06, 700, 0.4);
        break;
      case 'bodyfall':
        // A body and its gear hitting deck plating.
        this.thump(out, t, 75, 0.2, 1);
        this.noiseBurst(out, t, 0.12, 900 * muffle, 0.5);
        this.click(out, t + 0.05 + Math.random() * 0.05, 1400, 0.4);
        break;
      case 'whiz': {
        // A round passing close to your head: a snap and a tearing hiss.
        const n = this.noiseSource(t, 0.18);
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.Q.value = 2;
        f.frequency.setValueAtTime(5200, t);
        f.frequency.exponentialRampToValueAtTime(1800, t + 0.15);
        n.connect(f).connect(env(ctx, t, 1, 0.003, 0.14)).connect(out);
        this.click(out, t, 6000, 0.8);
        break;
      }
      case 'shout':
        // A radio squelch and a harsh burst of voice: they're calling you in.
        this.noiseBurst(out, t, 0.05, 3500 * muffle, 0.5);
        for (let i = 0; i < 3; i++) {
          const o = ctx.createOscillator();
          o.type = 'sawtooth';
          o.frequency.setValueAtTime(170 + Math.random() * 60, t + 0.07 + i * 0.12);
          o.frequency.linearRampToValueAtTime(130 + Math.random() * 40, t + 0.17 + i * 0.12);
          const f = ctx.createBiquadFilter();
          f.type = 'bandpass';
          f.frequency.value = 900 * muffle;
          f.Q.value = 1.4;
          o.connect(f).connect(env(ctx, t + 0.07 + i * 0.12, 0.6, 0.01, 0.1)).connect(out);
          o.start(t + 0.07 + i * 0.12);
          o.stop(t + 0.2 + i * 0.12);
        }
        this.noiseBurst(out, t + 0.45, 0.04, 3500 * muffle, 0.4);
        break;
      case 'clink':
        // Grenade landing: bright metal skittering.
        this.tone(out, t, 3100, 0.05, 0.8);
        this.tone(out, t + 0.11, 2700, 0.04, 0.6);
        this.tone(out, t + 0.19, 2900, 0.03, 0.4);
        break;
      case 'explosion': {
        this.thump(out, t, 55, 0.9, 1.4);
        this.thump(out, t, 32, 1.4, 1);
        const n = this.noiseSource(t, 1.8);
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.setValueAtTime(3200 * muffle, t);
        f.frequency.exponentialRampToValueAtTime(180, t + 1.5);
        n.connect(f).connect(env(ctx, t, 1.3, 0.004, 1.6)).connect(out);
        for (let i = 0; i < 5; i++) this.click(out, t + 0.1 + Math.random() * 0.6, 1500 + Math.random() * 2000, 0.3);
        break;
      }
      case 'smokepop':
        this.click(out, t, 1200, 0.7);
        this.noiseBurst(out, t + 0.02, 1.2, 1400 * muffle, 0.45);
        break;
      case 'breath':
        this.noiseBurst(out, t, 0.35, 600, 0.35);
        break;
      case 'ricochet': {
        // The classic whine: a falling, slightly wobbling pitch.
        const o = ctx.createOscillator();
        o.type = 'sine';
        const f0 = 2600 + Math.random() * 900;
        o.frequency.setValueAtTime(f0, t);
        o.frequency.exponentialRampToValueAtTime(f0 * 0.35, t + 0.32);
        const vib = ctx.createOscillator();
        vib.frequency.value = 38;
        const vg = ctx.createGain();
        vg.gain.value = 60;
        vib.connect(vg).connect(o.frequency);
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 5000 * muffle;
        o.connect(f).connect(env(ctx, t, 0.5, 0.004, 0.3)).connect(out);
        o.start(t);
        vib.start(t);
        o.stop(t + 0.36);
        vib.stop(t + 0.36);
        this.click(out, t, 3500, 0.5);
        break;
      }
      case 'magout':
        // Release catch, then the magazine sliding out of the well.
        this.click(out, t, 1700, 0.8);
        this.noiseBurst(out, t + 0.02, 0.07, 2600 * muffle, 0.35);
        this.click(out, t + 0.08, 900, 0.4);
        break;
      case 'magin':
        // Seated: a solid clack with a little body.
        this.thump(out, t, 190, 0.06, 0.5);
        this.click(out, t, 1400, 1);
        this.click(out, t + 0.012, 3200, 0.45);
        break;
      case 'rack':
        // Charging handle back (scrape) and slammed home.
        this.noiseBurst(out, t, 0.06, 3200 * muffle, 0.4);
        this.click(out, t + 0.02, 2300, 0.6);
        this.click(out, t + 0.1, 1700, 1);
        this.thump(out, t + 0.1, 230, 0.05, 0.4);
        this.click(out, t + 0.11, 3600, 0.35);
        break;
      case 'breakopen':
        this.thump(out, t, 140, 0.08, 0.6);
        this.click(out, t, 1100, 0.8);
        this.noiseBurst(out, t + 0.01, 0.1, 900 * muffle, 0.3);
        break;
      case 'breakclose':
        this.click(out, t, 1300, 1);
        this.thump(out, t, 160, 0.07, 0.6);
        this.click(out, t + 0.01, 2800, 0.5);
        break;
      case 'magdrop':
        // Steel magazine clattering on deck plating.
        this.click(out, t, 900, 0.7);
        this.click(out, t + 0.05, 1400, 0.45);
        this.click(out, t + 0.11, 700, 0.3);
        this.tone(out, t, 2100 + Math.random() * 300, 0.05, 0.15);
        break;
      case 'draw':
        // Webbing and a hand on the grip.
        this.noiseBurst(out, t, 0.12, 1300 * muffle, 0.25);
        this.click(out, t + 0.09, 2000, 0.35);
        break;
      case 'breaker': {
        // Heavy lever, contactor slam, then the mains hum coming up.
        this.click(out, t, 900, 1);
        this.thump(out, t + 0.05, 70, 0.8, 0.35);
        this.click(out, t + 0.07, 2600, 0.7);
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(50, t + 0.15);
        o.frequency.linearRampToValueAtTime(100, t + 0.9);
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 500 * muffle;
        o.connect(f).connect(env(ctx, t + 0.15, 0.35, 0.2, 1.3)).connect(out);
        o.start(t + 0.15);
        o.stop(t + 1.7);
        break;
      }
      case 'keycard':
        // Reader accepts: two rising beeps and the bolts drawing back.
        this.tone(out, t, 1320, 0.07, 0.9);
        this.tone(out, t + 0.1, 1760, 0.1, 0.9);
        this.thump(out, t + 0.25, 90, 0.6, 0.2);
        this.click(out, t + 0.3, 1800, 0.6);
        break;
      case 'lift': {
        // Motor winding up under load.
        const o = ctx.createOscillator();
        o.type = 'square';
        o.frequency.setValueAtTime(60, t);
        o.frequency.linearRampToValueAtTime(85, t + 1.4);
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 380 * muffle;
        o.connect(f).connect(env(ctx, t, 0.3, 0.1, 1.5)).connect(out);
        o.start(t);
        o.stop(t + 1.7);
        this.noiseBurst(out, t, 0.9, 500 * muffle, 0.15);
        break;
      }
    }
  }

  // ---------------------------------------------------------------------------

  private spatialBus(x: number, y: number, gain: number, range = HEARING_RANGE, wetMul = 1) {
    const ctx = this.ctx;
    if (!ctx) return null;
    const dx = x - this.listenerX;
    const dy = y - this.listenerY;
    const d = Math.hypot(dx, dy);
    if (d > range) return null;
    let falloff = 1 / (1 + d / 220);
    // Far sounds lose their high end; sounds behind walls lose more, and some volume.
    let muffle = Math.max(0.1, 1 - d / 700);
    if (d > 24 && this.occluder?.(this.listenerX, this.listenerY - 8, x, y - 8)) {
      muffle *= 0.4;
      falloff *= 0.6;
    }
    const out = ctx.createGain();
    out.gain.value = gain * falloff;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.max(-0.8, Math.min(0.8, dx / 320));
    out.connect(pan).connect(this.master);
    // Distance and walls shift a sound from direct to reflected: that's how you hear far.
    if (this.reverbIn) {
      const send = ctx.createGain();
      send.gain.value = Math.min(1.2, (0.16 + d / 900 + (muffle < 0.5 ? 0.3 : 0)) * wetMul);
      out.connect(send).connect(this.reverbIn);
    }
    return { ctx, out, muffle, d };
  }

  private noiseSource(t: number, dur: number): AudioBufferSourceNode {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.start(t, Math.random() * 0.5, dur);
    return src;
  }

  private noiseBurst(out: AudioNode, t: number, dur: number, freq: number, gain: number): void {
    const ctx = this.ctx!;
    const n = this.noiseSource(t, dur + 0.02);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq;
    n.connect(f).connect(env(ctx, t, gain, 0.002, dur)).connect(out);
  }

  private click(out: AudioNode, t: number, freq: number, gain: number): void {
    const ctx = this.ctx!;
    const n = this.noiseSource(t, 0.03);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = 3;
    n.connect(f).connect(env(ctx, t, gain * 2, 0.0005, 0.02)).connect(out);
  }

  private tone(out: AudioNode, t: number, freq: number, dur: number, gain: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq;
    o.connect(env(ctx, t, gain * 0.5, 0.001, dur)).connect(out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private thump(out: AudioNode, t: number, freq: number, dur: number, gain: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.5, t + dur);
    o.connect(env(ctx, t, gain, 0.002, dur)).connect(out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
}

function env(ctx: AudioContext, t: number, peak: number, attack: number, decay: number): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  return g;
}

/** How a space sounds: tail length, how fast highs die, early reflections, overall level. */
export interface RoomAcoustics {
  seconds: number;
  /** 0 = bright ringing metal .. 1 = dark, absorbent. */
  damp: number;
  /** Seconds to the first wall reflections. */
  early: number;
  level: number;
}

export const ROOMS = {
  ship: { seconds: 0.7, damp: 0.25, early: 0.004, level: 0.55 },
  range: { seconds: 1.1, damp: 0.45, early: 0.008, level: 0.6 },
  facility: { seconds: 1.6, damp: 0.55, early: 0.012, level: 0.7 },
  tikhaya: { seconds: 1.7, damp: 0.5, early: 0.012, level: 0.7 },
  merzlota: { seconds: 2.4, damp: 0.35, early: 0.02, level: 0.75 },
  krasnaya: { seconds: 1.3, damp: 0.65, early: 0.01, level: 0.65 },
  kombinat: { seconds: 1.1, damp: 0.3, early: 0.008, level: 0.6 },
  sirin: { seconds: 2.8, damp: 0.7, early: 0.025, level: 0.8 },
} satisfies Record<string, RoomAcoustics>;

/** A synthetic impulse response: early taps, then a decaying noise tail that darkens. */
function impulse(ctx: AudioContext, r: RoomAcoustics): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * r.seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    let y = 0;
    for (let i = 0; i < len; i++) {
      const t = i / rate;
      const k = t / r.seconds;
      const decay = Math.exp(-6.9 * k) * (1 - k);
      // One-pole lowpass whose cutoff falls as the tail ages: highs die first.
      const a = Math.min(0.97, 0.15 + r.damp * 0.75 * Math.sqrt(k) + r.damp * 0.1);
      y += (1 - a) * ((Math.random() * 2 - 1) - y);
      data[i] = y * decay * (t < r.early ? 0 : 1) * 2.2;
    }
    // Early reflections: a handful of discrete taps off nearby walls.
    for (let n = 0; n < 6; n++) {
      const at = Math.floor((r.early + n * r.early * (0.6 + Math.random() * 0.8)) * rate);
      if (at < len) data[at] += (Math.random() < 0.5 ? -1 : 1) * (0.5 - n * 0.06);
    }
  }
  return buf;
}

/** One audio engine for the whole app: the game world and the interface share it. */
export const audio = new AudioService();
