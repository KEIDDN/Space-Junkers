import { useEffect, useRef } from 'react';
import { CREW } from '../../data/crew';
import { DESTINATION } from '../../data/destinations';
import { audio } from '../../engine/audio';
import { ShipScene } from '../../game/ship/ShipScene';
import { useProfile } from '../../state/profileStore';
import { shipUi, useShip } from '../../state/shipStore';
import { ShipInventory } from '../inventory/ShipInventory';
import { AirlockPanel } from './AirlockPanel';
import { BoardPanel } from './BoardPanel';
import { CrewPanel } from './CrewPanel';
import { NavPanel } from './NavPanel';
import { RecordPanel } from './RecordPanel';

function ShipHud() {
  const prompt = useShip((s) => s.prompt);
  const panel = useShip((s) => s.panel);
  const jumping = useShip((s) => s.jumping);
  const credits = useProfile((s) => s.credits);
  const day = useProfile((s) => s.day);
  const course = useProfile((s) => s.course);
  const notices = useProfile((s) => s.notices);
  const clear = useProfile((s) => s.clearNotices);
  return (
    <div className={`hud ship-hud ${panel ? 'menu-open' : ''}`}>
      <div className="hud-tl crt-text">
        <div className="ship-name">LASTOCHKA <span className="dim">// ЛАСТОЧКА</span></div>
        <div className="dim small">DAY {day} · {course ? `IN ORBIT: ${DESTINATION[course.destination].name}` : 'HOLDING OVER OTETS'}</div>
      </div>
      <div className="hud-tr crt-text">
        <div className="label">CREDITS</div>
        <div className="big-mid">{credits.toLocaleString()}</div>
      </div>
      {notices.length > 0 && !panel && (
        <div className="ship-notices">
          {notices.map((n, i) => <div key={i}>{n}</div>)}
          <button className="link" onClick={clear} style={{ pointerEvents: 'auto' }}>[OK]</button>
        </div>
      )}
      {prompt && !panel && !jumping && <div className="hud-prompt crt-text">{prompt}</div>}
      {jumping && <div className="hud-extract crt-text warn">JUMP DRIVE ENGAGED</div>}
      {!panel && <div className="ship-hints dim small crt-text">WASD MOVE · E INTERACT · TAB STASH</div>}
    </div>
  );
}

/** Aboard the Lastochka. */
export function ShipView({ onDeploy, onQuit }: { onDeploy: (destination: string, seed: number) => void; onQuit: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const operator = useProfile((s) => s.operator);
  const panel = useShip((s) => s.panel);

  useEffect(() => {
    // TAB opens the stash here; never let it move browser focus.
    const noTab = (e: KeyboardEvent) => e.code === 'Tab' && e.preventDefault();
    window.addEventListener('keydown', noTab);
    return () => window.removeEventListener('keydown', noTab);
  }, []);

  useEffect(() => {
    shipUi.patch({ panel: null, prompt: null, jumping: false });
    const scene = new ShipScene(operator);
    void scene.init(hostRef.current!).catch((err) => console.error('Ship init failed', err));
    return () => scene.destroy();
  }, [operator]);

  return (
    <div className="screen game-screen" onPointerDown={() => audio.unlock()}>
      <div className="game-frame">
        <div ref={hostRef} className="game-host" />
        <ShipHud />
        {panel?.kind === 'crew' && <CrewPanel key={panel.crew} crew={panel.crew} />}
        {panel?.kind === 'stash' && <ShipInventory onClose={() => shipUi.close()} />}
        {panel?.kind === 'nav' && <NavPanel />}
        {panel?.kind === 'board' && <BoardPanel />}
        {panel?.kind === 'airlock' && <AirlockPanel onDeploy={onDeploy} />}
        {panel?.kind === 'record' && <RecordPanel onQuit={onQuit} />}
      </div>
    </div>
  );
}

export { CREW };
