import { useEffect, useRef } from 'react';
import { Game } from '../game/Game';
import { useExpedition } from '../state/expeditionStore';
import { useSettings } from '../state/settingsStore';
import { Hud } from './Hud';
import { Results } from './Results';

/** Mounts the Pixi game. React never touches the game per frame. */
export function GameView({ mode, seed, onExit }: { mode: 'range' | 'facility'; seed: number; onExit: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const operator = useSettings((s) => s.operator);
  const volume = useSettings((s) => s.volume);
  const status = useExpedition((s) => s.status);
  const over = mode === 'facility' && status !== 'active';

  useEffect(() => {
    if (over) return;
    const game = new Game({ mode, seed, operator, volume });
    void game.init(hostRef.current!).catch((err) => console.error('Game init failed', err));
    return () => game.destroy();
  }, [mode, seed, operator, volume, over]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.code === 'Escape' && onExit();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onExit]);

  if (over) return <Results onContinue={onExit} />;

  return (
    <div className="screen game-screen">
      <div className="game-frame">
        <div ref={hostRef} className="game-host" />
        <Hud />
      </div>
    </div>
  );
}
