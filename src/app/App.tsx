import { useState } from 'react';
import { deploy as deployProfile } from '../core/raidResult';
import { getProfile, useProfile } from '../state/profileStore';
import { raid, rangeLoadout, useRaid } from '../state/raidStore';
import { GameView } from '../ui/GameView';
import { recentRaid } from '../ui/ship/CrewPanel';
import { ShipView } from '../ui/ship/ShipView';
import { TitleScreen } from '../ui/TitleScreen';

type Scene =
  | { kind: 'title' }
  | { kind: 'ship' }
  | { kind: 'raid'; mode: 'range' | 'facility'; seed: number; destination: string; key: number };

/** Scene flow: title → ship ⇄ raid (→ results) → ship. */
export function App() {
  const [scene, setScene] = useState<Scene>({ kind: 'title' });

  const deploy = (destination: string, seed: number) => {
    const p = getProfile();
    // Mark the raid in the save before anything else: from here on, leaving means losing the kit.
    useProfile.getState().apply({ ...deployProfile(p, destination, seed), course: null });
    raid.start('facility', seed, destination, p.loadout);
    setScene({ kind: 'raid', mode: 'facility', seed, destination, key: Date.now() });
  };

  const range = () => {
    raid.start('range', 0, 'range', rangeLoadout());
    setScene({ kind: 'raid', mode: 'range', seed: 0, destination: 'range', key: Date.now() });
  };

  const backFromRaid = () => {
    const s = useRaid.getState();
    if (s.mode === 'facility') {
      recentRaid.outcome = s.status === 'extracted' ? 'extracted' : 'dead';
      recentRaid.greeted.clear();
      setScene({ kind: 'ship' });
    } else setScene({ kind: 'title' });
  };

  if (scene.kind === 'title') return <TitleScreen onContinue={() => setScene({ kind: 'ship' })} onRange={range} />;
  if (scene.kind === 'ship') return <ShipView onDeploy={deploy} onQuit={() => setScene({ kind: 'title' })} />;
  return <GameView key={scene.key} mode={scene.mode} seed={scene.seed} onExit={backFromRaid} />;
}
