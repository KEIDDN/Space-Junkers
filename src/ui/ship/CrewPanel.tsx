import { useEffect, useMemo, useRef, useState } from 'react';
import { CREW, TRUST_LEVELS, trustLevel, type CrewId } from '../../data/crew';
import { QUEST } from '../../data/quests';
import { marketLine } from '../../core/economy';
import { questsFor } from '../../core/quests';
import { audio } from '../../engine/audio';
import { useProfile } from '../../state/profileStore';
import { shipActions } from '../../state/shipActions';
import { shipUi } from '../../state/shipStore';
import { AtlasSprite } from '../AtlasSprite';
import { ContractCard, rewardText } from './Contracts';
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

type Mode =
  | { kind: 'lines'; lines: string[]; i: number; then?: () => void; next?: Mode }
  | { kind: 'menu' } | { kind: 'topics' } | { kind: 'trade' } | { kind: 'contracts' } | { kind: 'offer'; id: string };

export function CrewPanel({ crew }: { crew: CrewId }) {
  const def = CREW[crew];
  const profile = useProfile();
  const operator = profile.operator;
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
      setMode(mode.next ?? { kind: 'menu' });
    }
  };

  const say = (lines: string[], next?: Mode) => setMode({ kind: 'lines', lines, i: 0, next });
  const contracts = questsFor(profile, crew).filter((q) => q.status !== 'locked' && q.status !== 'turnedIn');
  const lockedByTrust = questsFor(profile, crew).some((q) => q.status === 'locked'
    && (q.def.requires?.quests ?? []).every((r) => profile.quests[r]?.status === 'turnedIn'));
  const ready = contracts.filter((q) => q.status === 'ready').length;
  const fresh = contracts.filter((q) => q.status === 'available').length;
  const openContract = (id: string) => {
    const st = contracts.find((q) => q.def.id === id)!.status;
    const q = QUEST[id];
    if (st === 'available') say(q.brief, { kind: 'offer', id });
    else if (st === 'ready') {
      const r = shipActions.turnInQuest(id);
      if (r.ok) say([...r.lines, `[ ${rewardText(q.reward)} ]`], { kind: 'contracts' });
    }
  };
  const leave = () => {
    audio.ui('close');
    shipUi.close();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (mode.kind === 'trade') return;
      if (e.code === 'Escape') {
        e.preventDefault();
        if (mode.kind === 'topics' || mode.kind === 'contracts' || mode.kind === 'offer') setMode({ kind: 'menu' });
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
              {(contracts.length > 0 || lockedByTrust) && (
                <button className="opt" onClick={() => { audio.ui('click'); setMode({ kind: 'contracts' }); }}>
                  ▸ CONTRACTS {ready > 0 && <span className="ok">· {ready} READY</span>} {fresh > 0 && <span className="warn">· {fresh} NEW</span>}
                </button>
              )}
              <button className="opt" onClick={() => { audio.ui('open'); setMode({ kind: 'trade' }); }}>▸ TRADE</button>
              <button className="opt" onClick={() => { audio.ui('click'); setMode({ kind: 'topics' }); }}>▸ ASK ABOUT…</button>
              {crew === 'trader' && <button className="opt" onClick={() => say([marketLine(day)])}>▸ WHAT'S SELLING TODAY?</button>}
              <button className="opt dim-opt" onClick={leave}>▸ LEAVE [ESC]</button>
            </div>
          )}
          {mode.kind === 'contracts' && (
            <div className="dialog-options contracts-list" onClick={(e) => e.stopPropagation()}>
              {contracts.map((q) => (
                <ContractCard key={q.def.id} p={profile} def={q.def} status={q.status} compact
                  onClick={q.status === 'active' ? undefined : () => { audio.ui('click'); openContract(q.def.id); }} />
              ))}
              {contracts.length === 0 && <div className="dim">Nothing for you right now.</div>}
              {lockedByTrust && <div className="dim small">They have more work, for someone they trust more.</div>}
              <button className="opt dim-opt" onClick={() => setMode({ kind: 'menu' })}>▸ BACK</button>
            </div>
          )}
          {mode.kind === 'offer' && (
            <div className="dialog-options" onClick={(e) => e.stopPropagation()}>
              <ContractCard p={profile} def={QUEST[mode.id]} status="available" compact preview />
              <button className="opt" onClick={() => { shipActions.acceptQuest(mode.id); setMode({ kind: 'contracts' }); }}>▸ ACCEPT</button>
              <button className="opt dim-opt" onClick={() => setMode({ kind: 'contracts' })}>▸ NOT NOW</button>
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
