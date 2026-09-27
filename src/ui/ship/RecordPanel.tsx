import { useEffect, useState } from 'react';
import { audio } from '../../engine/audio';
import { useProfile } from '../../state/profileStore';
import { shipUi } from '../../state/shipStore';
import { AtlasSprite } from '../AtlasSprite';
import { ByDevice, Key } from '../Glyph';
import { ControlsList, SettingsRows } from '../Settings';
import { ALL_LORE, LORE_BY_ID, THREADS, type LoreEntry, type Thread } from '../../data/lore';

/** Your bunk: a few photos taped to the wall, the numbers that matter, and the ship's settings. */
export function RecordPanel({ onQuit }: { onQuit: () => void }) {
  const p = useProfile();
  const [tab, setTab] = useState<'record' | 'records' | 'settings'>('record');
  const [reading, setReading] = useState<LoreEntry | null>(null);
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
          <button className={`tab ${tab === 'records' ? 'on' : ''}`} onClick={() => pick('records')}>RECOVERED RECORDS {p.lore.length > 0 && <span className="dim">· {p.lore.length}</span>}</button>
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
        ) : tab === 'records' ? (
          <Records read={p.lore} reading={reading} onRead={(e) => { audio.ui('click'); setReading(e); }} />
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

const THREAD_ORDER: Thread[] = ['fall', 'blackout', 'stayed', 'running', 'nine'];

/**
 * What the operator has read down there, sorted by the thread it belongs to. Threads show
 * how much of them has been found, never what the rest says.
 */
function Records({ read, reading, onRead }: { read: string[]; reading: LoreEntry | null; onRead: (e: LoreEntry | null) => void }) {
  const found = read.map((id) => LORE_BY_ID[id]).filter(Boolean);
  if (!found.length) {
    return <div className="records-empty dim">Nothing yet. Terminals, notes, letters: whatever people left down there, you'll keep a copy here.</div>;
  }
  const threads = THREAD_ORDER.filter((t) => found.some((e) => e.thread === t));
  const loose = found.filter((e) => !e.thread);
  return (
    <div className="records-body">
      <div className="records-list">
        {threads.map((t) => {
          const all = ALL_LORE.filter((e) => e.thread === t).length;
          const mine = found.filter((e) => e.thread === t);
          return (
            <div key={t} className="records-thread">
              <div className="records-head">{THREADS[t].name} <span className="dim">// {THREADS[t].ru} · {mine.length}/{all}</span></div>
              <div className="dim small">{THREADS[t].blurb}</div>
              {mine.map((e) => (
                <button key={e.id} className={`opt ${reading?.id === e.id ? 'on' : ''}`} onClick={() => onRead(e)}>▸ {e.title}</button>
              ))}
            </div>
          );
        })}
        {loose.length > 0 && (
          <div className="records-thread">
            <div className="records-head">ODDS AND ENDS</div>
            {loose.map((e) => <button key={e.id} className={`opt ${reading?.id === e.id ? 'on' : ''}`} onClick={() => onRead(e)}>▸ {e.title}</button>)}
          </div>
        )}
      </div>
      <div className={`records-read ${reading?.note ? 'paper' : ''}`}>
        {reading ? (
          <>
            <div className="dim small">{reading.from}</div>
            <div className="records-title">{reading.title}</div>
            {reading.lines.map((l, i) => <div key={i}>{l}</div>)}
          </>
        ) : <div className="dim">Pick something to read.</div>}
      </div>
    </div>
  );
}
