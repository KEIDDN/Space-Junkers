import { create } from 'zustand';

export type RunStatus = 'active' | 'extracted' | 'dead';

export interface LootToast {
  id: number;
  itemId: string;
}

/**
 * State of the current expedition, shown by the UI. Everything here is at risk:
 * it is lost on death and only banked on extraction.
 */
export interface ExpeditionState {
  mode: 'range' | 'facility';
  seed: number;
  status: RunStatus;
  /** Item ids carried (temporary, at risk). */
  bag: string[];
  toasts: LootToast[];
  kills: number;
  startedAt: number;
  endedAt: number;
  /** Interaction hint, e.g. "[E] SEARCH". */
  prompt: string | null;
  /** Seconds left on the extraction countdown, or null when not called. */
  extractCountdown: number | null;
  extractInZone: boolean;
  flashlight: boolean;
}

let toastId = 0;

export const useExpedition = create<ExpeditionState>(() => ({
  mode: 'range',
  seed: 0,
  status: 'active',
  bag: [],
  toasts: [],
  kills: 0,
  startedAt: 0,
  endedAt: 0,
  prompt: null,
  extractCountdown: null,
  extractInZone: false,
  flashlight: true,
}));

export const expedition = {
  start(mode: 'range' | 'facility', seed: number): void {
    useExpedition.setState({
      mode, seed, status: 'active', bag: [], toasts: [], kills: 0,
      startedAt: performance.now(), endedAt: 0, prompt: null,
      extractCountdown: null, extractInZone: false, flashlight: true,
    });
  },
  addLoot(items: string[]): void {
    const s = useExpedition.getState();
    const toasts = [...s.toasts, ...items.map((itemId) => ({ id: ++toastId, itemId }))].slice(-6);
    useExpedition.setState({ bag: [...s.bag, ...items], toasts });
  },
  kill(): void {
    useExpedition.setState((s) => ({ kills: s.kills + 1 }));
  },
  end(status: RunStatus): void {
    useExpedition.setState({ status, endedAt: performance.now(), prompt: null, extractCountdown: null });
  },
  /** Set only if changed, to avoid needless React renders. */
  patch(p: Partial<ExpeditionState>): void {
    const s = useExpedition.getState();
    for (const k in p) {
      if (p[k as keyof ExpeditionState] !== s[k as keyof ExpeditionState]) {
        useExpedition.setState(p);
        return;
      }
    }
  },
};
