import { useEffect, useMemo, useRef, useState } from 'react';
import { CREW, TRUST_LEVELS, trustLevel, type CrewId } from '../../data/crew';
import { marketLine } from '../../core/economy';
import { audio } from '../../engine/audio';
import { useProfile } from '../../state/profileStore';
import { shipActions } from '../../state/shipActions';
import { shipUi } from '../../state/shipStore';
import { AtlasSprite } from '../AtlasSprite';
import { TradeScreen } from './TradeScreen';

/** How the last raid ended, so the crew can react to it once. Not saved. */
export const recentRaid: { outcome: 'extracted' | 'dead' | null; greeted: Set<CrewId> } = { outcome: null, greeted: new Set() };

const CPS = 55; // characters per second

/** Types a line out with the speaker's voice. Click to finish early. */
function useTypewriter(text: string, voice: number) {
  const [shown, setShown] = useState(0);
  const t0 = useRef(performance.now());
  useEffect(() => {
    t0.current = performance.now();
    setShown(0);
    let raf = 0;
    let last = 0;
    const step = () => {
      const n = Math.min(text.length, Math.floor(((performance.now() - t0.current) / 1000) * CPS));
      if (n !== last) {
        if (Math.floor(n / 2) !== Math.floor(last / 2) && /\w/.test(text[n - 1] ?? '')) audio.blip(voice);
        last = n;
        setShown(n);
      }
      if (n < text.length) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [text, voice]);
  return { shown: text.slice(0, shown), done: shown >= text.length, skipTo: () => { t0.current = -1e9; } };
}

type Mode = { kind: 'lines'; lines: string[]; i: number; then?: () => void } | { kind: 'menu' } | { kind: 'topics' } | { kind: 'trade' };

export function CrewPanel({ crew }: { crew: CrewId }) {
  const def = CREW[crew];
  const operator = useProfile((s) => s.operator);
  const state = useProfile((s) => s.crew[crew]);
  const day = useProfile((s) => s.day);
  const name = operator === 'f' ? 'Zorya' : 'Volk';
  const trust = state?.trust ?? 0;
  const level = trustLevel(trust);

  const opening = useMemo<string[]>(() => {
    const pick = (a: string[]) => a[Math.floor(Math.random() * a.length)].replaceAll('{name}', name);
    if (!state?.met) return def.intro.map((l) => l.replaceAll('{name}', name));
    const lines = [pick(def.greetings)];
    if (recentRaid.outcome && !recentRaid.greeted.has(crew)) {
      recentRaid.greeted.add(crew);
      lines.unshift(pick(recentRaid.outcome === 'extracted' ? def.welcomeBack : def.afterDeath));
      return lines.slice(0, 1);
    }
    return lines;
    // Only on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crew]);

  const [mode, setMode] = useState<Mode>({ kind: 'lines', lines: opening, i: 0, then: () => shipActions.meet(crew) });
  const line = mode.kind === 'lines' ? mode.lines[mode.i] : '';
  const tw = useTypewriter(line, def.voice);

  const advance = () => {
    if (mode.kind !== 'lines') return;
    if (!tw.done) {
      tw.skipTo();
      return;
    }
    audio.ui('click');
    if (mode.i + 1 < mode.lines.length) setMode({ ...mode, i: mode.i + 1 });
    else {
      mode.then?.();
      setMode({ kind: 'menu' });
    }
  };

  const say = (lines: string[]) => setMode({ kind: 'lines', lines, i: 0 });
  const leave = () => {
    audio.ui('close');
    shipUi.close();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (mode.kind === 'trade') return;
      if (e.code === 'Escape') {
        e.preventDefault();
        if (mode.kind === 'topics') setMode({ kind: 'menu' });
        else leave();
      } else if (e.code === 'Space' || e.code === 'KeyE' || e.code === 'Enter') {
        e.preventDefault();
        advance();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (mode.kind === 'trade') return <TradeScreen crew={crew} onClose={() => setMode({ kind: 'menu' })} />;

  const nextLevel = TRUST_LEVELS[level + 1];
  const levelFrac = nextLevel ? (trust - TRUST_LEVELS[level].points) / (nextLevel.points - TRUST_LEVELS[level].points) : 1;

  return (
    <div className="dialog-root" style={{ ['--crew' as string]: def.color }}>
      <div className="dialog-box panel" onClick={advance}>
        <div className="dialog-portrait">
          <AtlasSprite name={def.portrait} scale={2} />
        </div>
        <div className="dialog-body">
          <div className="dialog-head">
            <span className="dialog-name">{def.callsign}</span>
            <span className="dialog-role">{def.role}</span>
            <span className="grow" />
            <span className="trust">
              <span className="dim">TRUST</span> {TRUST_LEVELS[level].name}
              <span className="trust-bar"><span style={{ width: `${levelFrac * 100}%` }} /></span>
            </span>
          </div>
          {mode.kind === 'lines' && (
            <div className="dialog-text">
              {tw.shown}
              {tw.done && <span className="dialog-more blink">▼</span>}
            </div>
          )}
          {mode.kind === 'menu' && (
            <div className="dialog-options" onClick={(e) => e.stopPropagation()}>
              <div className="dialog-blurb dim">{def.blurb}</div>
              <button className="opt" onClick={() => { audio.ui('open'); setMode({ kind: 'trade' }); }}>▸ TRADE</button>
              <button className="opt" onClick={() => { audio.ui('click'); setMode({ kind: 'topics' }); }}>▸ ASK ABOUT…</button>
              {crew === 'trader' && <button className="opt" onClick={() => say([marketLine(day)])}>▸ WHAT'S SELLING TODAY?</button>}
              <button className="opt dim-opt" onClick={leave}>▸ LEAVE [ESC]</button>
            </div>
          )}
          {mode.kind === 'topics' && (
            <div className="dialog-options" onClick={(e) => e.stopPropagation()}>
              {def.topics.map((t) => {
                const locked = (t.minTrust ?? 0) > level;
                return (
                  <button key={t.q} className={`opt ${locked ? 'locked' : ''}`} disabled={locked} onClick={() => say(t.a)}>
                    ▸ {locked ? `[${TRUST_LEVELS[t.minTrust!].name}] ${t.q}` : t.q}
                  </button>
                );
              })}
              <button className="opt dim-opt" onClick={() => setMode({ kind: 'menu' })}>▸ BACK</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
