import { useEffect, useState } from 'react';
import { RARITY_COLOR, itemDef } from '../data/items';
import { itemValueDeep, loadoutItems, loadoutValue } from '../core/inventory';
import { foundItems, haulValue } from '../core/raidResult';
import { audio } from '../engine/audio';
import { QUEST } from '../data/quests';
import { objectiveProgress, objectiveText, questStatus } from '../core/quests';
import { useProfile } from '../state/profileStore';
import { useRaid } from '../state/raidStore';
import { facilityName } from '../data/themes';
import { issueReserve } from '../core/reserve';
import { LORE_BY_ID } from '../data/lore';
import { AtlasSprite } from './AtlasSprite';
import { deathCause, deathLesson, haulMeaning } from '../core/debrief';
import { DESTINATION } from '../data/destinations';
import { travelCost } from '../core/upgrades';
import { Key } from './Glyph';

/** Counts a number up over a moment, ticking as it goes: the haul adding itself up. */
function useCountUp(target: number, delayMs: number, durationMs = 900): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    let lastTick = 0;
    const start = performance.now() + delayMs;
    const step = (now: number) => {
      const k = Math.max(0, Math.min(1, (now - start) / durationMs));
      const eased = 1 - (1 - k) ** 3;
      setV(Math.round(target * eased));
      if (k > 0 && k < 1 && now - lastTick > 60) {
        lastTick = now;
        audio.ui('tick');
      }
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, delayMs, durationMs]);
  return v;
}

/**
 * After-action report: what came home, or what was left on the floor, and (so nobody has to
 * wonder "did I lose that?") what was kept either way.
 */
export function Results({ onContinue }: { onContinue: () => void }) {
  const { status, loadout, brought, kills, seed, startedAt, endedAt, progressed, mia, destination, lore, death } = useRaid();
  const profile = useProfile();
  const extracted = status === 'extracted';
  const secs = Math.max(0, Math.round((endedAt - startedAt) / 1000));
  const time = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

  const found = foundItems(loadout, brought);
  const foundSet = new Set(found.map((i) => i.uid));
  const records = lore.map((id) => LORE_BY_ID[id]).filter(Boolean);
  const rows = (extracted ? found : loadoutItems(loadout))
    .filter((i) => !i.crew || !extracted)
    .sort((a, b) => itemValueDeep(b) - itemValueDeep(a));
  const haul = haulValue(loadout, brought);
  // What was brought in and carried back out again (the operator's own kit).
  const kitValue = Math.max(0, loadoutValue(loadout) - haul);
  // What the ship's reserve will hand back aboard, so a lost kit is never a mystery.
  const reserve = extracted ? [] : issueReserve(profile.loadout, profile.stash).items;
  const lost = loadoutValue(loadout);
  // Rows arrive one by one, then the total adds itself up.
  const shown = Math.min(rows.length, 12);
  const total = useCountUp(extracted ? haul : lost, 350 + shown * 70);
  useEffect(() => {
    audio.ui(extracted ? 'relief' : 'loss');
  }, [extracted]);

  return (
    <div className="screen crt" data-nav-scope="results">
      <div className="panel results-panel">
        <div className={`results-title ${extracted ? 'ok' : 'bad'}`}>
          {extracted ? 'EXTRACTION SUCCESSFUL' : mia ? 'M.I.A. // LEFT BEHIND' : 'K.I.A. // SIGNAL LOST'}
        </div>
        <div className="small dim">
          {facilityName(destination, seed)} #{String(seed).padStart(6, '0')} · TIME {time} · HOSTILES NEUTRALISED {kills}
        </div>
        {mia && !extracted && <div className="small bad">Missing in action. Whatever you carried is gone with you.</div>}
        {!extracted && death && (
          <div className="results-death">
            <div className="bad small">{deathCause(death)}</div>
            <div className="results-lesson">MOLOT: “{deathLesson(death)}”</div>
          </div>
        )}
        <div className="results-sub">{extracted ? 'RECOVERED FROM THE FACILITY' : mia ? 'LOST WITH YOU' : 'LEFT ON YOUR BODY'}</div>
        <div className="loot-list">
          {rows.length === 0 && <div className="dim small">{extracted ? 'NOTHING FOUND. AT LEAST YOU\'RE ALIVE.' : 'NOTHING. YOU WENT IN WITH NOTHING.'}</div>}
          {rows.map((it, i) => {
            const d = itemDef(it.id);
            return (
              <div key={it.uid} className={`loot-row ${extracted ? '' : 'lost'}`} style={{ animationDelay: `${300 + Math.min(i, 12) * 70}ms` }}>
                <span className="loot-icon"><AtlasSprite name={d.icon} fit={{ w: 44, h: 26 }} /></span>
                <span style={{ color: RARITY_COLOR[d.rarity] }}>{d.name}</span>
                {it.qty > 1 && <span className="dim">×{it.qty}</span>}
                {!extracted && <span className={`loot-tag ${foundSet.has(it.uid) ? 'found' : ''}`}>{foundSet.has(it.uid) ? 'FOUND' : 'YOUR KIT'}</span>}
                <span className="grow" />
                <span>{itemValueDeep(it).toLocaleString()} KR</span>
              </div>
            );
          })}
        </div>
        <div className="results-total">
          {extracted
            ? <>HAUL: <span className="warn">{total.toLocaleString()} KR</span> <span className="dim small">· carried home to the ship</span></>
            : <>{mia ? 'LOST WITH YOU' : 'LOST WITH YOUR BODY'}: <span className="bad">{total.toLocaleString()} KR</span></>}
        </div>
        {extracted && <div className="results-meaning small">{haulMeaning(haul, travelCost(profile, DESTINATION.tikhaya.cost))}</div>}
        {extracted && found.filter((i) => itemDef(i.id).quest).map((i) => (
          <div key={i.uid} className="ok small">■ {itemDef(i.id).name} is aboard. That's what you went down for.</div>
        ))}
        {extracted && kitValue > 0 && (
          <div className="small dim">Your own kit came home with you too ({kitValue.toLocaleString()} KR).</div>
        )}
        <div className="results-kept small">
          <div className="results-sub">{extracted ? 'ALSO THIS RAID' : 'WHAT YOU KEEP'}</div>
          {!extracted && <div>■ Everything in the ship's stash, and your {profile.credits.toLocaleString()} KR. Nothing aboard was at risk.</div>}
          <div>■ Hostiles neutralised: {kills}{!extracted && kills > 0 ? ' (counted toward contracts)' : ''}</div>
          {records.length > 0
            ? <div>■ Records read, kept in the service record: {records.map((r) => r.title).join(' · ')}</div>
            : <div className="dim">□ No records read this time.</div>}
          {!extracted && progressed.length === 0 && <div className="dim">□ No contract moved forward. Extraction goals only count when you get out.</div>}
        </div>
        {reserve.length > 0 && (
          <div className="results-reserve small">
            <span className="warn">CREW RESERVE:</span> Molot is making up an emergency kit from the ship's locker:{' '}
            {reserve.map((r) => `${itemDef(r.id).name}${r.qty > 1 ? ` ×${r.qty}` : ''}`).join(', ')}. It will be on you when you're back aboard.
          </div>
        )}
        {progressed.length > 0 && (
          <div className="results-contracts">
            <div className="results-sub">CONTRACT PROGRESS</div>
            {progressed.map((id) => (
              <div key={id} className={questStatus(profile, id) === 'ready' ? 'ok' : 'warn'}>
                {questStatus(profile, id) === 'ready' ? '■ READY TO HAND IN · ' : '□ '}{QUEST[id].title}
                <span className="dim small">
                  {QUEST[id].objectives.map((o, i) => {
                    const { have, need } = objectiveProgress(profile, QUEST[id], i);
                    return ` · ${objectiveText(o)} ${have}/${need}`;
                  }).join('')}
                </span>
              </div>
            ))}
          </div>
        )}
        <button className="deploy" data-nav-default onClick={() => { audio.ui('click'); onContinue(); }}>[ RETURN TO SHIP ] <Key a="confirm" /></button>
      </div>
    </div>
  );
}
