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

type Sfx =
  | 'dryfire' | 'switch' | 'step' | 'casing' | 'impactWall' | 'impactFlesh' | 'hurt' | 'kill'
  | 'door' | 'rummage' | 'loot' | 'flashlight' | 'beacon' | 'alarm' | 'extracted';

const HEARING_RANGE = 900;

export class AudioService {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private noise!: AudioBuffer;
  private shaper!: WaveShaperNode;
  private listenerX = 0;
  private listenerY = 0;
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
  }

  setListener(x: number, y: number): void {
    this.listenerX = x;
    this.listenerY = y;
  }

  destroy(): void {
    void this.ctx?.close();
    this.ctx = null;
  }

  gunshot(s: GunSound, x: number, y: number): void {
    const bus = this.spatialBus(x, y, s.gain);
    if (!bus) return;
    const { ctx, out, muffle } = bus;
    const t = ctx.currentTime;
    const pitch = 0.94 + Math.random() * 0.12;

    // Crack
    const crack = this.noiseSource(t, s.decay + 0.05);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = s.crack * pitch * muffle;
    const cg = env(ctx, t, 1.0, 0.001, s.decay);
    crack.connect(lp).connect(cg).connect(out);

    // Body thump
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(s.thump * pitch, t);
    osc.frequency.exponentialRampToValueAtTime(s.thump * 0.35, t + 0.14);
    const og = env(ctx, t, 1.1, 0.001, 0.16);
    osc.connect(og).connect(out);
    osc.start(t);
    osc.stop(t + 0.2);

    // Room tail: gives the facility a sense of space.
    const tail = this.noiseSource(t, s.tail + 0.05);
    const tlp = ctx.createBiquadFilter();
    tlp.type = 'lowpass';
    tlp.frequency.value = 700 * muffle;
    const tg = env(ctx, t + 0.01, 0.35, 0.02, s.tail);
    tail.connect(tlp).connect(tg).connect(out);
  }

  /** Mag out, mag in, chamber: spread across the reload duration. */
  reload(duration: number, x: number, y: number): void {
    const bus = this.spatialBus(x, y, 0.5);
    if (!bus) return;
    const t = bus.ctx.currentTime;
    this.click(bus.out, t + duration * 0.12, 1800, 0.5);
    this.click(bus.out, t + duration * 0.62, 1200, 0.8);
    this.click(bus.out, t + duration * 0.66, 2600, 0.4);
    this.click(bus.out, t + duration * 0.9, 2200, 0.6);
    this.click(bus.out, t + duration * 0.95, 3200, 0.5);
  }

  sfx(kind: Sfx, x = this.listenerX, y = this.listenerY): void {
    const gains: Record<Sfx, number> = {
      dryfire: 0.45, switch: 0.4, step: 0.14, casing: 0.12,
      impactWall: 0.35, impactFlesh: 0.7, hurt: 0.9, kill: 0.6,
      door: 0.45, rummage: 0.3, loot: 0.5, flashlight: 0.4, beacon: 0.35, alarm: 0.55, extracted: 0.7,
    };
    const bus = this.spatialBus(x, y, gains[kind]);
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
    }
  }

  // ---------------------------------------------------------------------------

  private spatialBus(x: number, y: number, gain: number) {
    const ctx = this.ctx;
    if (!ctx) return null;
    const dx = x - this.listenerX;
    const dy = y - this.listenerY;
    const d = Math.hypot(dx, dy);
    if (d > HEARING_RANGE) return null;
    const falloff = 1 / (1 + d / 220);
    const out = ctx.createGain();
    out.gain.value = gain * falloff;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.max(-0.8, Math.min(0.8, dx / 320));
    out.connect(pan).connect(this.master);
    // Far sounds lose their high end.
    const muffle = Math.max(0.12, 1 - d / 700);
    return { ctx, out, muffle };
  }

  private noiseSource(t: number, dur: number): AudioBufferSourceNode {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.start(t, Math.random() * 0.5, dur);
    return src;
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
