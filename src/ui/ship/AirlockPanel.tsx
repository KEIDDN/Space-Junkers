import { useEffect } from 'react';
import { DESTINATION } from '../../data/destinations';
import { itemDef } from '../../data/items';
import { EQUIP_SLOTS, loadoutItems, loadoutValue } from '../../core/inventory';
import { audio } from '../../engine/audio';
import { useProfile } from '../../state/profileStore';
import { shipUi } from '../../state/shipStore';
import { AtlasSprite } from '../AtlasSprite';

const SLOT_NAME = { primary: 'PRIMARY', secondary: 'HOLSTER', helmet: 'HEAD', armor: 'BODY', backpack: 'PACK' } as const;

/** Last look before going down. Everything listed here can be lost. */
export function AirlockPanel({ onDeploy }: { onDeploy: (destination: string, seed: number) => void }) {
  const course = useProfile((s) => s.course);
  const loadout = useProfile((s) => s.loadout);

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

  if (!course) {
    return (
      <div className="modal-root">
        <div className="panel airlock-panel">
          <div className="panel-title">AIRLOCK <span className="dim">// ШЛЮЗ</span></div>
          <p>No course laid in. The ship is holding position over Otets.</p>
          <p className="dim small">Take the pilot's seat in the cockpit and choose a destination.</p>
          <button className="btn" onClick={() => shipUi.close()}>CLOSE [ESC]</button>
        </div>
      </div>
    );
  }

  const d = DESTINATION[course.destination];
  const items = loadoutItems(loadout);
  const armed = !!loadout.primary || !!loadout.secondary;
  const meds = items.some((i) => itemDef(i.id).kind === 'med');
  const warnings = [
    !armed && 'YOU ARE UNARMED.',
    armed && !items.some((i) => itemDef(i.id).kind === 'ammo') && !(loadout.primary?.loaded || loadout.secondary?.loaded) && 'NO AMMUNITION.',
    !meds && 'NO MEDICAL SUPPLIES.',
    !loadout.backpack && 'NO BACKPACK: POCKETS ONLY.',
  ].filter(Boolean) as string[];

  return (
    <div className="modal-root">
      <div className="panel airlock-panel">
        <div className="panel-title">AIRLOCK <span className="dim">// ШЛЮЗ</span></div>
        <div className="airlock-dest">
          <AtlasSprite name={`planet_${d.planet}`} fit={{ w: 64, h: 64 }} />
          <div>
            <div className="nav-title">{d.name}</div>
            <div className="dim small">FACILITY SIGNAL #{String(course.seed).padStart(6, '0')} · {d.hostiles.toUpperCase()}</div>
          </div>
        </div>
        <div className="airlock-kit">
          {EQUIP_SLOTS.map((s) => {
            const it = loadout[s];
            return (
              <div key={s} className="kit-row">
                <span className="dim">{SLOT_NAME[s]}</span>
                <span className={it ? '' : 'faint'}>{it ? itemDef(it.id).name : '—'}</span>
              </div>
            );
          })}
        </div>
        <div className="kit-row"><span>AT RISK</span><span className="warn">{loadoutValue(loadout).toLocaleString()} CR</span></div>
        {warnings.map((w) => <div key={w} className="bad small">▲ {w}</div>)}
        <p className="dim small">Once the hatch opens, everything you carry is at risk until you extract.</p>
        <div className="confirm-row">
          <button className="deploy" onClick={() => { audio.ui('click'); onDeploy(course.destination, course.seed); }}>[ DEPLOY ]</button>
          <button className="btn" onClick={() => { audio.ui('close'); shipUi.close(); }}>NOT YET</button>
        </div>
      </div>
    </div>
  );
}
