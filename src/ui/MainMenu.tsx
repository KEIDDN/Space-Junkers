import { useMemo, useState } from 'react';
import type { RunConfig } from '../app/App';
import { ITEMS } from '../data/items';
import { randomSeed } from '../engine/rng';
import type { Operator } from '../game/entities/Player';
import { useProfile } from '../state/profileStore';
import { useSettings } from '../state/settingsStore';
import { AtlasSprite } from './AtlasSprite';

const OPERATORS: { id: Operator; callsign: string; portrait: string }[] = [
  { id: 'm', callsign: 'OPERATOR // VOLK', portrait: 'portrait_m' },
  { id: 'f', callsign: 'OPERATOR // ZORYA', portrait: 'portrait_f' },
];

export function MainMenu({ onDeploy }: { onDeploy: (cfg: RunConfig) => void }) {
  const operator = useSettings((s) => s.operator);
  const setOperator = useSettings((s) => s.setOperator);
  const stash = useProfile((s) => s.stash);
  const extractions = useProfile((s) => s.extractions);
  const deaths = useProfile((s) => s.deaths);
  const [seed, setSeed] = useState(randomSeed);

  const stashCount = Object.values(stash).reduce((n, q) => n + q, 0);
  const stashValue = useMemo(
    () => Object.entries(stash).reduce((n, [id, q]) => n + (ITEMS[id]?.value ?? 0) * q, 0),
    [stash],
  );

  return (
    <div className="screen crt">
      <div className="panel select-panel">
        <div className="panel-title">SPACE JUNKERS <span className="dim">// BUILD 0.2</span></div>
        <div className="dim small">SELECT OPERATOR</div>
        <div className="operators">
          {OPERATORS.map((op) => (
            <button
              key={op.id}
              className={`operator ${operator === op.id ? 'active' : ''}`}
              onClick={() => setOperator(op.id)}
            >
              <AtlasSprite name={op.portrait} scale={4} />
              <span>{op.callsign}</span>
            </button>
          ))}
        </div>

        <div className="deploy-row">
          <button className="deploy" onClick={() => onDeploy({ mode: 'facility', seed })}>
            [ DEPLOY: ABANDONED FACILITY ]
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
          <span className="dim">SHIP STASH:</span> {stashCount} ITEMS · <span className="warn">{stashValue.toLocaleString()} CR</span>
          <span className="dim"> · EXTRACTIONS {extractions} · K.I.A. {deaths}</span>
        </div>

        <div className="controls small dim">
          WASD move · MOUSE aim · LMB fire · R reload · 1-5 / WHEEL / Q weapons · F flashlight
          · HOLD E search · E extract · ESC abort
        </div>
      </div>
    </div>
  );
}
