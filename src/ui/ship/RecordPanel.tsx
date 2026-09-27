import { useEffect } from 'react';
import { audio } from '../../engine/audio';
import { useProfile } from '../../state/profileStore';
import { shipUi } from '../../state/shipStore';
import { AtlasSprite } from '../AtlasSprite';

/** Your bunk: a few photos taped to the wall, and the numbers that matter. */
export function RecordPanel({ onQuit }: { onQuit: () => void }) {
  const p = useProfile();
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
  const s = p.stats;
  const survival = s.raids ? Math.round((s.extractions / s.raids) * 100) : 0;
  const rows: [string, string][] = [
    ['DAYS ABOARD', String(p.day)],
    ['DEPLOYMENTS', String(s.raids)],
    ['EXTRACTIONS', String(s.extractions)],
    ['K.I.A. / M.I.A.', String(s.deaths)],
    ['SURVIVAL RATE', s.raids ? `${survival}%` : '—'],
    ['HOSTILES NEUTRALISED', String(s.kills)],
    ['CREDITS EARNED', `${s.creditsEarned.toLocaleString()} CR`],
    ['BEST HAUL', `${s.bestHaul.toLocaleString()} CR`],
  ];
  return (
    <div className="modal-root">
      <div className="panel record-panel">
        <div className="panel-title">SERVICE RECORD <span className="dim">// ЛИЧНОЕ ДЕЛО</span></div>
        <div className="record-body">
          <div className="record-photo"><AtlasSprite name={p.operator === 'f' ? 'portrait_f' : 'portrait_m'} scale={3} /></div>
          <div className="record-stats">
            <div className="nav-title">OPERATOR {p.operator === 'f' ? 'ZORYA' : 'VOLK'}</div>
            {rows.map(([k, v]) => <div key={k} className="tt-row"><span>{k}</span><span>{v}</span></div>)}
          </div>
        </div>
        <div className="confirm-row">
          <button className="btn" onClick={() => { audio.ui('close'); shipUi.close(); }}>CLOSE [ESC]</button>
          <span className="grow" />
          <button className="btn" onClick={onQuit}>SAVE &amp; QUIT TO TITLE</button>
        </div>
      </div>
    </div>
  );
}
