/**
 * Audio service. Currently all sounds are synthesised with WebAudio (no sample files
 * exist yet). The public API is sample-agnostic, so recorded sounds can replace the
 * synth voices later without touching gameplay code.
 *
 * Sounds are positional: volume falls off and pans relative to the listener,
 * and distant sounds are muffled. Distance is important information for the player.
 */

export interface GunSound {
  /** Recorded takes (public/assets/sfx/gun_<sample>_n|f_*.ogg); the synth layers are the fallback. */
  sample?: string;
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
  | 'magout' | 'magin' | 'rack' | 'bolt' | 'breakopen' | 'breakclose' | 'magdrop' | 'draw' | 'ricochet'
  | 'heartbeat' | 'mutter' | 'typing' | 'beeps' | 'sharpen' | 'cards' | 'radio' | 'zap' | 'hiss';

import { SAMPLE_GROUPS } from './sampleManifest';

/** What a foot lands on. */
export type Surface = 'deck' | 'plate' | 'grate';

/** Kinds of machinery that hum where they stand. */
export type EmitterKind = 'machine' | 'electronic' | 'vent';

const HEARING_RANGE = 900;
/** The bed of room tone sits well under anything that happens. */
const AMBIENCE_LEVEL = 0.55;
const GUNSHOT_RANGE = 1700;

export type UiSfx = 'click' | 'hover' | 'pickup' | 'drop' | 'error' | 'open' | 'close' | 'buy' | 'sell' | 'equip' | 'tab' | 'tick' | 'relief' | 'loss' | 'valuable';

export class AudioService {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private noise!: AudioBuffer;
  private shaper!: WaveShaperNode;
  /** Between the mix and the output: closes down when the operator is dying. */
  private hearing!: BiquadFilterNode;
  private listenerX = 0;
  private listenerY = 0;
  /** Reverb send: every positional sound feeds it, more so when far or behind walls. */
  private reverbIn: GainNode | null = null;
  private reverbOut: GainNode | null = null;
  private convolver: ConvolverNode | null = null;
  private room: RoomAcoustics = ROOMS.facility;
  /** Recorded takes by group (guns, boots, impacts, handling). Synth covers anything missing. */
  private samples = new Map<string, AudioBuffer[]>();
  private samplesLoading: Promise<void> | null = null;
  private lastTake = new Map<string, number>();
  /** Music: streamed pieces through their own fader, under the master volume. */
  private musicBus: GainNode | null = null;
  private tracks = new Map<MusicTrack, { el: HTMLAudioElement; gain: GainNode }>();
  private currentTrack: MusicTrack | null = null;
  private musicVolume = 0.6;
  volume = 0.7;

  /** The browser hasn't let sound start yet (it needs a click or a key first). */
  get locked(): boolean {
    return !this.ctx || this.ctx.state !== 'running';
  }

  /** Must be called from a user gesture (browser autoplay policy). */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      // Music asked for before the browser allowed sound starts now.
      const cur = this.currentTrack ? this.tracks.get(this.currentTrack) : null;
      if (cur?.el.paused) void cur.el.play().catch(() => {});
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
      curve[i] = Math.tanh(x * 1.5) / Math.tanh(1.5);
    }
    this.shaper.curve = curve;
    this.shaper.connect(comp);
    this.hearing = ctx.createBiquadFilter();
    this.hearing.type = 'lowpass';
    this.hearing.frequency.value = 20000;
    this.hearing.connect(this.shaper);
    this.master.connect(this.hearing);
    comp.connect(ctx.destination);

    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.buildReverb();
    void this.loadSamples();
  }

  /** Fetch and decode every recorded take. Anything that fails stays synthesized. */
  loadSamples(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) return Promise.resolve();
    this.samplesLoading ??= Promise.all(Object.entries(SAMPLE_GROUPS).map(async ([group, n]) => {
      const takes = await Promise.all(Array.from({ length: n }, async (_, i) => {
        try {
          const r = await fetch(`${import.meta.env.BASE_URL}assets/sfx/${group}_${i}.ogg`);
          return r.ok ? await ctx.decodeAudioData(await r.arrayBuffer()) : null;
        } catch {
          return null;
        }
      }));
      const ok = takes.filter((b): b is AudioBuffer => !!b);
      if (ok.length) this.samples.set(group, ok);
    })).then(() => undefined);
    return this.samplesLoading;
  }

  /**
   * Play a piece of music (or none), crossfading from whatever was playing. `level` is
   * this piece's own loudness (0..1) before the player's music volume.
   */
  music(track: MusicTrack | null, level = 1, fade = 2): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (!this.musicBus) {
      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = this.musicVolume;
      this.musicBus.connect(this.master);
    }
    if (track !== this.currentTrack) {
      const old = this.currentTrack ? this.tracks.get(this.currentTrack) : null;
      if (old) {
        old.gain.gain.setTargetAtTime(0, ctx.currentTime, fade / 3);
        const el = old.el;
        window.setTimeout(() => {
          if (this.currentTrack === null || this.tracks.get(this.currentTrack)?.el !== el) el.pause();
        }, fade * 1000 + 400);
      }
      this.currentTrack = track;
    }
    if (!track) return;
    let t = this.tracks.get(track);
    if (!t) {
      const el = new Audio(`${import.meta.env.BASE_URL}assets/music/${track}.ogg`);
      el.loop = true;
      el.preload = 'auto';
      const gain = ctx.createGain();
      gain.gain.value = 0;
      ctx.createMediaElementSource(el).connect(gain).connect(this.musicBus);
      t = { el, gain };
      this.tracks.set(track, t);
    }
    t.gain.gain.setTargetAtTime(level * MUSIC_LEVEL[track], ctx.currentTime, fade / 3);
    if (t.el.paused) void t.el.play().catch(() => { /* waits for the next unlock */ });
  }

  /** The player's music volume, 0..1. */
  setMusicVolume(v: number): void {
    this.musicVolume = v;
    if (this.ctx && this.musicBus) this.musicBus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1);
  }

  /** Recorded takes are loaded for this group. */
  hasSample(group: string): boolean {
    return this.samples.has(group);
  }

  /**
   * One take from a recorded group into `out` (never the same take twice running).
   * Returns false when the group isn't available, so the caller can synthesize instead.
   */
  private take(out: AudioNode, group: string, t: number, gain: number, rate = 1, lowpass = 20000): boolean {
    const list = this.samples.get(group);
    const ctx = this.ctx;
    if (!list || !ctx) return false;
    let i = Math.floor(Math.random() * list.length);
    if (list.length > 1 && i === this.lastTake.get(group)) i = (i + 1) % list.length;
    this.lastTake.set(group, i);
    const src = ctx.createBufferSource();
    src.buffer = list[i];
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = gain;
    if (lowpass < 17000) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lowpass;
      src.connect(f).connect(g).connect(out);
    } else src.connect(g).connect(out);
    src.start(t);
    return true;
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

  /** Everything goes dull and distant (dying, or watching the ship leave). */
  setMuffled(on: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const f = this.hearing.frequency;
    f.cancelScheduledValues(ctx.currentTime);
    f.setTargetAtTime(on ? 380 : 20000, ctx.currentTime, on ? 0.45 : 0.05);
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

  private amb: { stop(): void; hum: GainNode; bus: GainNode; emitters: Record<EmitterKind, { gain: GainNode; pan: StereoPannerNode }> } | null = null;
  /** Seconds until the next lull, and whether one is running. */
  private lullAt = 0;

  /**
   * Start a looping bed of sound. 'ship': engine hum, air handlers, hull creaks.
   * 'facility': a colder drone plus the character of the world it's on (`place`).
   * The bed breathes: now and then it drops into near-silence for a while.
   */
  startAmbience(kind: 'ship' | 'facility', place = 'tikhaya'): void {
    this.stopAmbience();
    const ctx = this.ctx;
    if (!ctx) return;
    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0, ctx.currentTime);
    bus.gain.linearRampToValueAtTime(AMBIENCE_LEVEL, ctx.currentTime + 1.5);
    bus.connect(this.master);
    const stops: (() => void)[] = [];
    const osc = (type: OscillatorType, f: number, g: number, to: AudioNode) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const og = ctx.createGain();
      og.gain.value = g;
      o.connect(og).connect(to);
      o.start();
      stops.push(() => o.stop());
      return { o, og };
    };
    const loopNoise = (type: BiquadFilterType, f: number, q: number, g: number, to: AudioNode) => {
      const n = ctx.createBufferSource();
      n.buffer = this.noise;
      n.loop = true;
      const bf = ctx.createBiquadFilter();
      bf.type = type;
      bf.frequency.value = f;
      bf.Q.value = q;
      const ng = ctx.createGain();
      ng.gain.value = g;
      n.connect(bf).connect(ng).connect(to);
      n.start();
      stops.push(() => n.stop());
      return { bf, ng };
    };
    const lfo = (rate: number, depth: number, param: AudioParam) => {
      const o = ctx.createOscillator();
      o.frequency.value = rate;
      const g = ctx.createGain();
      g.gain.value = depth;
      o.connect(g).connect(param);
      o.start();
      stops.push(() => o.stop());
    };

    // Hum: detuned low oscillators through a lowpass.
    const hum = ctx.createGain();
    hum.gain.value = kind === 'ship' ? 0.1 : 0.06;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = kind === 'ship' ? 220 : 160;
    hum.connect(lp).connect(bus);
    for (const [f, g] of (kind === 'ship' ? [[47, 0.7], [94.5, 0.35], [141, 0.12]] : [[38, 0.6], [57.3, 0.3], [113, 0.08]]) as [number, number][]) {
      osc('triangle', f, g, hum);
    }

    // Air: band-limited noise, slowly breathing.
    const air = loopNoise('bandpass', kind === 'ship' ? 520 : 300, 0.6, kind === 'ship' ? 0.045 : 0.03, bus);
    lfo(0.07, 0.015, air.ng.gain);

    // The world's own character.
    if (kind === 'facility') {
      if (place === 'merzlota') {
        // Wind through the shafts, rising and falling.
        const wind = loopNoise('bandpass', 520, 1.4, 0.035, bus);
        lfo(0.05, 320, wind.bf.frequency);
        lfo(0.11, 0.02, wind.ng.gain);
      } else if (place === 'krasnaya') {
        const wind = loopNoise('bandpass', 1300, 0.8, 0.018, bus);
        lfo(0.08, 500, wind.bf.frequency);
      } else if (place === 'kombinat') {
        // Clean air handling and the whine of hardware that never sleeps.
        loopNoise('highpass', 3200, 0.5, 0.012, bus);
        osc('sine', 7800, 0.0025, bus);
      } else if (place === 'sirin') {
        // A slow pulse and two tones beating against each other. Something is alive here.
        const pulse = ctx.createGain();
        pulse.gain.value = 0.03;
        pulse.connect(bus);
        osc('sine', 41, 1, pulse);
        lfo(0.45, 0.028, pulse.gain);
        osc('sine', 110, 0.012, bus);
        osc('sine', 111.6, 0.012, bus);
      }
    }

    // Positional loops, steered by what the listener is standing near.
    const emitters = {} as Record<EmitterKind, { gain: GainNode; pan: StereoPannerNode }>;
    for (const k of ['machine', 'electronic', 'vent'] as EmitterKind[]) {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const pan = ctx.createStereoPanner();
      gain.connect(pan).connect(bus);
      if (this.reverbIn) {
        const send = ctx.createGain();
        send.gain.value = 0.25;
        gain.connect(send).connect(this.reverbIn);
      }
      emitters[k] = { gain, pan };
    }
    // Machine: a heavy rotating thrum.
    const m = ctx.createGain();
    m.gain.value = 0.18;
    m.connect(emitters.machine.gain);
    osc('sawtooth', 55, 0.5, m);
    osc('sine', 110, 0.4, m);
    const mf = ctx.createBiquadFilter();
    mf.type = 'lowpass';
    mf.frequency.value = 240;
    m.disconnect();
    m.connect(mf).connect(emitters.machine.gain);
    lfo(1.3, 0.08, m.gain);
    // Electronics: a thin whine and the hiss of fans.
    osc('sine', 3150, 0.008, emitters.electronic.gain);
    loopNoise('bandpass', 4200, 2, 0.02, emitters.electronic.gain);
    // Vents: a breathy rush.
    loopNoise('bandpass', 750, 0.7, 0.07, emitters.vent.gain);

    // Occasional events: creaks, clanks, buzzes, and further off, other people's fights.
    this.lullAt = 45 + Math.random() * 50;
    let lullLeft = 0;
    let t0 = ctx.currentTime;
    const events = window.setInterval(() => {
      const c = this.ctx;
      if (!c) return;
      const t = c.currentTime;
      const dt = t - t0;
      t0 = t;
      // Lulls: the whole place holds its breath for a while.
      if (kind === 'facility') {
        if (lullLeft > 0) {
          lullLeft -= dt;
          if (lullLeft <= 0) bus.gain.setTargetAtTime(AMBIENCE_LEVEL, t, 2);
          return;
        }
        this.lullAt -= dt;
        if (this.lullAt <= 0) {
          this.lullAt = 50 + Math.random() * 60;
          lullLeft = 10 + Math.random() * 8;
          bus.gain.setTargetAtTime(AMBIENCE_LEVEL * 0.3, t, 1.5);
          return;
        }
      }
      if (Math.random() < 0.45) return;
      const r = Math.random();
      if (kind === 'facility' && r < 0.06) {
        this.distantFight(bus, t);
      } else if (r < 0.4) {
        // Structure creak: a slow filtered-noise groan (ice cracks on Merzlota).
        const n = this.noiseSource(t, 1.4);
        const f = c.createBiquadFilter();
        f.type = 'bandpass';
        f.Q.value = 8;
        const hi = place === 'merzlota' && kind === 'facility';
        f.frequency.setValueAtTime(hi ? 900 + Math.random() * 600 : 180 + Math.random() * 120, t);
        f.frequency.linearRampToValueAtTime(hi ? 400 : 90 + Math.random() * 60, t + 1.2);
        n.connect(f).connect(env(c, t, 0.5, 0.3, 1)).connect(bus);
      } else if (r < 0.7) {
        // Distant clank somewhere in the structure (a press, loose sheet metal, a hatch).
        this.thump(bus, t, 70 + Math.random() * 50, 0.25, 0.35);
        this.click(bus, t + 0.01, 900 + Math.random() * 600, 0.25);
        if (place === 'tikhaya' && kind === 'facility') {
          // A stamping press, still working a shift nobody's on.
          for (let i = 1; i < 4; i++) this.thump(bus, t + i * 1.7, 60, 0.2, 0.25);
        }
      } else if (kind === 'facility' && place === 'kombinat') {
        // A polite chime from a system nobody answers.
        this.tone(bus, t, 880, 0.25, 0.06);
        this.tone(bus, t + 0.28, 660, 0.35, 0.06);
      } else if (kind === 'facility' && place === 'sirin') {
        // A swell that sounds almost like breath.
        const n = this.noiseSource(t, 2.4);
        const f = c.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 600 + Math.random() * 400;
        f.Q.value = 3;
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.08, t + 1.6);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 2.3);
        n.connect(f).connect(g).connect(bus);
      } else if (kind === 'facility' && place === 'merzlota') {
        // Meltwater dripping somewhere.
        for (let i = 0; i < 3; i++) this.tone(bus, t + i * (0.4 + Math.random() * 0.5), 1800 + Math.random() * 900, 0.03, 0.05);
      } else if (kind === 'facility' && place === 'krasnaya') {
        // A radio left on, static and a scrap of voice.
        this.noiseBurst(bus, t, 0.5, 2600, 0.05);
        for (let i = 0; i < 4; i++) this.tone(bus, t + 0.1 + i * 0.1, 500 + Math.random() * 300, 0.06, 0.04);
      } else if (kind === 'facility') {
        // Electrical buzz from a dying fixture.
        const o = c.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = 100;
        const f = c.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 1800;
        o.connect(f).connect(env(c, t, 0.06, 0.02, 0.5 + Math.random())).connect(bus);
        o.start(t);
        o.stop(t + 1.6);
      } else {
        // Radio chatter bleeding through a bulkhead.
        for (let i = 0; i < 5; i++) this.tone(bus, t + i * 0.09 + Math.random() * 0.05, 700 + Math.random() * 500, 0.06, 0.08);
      }
    }, 4000);

    this.amb = {
      hum,
      bus,
      emitters,
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

  /** Somebody else's firefight, far away through a lot of concrete. */
  private distantFight(out: AudioNode, t: number): void {
    const ctx = this.ctx!;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.6 - 0.8;
    const g = ctx.createGain();
    g.gain.value = 0.25;
    g.connect(pan).connect(out);
    if (this.reverbIn) {
      const send = ctx.createGain();
      send.gain.value = 0.8;
      g.connect(send).connect(this.reverbIn);
    }
    const shots = 3 + Math.floor(Math.random() * 6);
    const auto = Math.random() < 0.5;
    let at = t;
    for (let i = 0; i < shots; i++) {
      at += auto ? 0.09 + Math.random() * 0.03 : 0.25 + Math.random() * 0.6;
      this.thump(g, at, 70, 0.2, 0.6);
      this.noiseBurst(g, at, 0.12, 380, 0.5);
    }
  }

  /** How loud each kind of machinery near the listener is (0..1), and where (-1..1 pan). */
  setEmitters(levels: Partial<Record<EmitterKind, { level: number; pan: number }>>): void {
    const c = this.ctx;
    if (!c || !this.amb) return;
    for (const [k, e] of Object.entries(this.amb.emitters) as [EmitterKind, { gain: GainNode; pan: StereoPannerNode }][]) {
      const v = levels[k];
      e.gain.gain.setTargetAtTime(v ? v.level : 0, c.currentTime, 0.25);
      if (v) e.pan.pan.setTargetAtTime(Math.max(-0.8, Math.min(0.8, v.pan)), c.currentTime, 0.25);
    }
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

  /** Leaving the airlock: the hatch hisses, clamps release, and the drop begins. */
  descent(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const out = ctx.createGain();
    out.gain.value = 0.5;
    out.connect(this.master);
    const t = ctx.currentTime;
    // Hatch seal venting
    const n = this.noiseSource(t, 1.2);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2200;
    n.connect(hp).connect(env(ctx, t, 0.4, 0.05, 1.1)).connect(out);
    // Clamps
    this.thump(out, t + 0.9, 90, 0.2, 0.8);
    this.click(out, t + 0.9, 1200, 0.8);
    this.thump(out, t + 1.1, 80, 0.2, 0.7);
    // The drop: a low roar that swells and fades as the facility comes up.
    const r = this.noiseSource(t + 1.2, 2.2);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(120, t + 1.2);
    lp.frequency.linearRampToValueAtTime(420, t + 2.2);
    lp.frequency.linearRampToValueAtTime(90, t + 3.3);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t + 1.2);
    g.gain.exponentialRampToValueAtTime(0.9, t + 2.0);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.4);
    r.connect(lp).connect(g).connect(out);
    this.thump(out, t + 3.0, 50, 0.5, 0.8);
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
    const r = (a: number, b: number) => a + Math.random() * (b - a);
    switch (kind) {
      case 'hover':
        if (!this.take(out, 'ui_tick', t, 0.3, r(1.05, 1.15))) this.click(out, t, 4200, 0.12);
        break;
      case 'click':
        // A heavy toggle on an old console.
        if (!this.take(out, 'ui_switch', t, 0.6, r(0.95, 1.05))) {
          this.click(out, t, 2600, 0.5);
          this.click(out, t + 0.025, 1500, 0.35);
        }
        break;
      case 'tab':
        if (!this.take(out, 'ui_switch', t, 0.45, r(1.2, 1.3))) this.click(out, t, 1800, 0.45);
        this.thump(out, t, 220, 0.04, 0.3);
        break;
      case 'pickup':
        if (!this.take(out, 'cloth', t, 0.4, r(1.3, 1.5))) this.noiseBurst(out, t, 0.05, 1600, 0.25);
        this.click(out, t, 1900, 0.3);
        break;
      case 'drop':
        if (!this.take(out, 'bagdrop', t, 0.55, r(1.1, 1.25))) this.thump(out, t, 160, 0.06, 0.55);
        this.click(out, t + 0.01, 1100, 0.35);
        break;
      case 'equip':
        this.take(out, 'cloth', t, 0.4, r(1.1, 1.2));
        this.click(out, t, 1200, 0.6);
        this.thump(out, t + 0.02, 130, 0.08, 0.6);
        if (!this.take(out, 'magin', t + 0.06, 0.35, r(1.1, 1.2))) this.click(out, t + 0.07, 2400, 0.4);
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
        this.take(out, 'coins', t, 0.4, r(1, 1.1));
        this.click(out, t, 2000, 0.5);
        this.tone(out, t + 0.04, 1180, 0.07, 0.5);
        this.tone(out, t + 0.1, 1570, 0.1, 0.5);
        break;
      case 'valuable':
        // Something worth the risk: a bright two-note glint.
        this.tone(out, t, 1568, 0.18, 0.45);
        this.tone(out, t + 0.07, 2093, 0.3, 0.4);
        this.click(out, t, 4000, 0.3);
        break;
      case 'tick':
        this.click(out, t, 3000, 0.25);
        break;
      case 'relief':
        // A warm, rising chord: you made it.
        this.tone(out, t, 262, 0.9, 0.35);
        this.tone(out, t + 0.12, 330, 0.85, 0.3);
        this.tone(out, t + 0.24, 392, 1.2, 0.3);
        this.tone(out, t + 0.36, 523, 1.4, 0.22);
        break;
      case 'loss':
        this.tone(out, t, 196, 1.2, 0.35);
        this.tone(out, t + 0.2, 185, 1.4, 0.3);
        this.thump(out, t, 50, 0.6, 0.6);
        break;
      case 'sell':
        this.take(out, 'coins', t, 0.5, r(0.95, 1.05));
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
    this.master.connect(this.hearing);
    // Music carries across scenes.
    if (this.musicBus) {
      this.musicBus.disconnect();
      this.musicBus.connect(this.master);
    }
    this.setMuffled(false);
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

    // The real gun, recorded close and from down range: crossfade by distance, walls
    // take the top off, the room adds its tail. A sub punch under the big calibres.
    const key = s.sample;
    if (key && this.samples.has(`gun_${key}_n`)) {
      const far = smoothstep(160, 620, d);
      const rate = 0.97 + Math.random() * 0.06;
      const lp = muffleHz(muffle);
      if (far < 0.98) this.take(out, `gun_${key}_n`, t, SAMPLE_GUN * (1 - far), rate, lp);
      if (far > 0.02) this.take(out, `gun_${key}_f`, t, SAMPLE_GUN * 1.6 * far, rate, lp);
      if (s.thump < 100) {
        const sub = ctx.createOscillator();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(50, t);
        sub.frequency.exponentialRampToValueAtTime(33, t + 0.25);
        sub.connect(env(ctx, t, 0.5 * (0.4 + 0.6 * close), 0.003, 0.26)).connect(out);
        sub.start(t);
        sub.stop(t + 0.3);
      }
      return;
    }

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

  /**
   * A footstep on a surface. `weight` 0.3 (sneaking) .. 1 (walking) .. 1.8 (sprinting):
   * heavier steps are louder, lower and ring the floor more.
   */
  step(x: number, y: number, surface: Surface, weight = 1, own = false): void {
    // You hear other people's boots far better than your own.
    const bus = this.spatialBus(x, y, (own ? 0.12 : 0.5) * weight);
    if (!bus) return;
    const { ctx, out, muffle } = bus;
    const t = ctx.currentTime;
    // Recorded boots; the floor adds its own voice (a plate rings, a grate rattles).
    if (this.samples.has('step')) {
      const lp = muffleHz(muffle) * (weight < 0.5 ? 0.22 : 1);
      const rate = (weight > 1.3 ? 0.9 : weight < 0.5 ? 1.06 : 1) * (0.94 + Math.random() * 0.12);
      this.take(out, 'step', t, SAMPLE_STEP * (weight < 0.5 ? 0.55 : 1), rate, lp);
      if (weight >= 0.5) {
        if (surface === 'plate') this.take(out, 'plate', t + 0.003, 0.1 * weight, 1.25 + Math.random() * 0.25, lp);
        else if (surface === 'grate') this.take(out, 'metal', t + 0.008, 0.18 * weight, 1.3 + Math.random() * 0.3, lp);
      }
      if (weight > 1.3 && Math.random() < 0.5) this.click(out, t + 0.03, 3800 + Math.random() * 1200, 0.12);
      return;
    }
    // Heel: a soft thud, lower when heavy.
    const n = this.noiseSource(t, 0.08);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = (weight > 1.3 ? 520 : 650) * (0.85 + Math.random() * 0.3) * muffle;
    n.connect(f).connect(env(ctx, t, 1, 0.003, 0.06)).connect(out);
    if (weight < 0.5) return; // sneaking: just the roll of the sole
    // Boot clack: the mid-range knock that carries through a building.
    const k = this.noiseSource(t, 0.04);
    const kb = ctx.createBiquadFilter();
    kb.type = 'bandpass';
    kb.frequency.value = (1100 + Math.random() * 300) * Math.max(0.5, muffle);
    kb.Q.value = 1.6;
    k.connect(kb).connect(env(ctx, t, 1.4, 0.001, 0.025)).connect(out);
    // Toe scuff
    const s = this.noiseSource(t + 0.02, 0.03);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2400 * muffle;
    bp.Q.value = 1.2;
    s.connect(bp).connect(env(ctx, t + 0.02, 0.35, 0.002, 0.03)).connect(out);
    if (surface === 'plate') {
      // A steel plate rings under the boot.
      this.tone(out, t + 0.004, 780 + Math.random() * 180, 0.07, 0.12 * weight);
    } else if (surface === 'grate') {
      // A loose grate rattles in its frame.
      this.click(out, t + 0.012, 1700 + Math.random() * 500, 0.35 * weight);
      this.click(out, t + 0.05 + Math.random() * 0.02, 2300 + Math.random() * 500, 0.2 * weight);
    }
    // Kit jingling at a run.
    if (weight > 1.3 && Math.random() < 0.5) this.click(out, t + 0.03, 3800 + Math.random() * 1200, 0.12);
  }

  /**
   * Kit moving with the body on a footfall: webbing and a pack shifting, plates knocking
   * in a heavy carrier. Quiet, under the boot; more of it at a run.
   * @param plates 0 (none) .. 1 (full plate)
   */
  gearStep(x: number, y: number, plates: number, pack: boolean, weight = 1, own = false): void {
    if (weight < 0.5 || (!pack && plates <= 0)) return;
    const bus = this.spatialBus(x, y, (own ? 0.1 : 0.35) * weight);
    if (!bus) return;
    const { ctx, out, muffle } = bus;
    const t = ctx.currentTime;
    const lp = muffleHz(muffle);
    const r = (a: number, b: number) => a + Math.random() * (b - a);
    if (pack && Math.random() < 0.55) this.take(out, 'cloth', t + r(0.02, 0.05), 0.16 * weight, r(1.25, 1.5), lp);
    if (plates > 0 && Math.random() < 0.3 + plates * 0.4) this.take(out, 'plate', t + r(0.01, 0.03), 0.045 * plates * weight, r(1.55, 1.85), lp);
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
      magout: 0.2, magin: 0.24, rack: 0.28, bolt: 0.5, breakopen: 0.26, breakclose: 0.3, magdrop: 0.2, draw: 0.14, ricochet: 0.35,
      heartbeat: 0.35, mutter: 0.75, typing: 0.22, beeps: 0.12, sharpen: 0.25, cards: 0.2, radio: 0.12, zap: 0.3, hiss: 0.18,
    };
    const bus = this.spatialBus(x, y, gains[kind] * gainMul);
    if (!bus) return;
    const { ctx, out, muffle } = bus;
    const t = ctx.currentTime;
    if (this.recorded(kind, out, t, muffle)) return;
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
        // Bolts retract, the pneumatics hiss, the leaves bang home in their tracks.
        this.click(out, t, 1100, 0.7);
        this.thump(out, t, 130, 0.05, 0.4);
        const n = this.noiseSource(t + 0.04, 0.4);
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 3000 * muffle;
        f.Q.value = 0.7;
        n.connect(f).connect(env(ctx, t + 0.04, 0.6, 0.02, 0.3)).connect(out);
        this.thump(out, t + 0.22, 90, 0.12, 0.8);
        this.click(out, t + 0.22, 700, 0.35);
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
      case 'zap': {
        // Arcing: a crackle of clicks over a mains buzz.
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = 100;
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 2400 * muffle;
        o.connect(f).connect(env(ctx, t, 0.35, 0.005, 0.25)).connect(out);
        o.start(t);
        o.stop(t + 0.3);
        for (let i = 0; i < 6; i++) this.click(out, t + Math.random() * 0.22, 3000 + Math.random() * 3000, 0.5);
        break;
      }
      case 'hiss': {
        const n = this.noiseSource(t, 1.1);
        const f = ctx.createBiquadFilter();
        f.type = 'highpass';
        f.frequency.value = 2500 * muffle;
        n.connect(f).connect(env(ctx, t, 0.5, 0.08, 0.9)).connect(out);
        break;
      }
      case 'heartbeat':
        // Lub-dub, felt in the chest.
        this.thump(out, t, 52, 0.12, 1);
        this.thump(out, t + 0.16, 46, 0.14, 0.75);
        break;
      case 'mutter': {
        // Someone murmuring into a radio: low syllables through a tinny band.
        const syll = 3 + Math.floor(Math.random() * 4);
        for (let i = 0; i < syll; i++) {
          const at = t + i * (0.11 + Math.random() * 0.06);
          const o = ctx.createOscillator();
          o.type = 'sawtooth';
          o.frequency.setValueAtTime(115 + Math.random() * 40, at);
          o.frequency.linearRampToValueAtTime(95 + Math.random() * 30, at + 0.09);
          const f = ctx.createBiquadFilter();
          f.type = 'bandpass';
          f.frequency.value = 800 * muffle;
          f.Q.value = 1.8;
          o.connect(f).connect(env(ctx, at, 0.5, 0.015, 0.08)).connect(out);
          o.start(at);
          o.stop(at + 0.12);
        }
        this.noiseBurst(out, t + syll * 0.14, 0.04, 3000 * muffle, 0.25);
        break;
      }
      case 'typing':
        for (let i = 0; i < 6 + Math.floor(Math.random() * 8); i++) this.click(out, t + i * (0.06 + Math.random() * 0.07), 2600 + Math.random() * 1400, 0.5);
        break;
      case 'beeps':
        // A patient monitor ticking along.
        for (let i = 0; i < 3; i++) this.tone(out, t + i * 0.9, 1320, 0.05, 0.5);
        break;
      case 'sharpen': {
        // A blade drawn along a stone, twice.
        for (let i = 0; i < 2; i++) {
          const at = t + i * 0.55;
          const n = this.noiseSource(at, 0.35);
          const f = ctx.createBiquadFilter();
          f.type = 'bandpass';
          f.frequency.setValueAtTime(3200, at);
          f.frequency.linearRampToValueAtTime(5200, at + 0.3);
          f.Q.value = 4;
          n.connect(f).connect(env(ctx, at, 0.8, 0.05, 0.28)).connect(out);
        }
        break;
      }
      case 'cards':
        // Cards riffled, then a bottle set down.
        for (let i = 0; i < 9; i++) this.click(out, t + i * 0.025, 4200, 0.35);
        this.tone(out, t + 0.5, 1900, 0.08, 0.3);
        this.click(out, t + 0.5, 900, 0.4);
        break;
      case 'radio':
        // An old radio drifting between stations.
        this.noiseBurst(out, t, 0.4, 2400 * muffle, 0.35);
        for (let i = 0; i < 6; i++) this.tone(out, t + 0.3 + i * 0.16, 392 * [1, 1.25, 1.5, 1.33, 1.125, 1][i], 0.14, 0.35);
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

  /**
   * The recorded version of a sound effect, where there is one (with a little synth
   * under it where that helps). False: synthesize it.
   */
  private recorded(kind: Sfx, out: AudioNode, t: number, muffle: number): boolean {
    const lp = muffleHz(muffle);
    const r = (a: number, b: number) => a + Math.random() * (b - a);
    switch (kind) {
      case 'impactWall':
        if (!this.take(out, 'hit_wall', t, 0.85, r(0.85, 1.25), lp)) return false;
        if (Math.random() < 0.35) this.take(out, 'metal', t, 0.28, r(1.3, 1.7), lp);
        return true;
      case 'impactFlesh':
        if (!this.take(out, 'hit_flesh', t, 0.8, r(0.85, 1.1), lp)) return false;
        this.thump(out, t, 110, 0.08, 0.5);
        return true;
      case 'bodyfall':
        if (!this.take(out, 'bodyfall', t, 1.1, r(0.9, 1.05), lp)) return false;
        this.take(out, 'metal', t + r(0.04, 0.09), 0.25, r(0.7, 0.9), lp);
        return true;
      case 'armor':
        if (!this.take(out, 'plate', t, 0.75, r(1.2, 1.5), lp)) return false;
        this.noiseBurst(out, t, 0.04, 3800 * muffle, 0.4);
        return true;
      case 'explosion':
        if (!this.take(out, 'blast', t, 1.0, r(0.85, 1), lp)) return false;
        this.take(out, 'boom', t, 1.3, r(0.9, 1), lp);
        this.thump(out, t, 32, 1.4, 0.9);
        return true;
      case 'magout':
        return this.take(out, 'magout', t, 1, r(0.95, 1.05), lp);
      case 'magin':
        return this.take(out, 'magin', t, 1, r(0.95, 1.05), lp);
      case 'rack':
        return this.take(out, 'rack', t, 1, r(0.95, 1.05), lp);
      case 'bolt':
        // Bolt up and back, then forward and locked down.
        if (!this.take(out, 'rack', t, 0.8, r(0.78, 0.86), lp)) return false;
        this.take(out, 'latch', t + 0.16, 0.6, r(0.8, 0.95), lp);
        return true;
      case 'shell':
        return this.take(out, 'shell', t, 0.9, r(0.95, 1.08), lp);
      case 'cycle':
        return this.take(out, 'pump', t, 0.75, r(0.96, 1.04), lp);
      case 'drop':
        return this.take(out, 'bagdrop', t, 0.9, r(0.9, 1.1), lp);
      case 'rummage':
        return this.take(out, 'cloth', t, 0.6, r(1, 1.3), lp);
      case 'draw':
        if (!this.take(out, 'cloth', t, 0.55, r(1.15, 1.35), lp)) return false;
        this.click(out, t + 0.09, 2000, 0.3);
        return true;
      case 'magdrop':
        if (!this.take(out, 'metal', t, 0.7, r(0.68, 0.8), lp)) return false;
        this.take(out, 'metal', t + r(0.08, 0.12), 0.3, r(0.75, 0.9), lp);
        return true;
      default:
        return false;
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

export type MusicTrack = 'title' | 'ship' | 'raid';

/** How loud each piece sits at full level: the ship and the raid stay well under the world. */
const MUSIC_LEVEL: Record<MusicTrack, number> = { title: 0.55, ship: 0.2, raid: 0.3 };

/** Level of recorded takes against the rest of the mix. */
const SAMPLE_GUN = 1.8;
const SAMPLE_STEP = 0.55;

function smoothstep(a: number, b: number, x: number): number {
  const k = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
}

/** The spatial "muffle" (0.1 far behind walls .. 1 open and near) as a lowpass cutoff. */
function muffleHz(muffle: number): number {
  return 380 * Math.pow(52, Math.max(0, Math.min(1, muffle)));
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
      // Roughly -50 dB by the end: long enough to hear a big room ring.
      const decay = Math.exp(-5.2 * k) * Math.sqrt(1 - k);
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
