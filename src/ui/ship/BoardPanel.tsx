import { useEffect, useState } from 'react';
import { CREW } from '../../data/crew';
import { itemDef } from '../../data/items';
import { UPGRADES } from '../../data/upgrades';
import { questsFor } from '../../core/quests';
import { canAfford, stashCount, upgradeStatus } from '../../core/upgrades';
import { audio } from '../../engine/audio';
import { useProfile } from '../../state/profileStore';
import { shipActions } from '../../state/shipActions';
import { shipUi } from '../../state/shipStore';
import { AtlasSprite } from '../AtlasSprite';
import { ContractCard } from './Contracts';
import { ByDevice, Key } from '../Glyph';

/** The operations board in the common room: every contract, and the ship's work orders. */
export function BoardPanel() {
  const p = useProfile();
  const [tab, setTab] = useState<'contracts' | 'ship'>('contracts');
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);

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

  const all = questsFor(p);
  const order = { ready: 0, active: 1, available: 2, locked: 3, turnedIn: 4 } as const;
  const shown = all.filter((q) => q.status !== 'locked' && q.status !== 'turnedIn').sort((a, b) => order[a.status] - order[b.status]);
  const done = all.filter((q) => q.status === 'turnedIn').length;

  return (
    <div className="modal-root" data-nav-scope="board">
      <div className="panel board-panel">
        <div className="panel-title">OPERATIONS <span className="dim">// ЗАДАНИЯ</span></div>
        <div className="tabs">
          <ByDevice kbm={null} pad={<Key a="prevTab" />} />
          <button className={`tab ${tab === 'contracts' ? 'on' : ''}`} onClick={() => { setTab('contracts'); audio.ui('tab'); }}>CONTRACTS</button>
          <button className={`tab ${tab === 'ship' ? 'on' : ''}`} onClick={() => { setTab('ship'); audio.ui('tab'); }}>SHIP WORK</button>
          <ByDevice kbm={null} pad={<Key a="nextTab" />} />
          <span className="grow" />
          <span className="dim small">{done}/{all.length} CONTRACTS COMPLETE · {p.credits.toLocaleString()} KR</span>
        </div>
        {tab === 'contracts' && (
          <div className="board-list">
            {shown.map((q) => <ContractCard key={q.def.id} p={p} def={q.def} status={q.status} />)}
            {shown.length === 0 && <p className="dim">No open contracts. Talk to the crew: trust opens doors.</p>}
            <p className="dim small">New contracts are offered in person. Hand-ins are taken from the stash and your pack.</p>
          </div>
        )}
        {tab === 'ship' && (
          <div className="board-list">
            {UPGRADES.map((u) => {
              const st = upgradeStatus(p, u.id);
              const creditsOk = p.credits >= u.cost;
              return (
                <div key={u.id} className={`upgrade ${st}`}>
                  <div className="contract-head">
                    <span className="contract-title">{u.name}</span>
                    <span className="contract-giver">{CREW[u.crew].callsign}</span>
                    <span className={`contract-status ${st === 'installed' ? 'ready' : st}`}>{st === 'installed' ? 'INSTALLED' : st === 'locked' ? 'NEEDS ' + u.requires!.map((r) => UPGRADES.find((x) => x.id === r)!.name.toUpperCase()).join(', ') : ''}</span>
                  </div>
                  <div className="upgrade-effect warn">{u.effect}</div>
                  <div className="dim small">{u.description}</div>
                  {st !== 'installed' && (
                    <div className="upgrade-cost">
                      <span className={creditsOk ? '' : 'bad'}>{u.cost.toLocaleString()} KR</span>
                      {u.items.map(([id, n]) => {
                        const have = stashCount(p, id);
                        return (
                          <span key={id} className={`part ${have >= n ? '' : 'bad'}`} title={itemDef(id).name}>
                            <AtlasSprite name={itemDef(id).icon} fit={{ w: 22, h: 18 }} /> {Math.min(have, n)}/{n}
                          </span>
                        );
                      })}
                      <span className="grow" />
                      <button className="btn accent" disabled={st !== 'available' || !canAfford(p, u)} onClick={() => {
                        const r = shipActions.install(u.id);
                        setMsg(r.ok ? { text: `${u.name}: done. ${CREW[u.crew].callsign} wipes their hands.`, bad: false } : { text: r.error, bad: true });
                      }}>INSTALL</button>
                    </div>
                  )}
                </div>
              );
            })}
            <p className="dim small">Parts are taken from the ship stash.</p>
          </div>
        )}
        {msg && <div className={msg.bad ? 'bad small' : 'ok small'}>{msg.text}</div>}
        <div className="confirm-row"><button className="btn" onClick={() => shipUi.close()}>CLOSE <Key a="back" /></button></div>
      </div>
    </div>
  );
}
