import { RARITY_COLOR, itemDef } from '../data/items';
import { itemValueDeep, loadoutItems, loadoutValue } from '../core/inventory';
import { foundItems, haulValue } from '../core/raidResult';
import { audio } from '../engine/audio';
import { QUEST } from '../data/quests';
import { questStatus } from '../core/quests';
import { useProfile } from '../state/profileStore';
import { useRaid } from '../state/raidStore';
import { facilityName } from '../data/themes';
import { AtlasSprite } from './AtlasSprite';

/** After-action report: what came home, or what was left on the floor. */
export function Results({ onContinue }: { onContinue: () => void }) {
  const { status, loadout, brought, kills, seed, startedAt, endedAt, progressed, mia, destination } = useRaid();
  const profile = useProfile();
  const extracted = status === 'extracted';
  const secs = Math.max(0, Math.round((endedAt - startedAt) / 1000));
  const time = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

  const found = foundItems(loadout, brought);
  const rows = (extracted ? found : loadoutItems(loadout))
    .filter((i) => !i.crew || !extracted)
    .sort((a, b) => itemValueDeep(b) - itemValueDeep(a));
  const haul = haulValue(loadout, brought);
  const lost = loadoutValue(loadout);

  return (
    <div className="screen crt">
      <div className="panel results-panel">
        <div className={`results-title ${extracted ? 'ok' : 'bad'}`}>
          {extracted ? 'EXTRACTION SUCCESSFUL' : mia ? 'M.I.A. // LEFT BEHIND' : 'K.I.A. // SIGNAL LOST'}
        </div>
        <div className="small dim">
          {facilityName(destination, seed)} #{String(seed).padStart(6, '0')} · TIME {time} · HOSTILES NEUTRALISED {kills}
        </div>
        {mia && !extracted && <div className="small bad">Missing in action. Whatever you carried is gone with you.</div>}
        <div className="results-sub">{extracted ? 'RECOVERED FROM THE FACILITY' : mia ? 'LOST WITH YOU' : 'LEFT ON YOUR BODY'}</div>
        <div className="loot-list">
          {rows.length === 0 && <div className="dim small">{extracted ? 'NOTHING FOUND. AT LEAST YOU\'RE ALIVE.' : 'NOTHING. YOU WENT IN WITH NOTHING.'}</div>}
          {rows.map((it) => {
            const d = itemDef(it.id);
            return (
              <div key={it.uid} className={`loot-row ${extracted ? '' : 'lost'}`}>
                <span className="loot-icon"><AtlasSprite name={d.icon} fit={{ w: 44, h: 26 }} /></span>
                <span style={{ color: RARITY_COLOR[d.rarity] }}>{d.name}</span>
                {it.qty > 1 && <span className="dim">×{it.qty}</span>}
                <span className="grow" />
                <span>{itemValueDeep(it).toLocaleString()} CR</span>
              </div>
            );
          })}
        </div>
        <div className="results-total">
          {extracted
            ? <>HAUL: <span className="warn">{haul.toLocaleString()} CR</span> <span className="dim small">· carried home to the ship</span></>
            : <>{mia ? 'LOST WITH YOU' : 'LOST WITH YOUR BODY'}: <span className="bad">{lost.toLocaleString()} CR</span></>}
        </div>
        {progressed.length > 0 && (
          <div className="results-contracts">
            <div className="results-sub">CONTRACT PROGRESS</div>
            {progressed.map((id) => (
              <div key={id} className={questStatus(profile, id) === 'ready' ? 'ok' : 'warn'}>
                {questStatus(profile, id) === 'ready' ? '■ READY TO HAND IN · ' : '□ '}{QUEST[id].title}
              </div>
            ))}
          </div>
        )}
        <button className="deploy" onClick={() => { audio.ui('click'); onContinue(); }}>[ RETURN TO SHIP ]</button>
      </div>
    </div>
  );
}
