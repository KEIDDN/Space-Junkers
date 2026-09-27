import { useState } from 'react';
import { deploy as deployProfile } from '../core/raidResult';
import { getProfile, useProfile } from '../state/profileStore';
import { raid, rangeLoadout } from '../state/raidStore';
import { GameView } from '../ui/GameView';
import { MainMenu } from '../ui/MainMenu';

export type RunConfig = { mode: 'range' | 'facility'; seed: number; destination?: string };

export function App() {
  const [run, setRun] = useState<(RunConfig & { key: number }) | null>(null);
  const deploy = (cfg: RunConfig) => {
    if (cfg.mode === 'facility') {
      const destination = cfg.destination ?? 'tikhaya';
      const p = getProfile();
      // Mark the raid in the save before anything else: from here on, leaving means losing the kit.
      useProfile.getState().apply(deployProfile(p, destination, cfg.seed));
      raid.start('facility', cfg.seed, destination, p.loadout);
    } else {
      raid.start('range', 0, 'range', rangeLoadout());
    }
    setRun({ ...cfg, key: Date.now() });
  };
  if (!run) return <MainMenu onDeploy={deploy} />;
  return <GameView key={run.key} mode={run.mode} seed={run.seed} onExit={() => setRun(null)} />;
}
