import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Player preferences. Kept apart from the save so resetting progress keeps them. */
interface SettingsState {
  volume: number;
  /** Music level, 0 (off)..1. */
  music: number;
  /** Screen shake strength, 0..1. */
  shake: number;
  /** Lifts the darkness in facilities, 0.8..1.6 (1 = as designed). */
  brightness: number;
  /** Show where loud unseen sounds came from (accessibility). */
  soundCues: boolean;
  /** Controller: how quickly the reticle follows the right stick, 0.5..1.5. */
  aimSpeed: number;
  /** Controller: a light pull toward a visible hostile near the line of aim. */
  aimAssist: boolean;
  /** Controller rumble strength, 0 (off)..1. */
  vibration: number;
  /** A restrained finish over the picture: vignette, fine grain, a cold grade. */
  filmic: boolean;
  setFilmic(v: boolean): void;
  setSoundCues(v: boolean): void;
  setAimSpeed(v: number): void;
  setAimAssist(v: boolean): void;
  setVibration(v: number): void;
  setVolume(v: number): void;
  setMusic(v: number): void;
  setShake(v: number): void;
  setBrightness(v: number): void;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 1));
const clampAim = (v: number) => Math.max(0.5, Math.min(1.5, Number.isFinite(v) ? v : 1));

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      volume: 0.7,
      music: 0.6,
      shake: 1,
      brightness: 1,
      soundCues: false,
      aimSpeed: 1,
      aimAssist: true,
      vibration: 0.8,
      filmic: true,
      setFilmic: (filmic) => set({ filmic }),
      setSoundCues: (soundCues) => set({ soundCues }),
      setAimSpeed: (v) => set({ aimSpeed: clampAim(v) }),
      setAimAssist: (aimAssist) => set({ aimAssist }),
      setVibration: (v) => set({ vibration: clamp01(v) }),
      setVolume: (volume) => set({ volume: clamp01(volume) }),
      setMusic: (music) => set({ music: clamp01(music) }),
      setShake: (shake) => set({ shake: clamp01(shake) }),
      setBrightness: (b) => set({ brightness: Math.max(0.8, Math.min(1.6, Number.isFinite(b) ? b : 1)) }),
    }),
    {
      name: 'space-junkers.settings',
      version: 7,
      migrate: (s) => {
        const old = (s ?? {}) as Partial<Pick<SettingsState, 'volume' | 'music' | 'shake' | 'brightness' | 'soundCues' | 'aimSpeed' | 'aimAssist' | 'vibration' | 'filmic'>>;
        return {
          volume: clamp01(old.volume ?? 0.7),
          music: clamp01(old.music ?? 0.6),
          shake: clamp01(old.shake ?? 1),
          brightness: old.brightness ?? 1,
          soundCues: !!old.soundCues,
          aimSpeed: clampAim(old.aimSpeed ?? 1),
          aimAssist: old.aimAssist ?? true,
          vibration: clamp01(old.vibration ?? 0.8),
          filmic: old.filmic ?? true,
        } as SettingsState;
      },
    },
  ),
);
