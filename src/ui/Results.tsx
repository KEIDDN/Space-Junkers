import { ITEMS, RARITY_COLOR } from '../data/items';
import { useExpedition } from '../state/expeditionStore';
import { AtlasSprite } from './AtlasSprite';

export function Results({ onContinue }: { onContinue: () => void }) {
  const { status, bag, kills, seed, startedAt, endedAt } = useExpedition();
  const extracted = status === 'extracted';
  const total = bag.reduce((n, id) => n + (ITEMS[id]?.value ?? 0), 0);
  const secs = Math.max(0, Math.round((endedAt - startedAt) / 1000));
  const time = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

  // Group identical items.
  const counts = new Map<string, number>();
  for (const id of bag) counts.set(id, (counts.get(id) ?? 0) + 1);
  const rows = [...counts.entries()].sort((a, b) => ITEMS[b[0]].value - ITEMS[a[0]].value);

  return (
    <div className="screen crt">
      <div className="panel results-panel">
        <div className={`results-title ${extracted ? 'ok' : 'bad'}`}>{extracted ? 'EXTRACTION SUCCESSFUL' : 'K.I.A. // SIGNAL LOST'}</div>
        <div className="small dim">
          FACILITY #{String(seed).padStart(6, '0')} · TIME {time} · HOSTILES NEUTRALISED {kills}
        </div>
        <div className="loot-list">
          {rows.length === 0 && <div className="dim small">NOTHING RECOVERED.</div>}
          {rows.map(([id, qty]) => {
            const it = ITEMS[id];
            return (
              <div key={id} className={`loot-row ${extracted ? '' : 'lost'}`}>
                <AtlasSprite name={it.icon} scale={1} />
                <span style={{ color: RARITY_COLOR[it.rarity] }}>{it.name}</span>
                <span className="dim">×{qty}</span>
                <span className="grow" />
                <span>{(it.value * qty).toLocaleString()} CR</span>
              </div>
            );
          })}
        </div>
        <div className="results-total">
          {extracted
            ? <>BANKED TO SHIP STASH: <span className="warn">{total.toLocaleString()} CR</span></>
            : <>LOST WITH YOUR BODY: <span className="bad">{total.toLocaleString()} CR</span></>}
        </div>
        <button className="deploy" onClick={onContinue}>[ RETURN TO SHIP ]</button>
      </div>
    </div>
  );
}
