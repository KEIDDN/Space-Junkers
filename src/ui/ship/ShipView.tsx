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
import { ByDevice, Key, Prompt } from '../Glyph';

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
        <div className="ship-notices" data-nav-scope="notices">
          {notices.map((n, i) => <div key={i}>{n}</div>)}
          <button className="link" data-nav-default onClick={() => { audio.ui('click'); clear(); }} style={{ pointerEvents: 'auto' }}>[OK] <Key a="confirm" /></button>
        </div>
      )}
      {prompt && !panel && !jumping && <div className="hud-prompt crt-text"><Prompt text={prompt} /></div>}
      {jumping && <div className="hud-extract crt-text warn">JUMP DRIVE ENGAGED</div>}
      {!panel && (
        <div className="ship-hints dim small crt-text">
          <ByDevice
            kbm={<>WASD MOVE · E INTERACT · TAB STASH · ESC MENU</>}
            pad={<><Key a="move" /> MOVE · <Key a="interact" /> INTERACT · <Key a="inventory" /> STASH · <Key a="pause" /> MENU</>}
          />
        </div>
      )}
    </div>
  );
}

/** Aboard the Lastochka. */
export function ShipView({ onDeploy, onQuit }: { onDeploy: (destination: string, seed: number) => void; onQuit: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const operator = useProfile((s) => s.operator);
  const panel = useShip((s) => s.panel);
  const upgrades = useProfile((s) => s.upgrades.join());
  // Handing in a story contract changes someone's corner of the ship.
  const story = useProfile((s) => Object.entries(s.quests).filter(([, q]) => q.status === 'turnedIn').map(([id]) => id).sort().join());
  const lastPos = useRef<{ x: number; y: number } | undefined>(undefined);

  useEffect(() => {
    // TAB opens the stash here; never let it move browser focus. ESC with nothing open is the menu.
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Tab') e.preventDefault();
      if (e.code === 'Escape' && !useShip.getState().panel && !useShip.getState().jumping) {
        // Opened on the next tick, so the panel's own Esc handler doesn't see this press.
        window.setTimeout(() => {
          if (!useShip.getState().panel) {
            audio.ui('open');
            shipUi.open({ kind: 'record' });
          }
        }, 0);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const rebuild = !!lastPos.current;
    if (!rebuild) shipUi.patch({ panel: null, prompt: null, jumping: false });
    // Installed ship work changes the ship: rebuild it around the operator.
    const scene = new ShipScene(operator, lastPos.current);
    void scene.init(hostRef.current!).catch((err) => console.error('Ship init failed', err));
    return () => {
      // A scene torn down before it was built (StrictMode, a fast rebuild) has no position to keep.
      lastPos.current = scene.position ?? lastPos.current;
      scene.destroy();
    };
  }, [operator, upgrades, story]);

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
