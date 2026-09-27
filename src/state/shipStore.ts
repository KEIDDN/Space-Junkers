import { create } from 'zustand';
import type { CrewId } from '../data/crew';
import type { Issued } from '../core/reserve';
import type { PrologueStep } from '../data/prologue';

export type ShipPanel =
  | { kind: 'crew'; crew: CrewId }
  | { kind: 'stash' }
  | { kind: 'nav' }
  | { kind: 'board' }
  | { kind: 'airlock' }
  | { kind: 'record' }
  /** A scripted moment of the first morning aboard (see data/prologue.ts). */
  | { kind: 'scene'; step: PrologueStep };

/** Aboard the ship: what the operator is looking at. Written on events, not per frame. */
export interface ShipState {
  prompt: string | null;
  panel: ShipPanel | null;
  /** Set when a jump is made; the scene plays the effect and clears it. */
  jumping: boolean;
  /** The emergency kit the ship's reserve just issued (shown until acknowledged). */
  reserve: Issued[] | null;
}

export const useShip = create<ShipState>(() => ({ prompt: null, panel: null, jumping: false, reserve: null }));

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
