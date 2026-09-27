import { create } from 'zustand';
import type { CrewId } from '../data/crew';

export type ShipPanel =
  | { kind: 'crew'; crew: CrewId }
  | { kind: 'stash' }
  | { kind: 'nav' }
  | { kind: 'board' }
  | { kind: 'airlock' }
  | { kind: 'record' };

/** Aboard the ship: what the operator is looking at. Written on events, not per frame. */
export interface ShipState {
  prompt: string | null;
  panel: ShipPanel | null;
  /** Set when a jump is made; the scene plays the effect and clears it. */
  jumping: boolean;
}

export const useShip = create<ShipState>(() => ({ prompt: null, panel: null, jumping: false }));

export const shipUi = {
  open(panel: ShipPanel): void {
    useShip.setState({ panel, prompt: null });
  },
  close(): void {
    useShip.setState({ panel: null });
  },
  patch(p: Partial<ShipState>): void {
    const s = useShip.getState();
    for (const k in p) {
      if (p[k as keyof ShipState] !== s[k as keyof ShipState]) {
        useShip.setState(p);
        return;
      }
    }
  },
};
