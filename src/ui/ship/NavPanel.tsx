import { useEffect, useState } from 'react';
import { DESTINATIONS, DESTINATION } from '../../data/destinations';
import { travelCost } from '../../core/upgrades';
import { audio } from '../../engine/audio';
import { useProfile } from '../../state/profileStore';
import { shipActions } from '../../state/shipActions';
import { shipUi } from '../../state/shipStore';
import { AtlasSprite } from '../AtlasSprite';

function Danger({ n }: { n: number }) {
  return (
    <span className="danger">
      {Array.from({ length: 5 }, (_, i) => <span key={i} className={i < n ? 'on' : ''} />)}
    </span>
  );
}

/** The pilot's seat: pick a world, pay the fuel, jump. */
export function NavPanel() {
  const unlocked = useProfile((s) => s.destinations);
  const credits = useProfile((s) => s.credits);
  const course = useProfile((s) => s.course);
  const upgrades = useProfile((s) => s.upgrades);
  const [sel, setSel] = useState(course?.destination ?? 'tikhaya');
  const [error, setError] = useState<string | null>(null);
  const d = DESTINATION[sel];
  const isUnlocked = unlocked.includes(sel);
  const here = course?.destination === sel;
  const cost = travelCost({ upgrades }, d.cost);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        audio.ui('close');
        shipUi.close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const jump = () => {
    const r = shipActions.setCourse(sel);
    if (!r.ok) {
      setError(r.error);
      audio.ui('error');
      return;
    }
    shipUi.close();
  };

  return (
    <div className="modal-root">
      <div className="panel nav-panel crt-screen">
        <div className="panel-title">NAVIGATION <span className="dim">// КУРС</span></div>
        <div className="nav-body">
          <div className="nav-list">
            {DESTINATIONS.map((x) => {
              const open = unlocked.includes(x.id);
              return (
                <button
                  key={x.id}
                  className={`nav-row ${sel === x.id ? 'sel' : ''} ${open ? '' : 'locked'}`}
                  onClick={() => { setSel(x.id); setError(null); audio.ui('tab'); }}
                  onPointerEnter={() => audio.ui('hover')}
                >
                  <span className="nav-planet"><AtlasSprite name={`planet_${x.planet}`} fit={{ w: 44, h: 44 }} /></span>
                  <span className="nav-name">
                    {open ? x.name : '??? · NO COORDINATES'}
                    <small>{open ? x.subtitle : 'SIGNAL UNKNOWN'}</small>
                  </span>
                  {course?.destination === x.id && <span className="ok small">IN ORBIT</span>}
                </button>
              );
            })}
          </div>
          <div className="nav-detail">
            <div className={`nav-big ${isUnlocked ? '' : 'unknown'}`}>
              <AtlasSprite name={`planet_${d.planet}_big`} fit={{ w: 180, h: 180 }} />
            </div>
            {isUnlocked ? (
              <>
                <div className="nav-title">{d.name}</div>
                <div className="dim small">{d.subtitle}</div>
                <p className="nav-desc">{d.description}</p>
                <div className="tt-row"><span>DANGER</span><Danger n={d.danger} /></div>
                <div className="tt-row"><span>SALVAGE</span><span>{d.loot}</span></div>
                <div className="tt-row"><span>HOSTILES</span><span>{d.hostiles}</span></div>
                <div className="tt-row"><span>FUEL</span><span className={credits < cost ? 'bad' : 'warn'}>{cost.toLocaleString()} CR{cost < d.cost ? ' (OVERHAULED)' : ''}</span></div>
                {here ? (
                  <div className="ok nav-status">IN ORBIT. THE AIRLOCK IS READY.</div>
                ) : (
                  <button className="deploy" onClick={jump} disabled={credits < cost}>
                    [ SET COURSE · {cost.toLocaleString()} CR ]
                  </button>
                )}
                {error && <div className="bad small">{error}</div>}
              </>
            ) : (
              <>
                <div className="nav-title">NO COORDINATES</div>
                <p className="nav-desc dim">{d.unlockHint}</p>
              </>
            )}
          </div>
        </div>
        <div className="nav-foot dim small">
          {course ? `CURRENT ORBIT: ${DESTINATION[course.destination].name}` : 'HOLDING POSITION OVER OTETS'} · {credits.toLocaleString()} CR · [ESC] CLOSE
        </div>
      </div>
    </div>
  );
}
