import { useState } from 'react';
import type { RunConfig } from '../app/App';
import { itemDef } from '../data/items';
import { gridValue, loadoutValue } from '../core/inventory';
import type { Operator } from '../core/profile';
import { audio } from '../engine/audio';
import { randomSeed } from '../engine/rng';
import { useProfile } from '../state/profileStore';
import { AtlasSprite } from './AtlasSprite';
import { ShipInventory } from './inventory/ShipInventory';

const OPERATORS: { id: Operator; callsign: string; portrait: string }[] = [
  { id: 'm', callsign: 'OPERATOR // VOLK', portrait: 'portrait_m' },
  { id: 'f', callsign: 'OPERATOR // ZORYA', portrait: 'portrait_f' },
];

export function MainMenu({ onDeploy }: { onDeploy: (cfg: RunConfig) => void }) {
  const operator = useProfile((s) => s.operator);
  const setOperator = useProfile((s) => s.setOperator);
  const stash = useProfile((s) => s.stash);
  const loadout = useProfile((s) => s.loadout);
  const credits = useProfile((s) => s.credits);
  const stats = useProfile((s) => s.stats);
  const notices = useProfile((s) => s.notices);
  const clearNotices = useProfile((s) => s.clearNotices);
  const [seed, setSeed] = useState(randomSeed);
  const [stashOpen, setStashOpen] = useState(false);
  const [confirmUnarmed, setConfirmUnarmed] = useState(false);

  const armed = !!loadout.primary || !!loadout.secondary;
  const atRisk = loadoutValue(loadout);
  const weapons = [loadout.primary, loadout.secondary].filter(Boolean).map((w) => itemDef(w!.id).short).join(' + ');

  const deploy = () => {
    if (!armed && !confirmUnarmed) {
      setConfirmUnarmed(true);
      audio.ui('error');
      return;
    }
    audio.ui('click');
    onDeploy({ mode: 'facility', seed });
  };

  return (
    <div className="screen crt" onPointerDown={() => audio.unlock()}>
      <div className="panel select-panel">
        <div className="panel-title">SPACE JUNKERS <span className="dim">// BUILD 0.3</span></div>
        {notices.length > 0 && (
          <div className="notice-box">
            {notices.map((n, i) => <div key={i}>{n}</div>)}
            <button className="link" onClick={clearNotices}>[ACKNOWLEDGE]</button>
          </div>
        )}
        <div className="dim small">SELECT OPERATOR</div>
        <div className="operators">
          {OPERATORS.map((op) => (
            <button
              key={op.id}
              className={`operator ${operator === op.id ? 'active' : ''}`}
              onClick={() => { setOperator(op.id); audio.ui('click'); }}
            >
              <AtlasSprite name={op.portrait} scale={4} />
              <span>{op.callsign}</span>
            </button>
          ))}
        </div>

        <div className="loadout-line small">
          <span className="dim">LOADOUT:</span> {weapons || <span className="bad">UNARMED</span>}
          <span className="dim"> · AT RISK </span><span className="warn">{atRisk.toLocaleString()} CR</span>
        </div>
        <button className="secondary" onClick={() => { audio.ui('open'); setStashOpen(true); }}>
          [ STASH &amp; LOADOUT ]
        </button>

        <div className="deploy-row">
          <button className="deploy" onClick={deploy}>
            {confirmUnarmed ? '[ DEPLOY UNARMED? CONFIRM ]' : '[ DEPLOY: ABANDONED FACILITY ]'}
          </button>
          <div className="seed small dim">
            SIGNAL #{String(seed).padStart(6, '0')}
            <button className="link" onClick={() => setSeed(randomSeed())}>[REROLL]</button>
          </div>
        </div>
        <button className="secondary" onClick={() => onDeploy({ mode: 'range', seed: 0 })}>
          [ GUNPLAY TEST RANGE ]
        </button>

        <div className="stash-line small">
          <span className="warn">{credits.toLocaleString()} CR</span>
          <span className="dim"> · STASH </span>{stash.items.length} ITEMS · {gridValue(stash).toLocaleString()} CR
          <span className="dim"> · EXTRACTIONS {stats.extractions} · K.I.A. {stats.deaths}</span>
        </div>

        <div className="controls small dim">
          WASD move · MOUSE aim · LMB fire · R reload · 1/2/Q weapons · 3-6 quick items · F flashlight
          · TAB inventory · HOLD E search · E extract · ESC pause
        </div>
      </div>
      {stashOpen && <ShipInventory onClose={() => setStashOpen(false)} />}
    </div>
  );
}
