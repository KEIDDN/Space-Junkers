import { useState } from 'react';
import { expedition } from '../state/expeditionStore';
import { GameView } from '../ui/GameView';
import { MainMenu } from '../ui/MainMenu';

export type RunConfig = { mode: 'range' | 'facility'; seed: number };

export function App() {
  const [run, setRun] = useState<(RunConfig & { key: number }) | null>(null);
  const deploy = (cfg: RunConfig) => {
    expedition.start(cfg.mode, cfg.seed); // fresh expedition state before the view mounts
    setRun({ ...cfg, key: Date.now() });
  };
  if (!run) return <MainMenu onDeploy={deploy} />;
  return <GameView key={run.key} mode={run.mode} seed={run.seed} onExit={() => setRun(null)} />;
}
