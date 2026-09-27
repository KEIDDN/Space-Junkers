import { useEffect, useState } from 'react';
import { audio } from '../../engine/audio';
import { useProfile } from '../../state/profileStore';
import { shipUi } from '../../state/shipStore';
import { AtlasSprite } from '../AtlasSprite';
import { ByDevice, Key } from '../Glyph';
import { ControlsList, SettingsRows } from '../Settings';

/** Your bunk: a few photos taped to the wall, the numbers that matter, and the ship's settings. */
export function RecordPanel({ onQuit }: { onQuit: () => void }) {
  const p = useProfile();
  const [tab, setTab] = useState<'record' | 'settings'>('record');
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
    ['CREDITS EARNED', `${s.creditsEarned.toLocaleString()} KR`],
    ['BEST HAUL', `${s.bestHaul.toLocaleString()} KR`],
  ];
  const pick = (t: typeof tab) => {
    setTab(t);
    audio.ui('tab');
  };
  return (
    <div className="modal-root" data-nav-scope="record">
      <div className={`panel record-panel ${tab === 'settings' ? 'wide' : ''}`}>
        <div className="panel-title">SERVICE RECORD <span className="dim">// ЛИЧНОЕ ДЕЛО</span></div>
        <div className="tabs">
          <ByDevice kbm={null} pad={<Key a="prevTab" />} />
          <button className={`tab ${tab === 'record' ? 'on' : ''}`} onClick={() => pick('record')}>RECORD</button>
          <button className={`tab ${tab === 'settings' ? 'on' : ''}`} onClick={() => pick('settings')}>SETTINGS</button>
          <ByDevice kbm={null} pad={<Key a="nextTab" />} />
        </div>
        {tab === 'record' ? (
          <div className="record-body">
            <div className="record-photo"><AtlasSprite name={p.operator === 'f' ? 'portrait_f' : 'portrait_m'} scale={3} /></div>
            <div className="record-stats">
              <div className="nav-title">OPERATOR {p.operator === 'f' ? 'ZORYA' : 'VOLK'}</div>
              {rows.map(([k, v]) => <div key={k} className="tt-row"><span>{k}</span><span>{v}</span></div>)}
            </div>
          </div>
        ) : (
          <div className="record-settings">
            <div className="settings-col"><SettingsRows /></div>
            <div className="controls-col">
              <div className="dim small">CONTROLS</div>
              <ControlsList />
            </div>
          </div>
        )}
        <div className="confirm-row">
          <button className="btn" data-nav-default onClick={() => { audio.ui('close'); shipUi.close(); }}>CLOSE <Key a="back" /></button>
          <span className="grow" />
          <button className="btn" onClick={onQuit}>SAVE &amp; QUIT TO TITLE</button>
        </div>
      </div>
    </div>
  );
}
