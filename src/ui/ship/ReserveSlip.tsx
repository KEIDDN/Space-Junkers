import { useEffect } from 'react';
import { itemDef } from '../../data/items';
import { RESERVE_GUN, RESERVE_PACK, type Issued, type IssuedWhere } from '../../core/reserve';
import { audio } from '../../engine/audio';
import { AtlasSprite } from '../AtlasSprite';
import { Key } from '../Glyph';

const WHERE: Record<IssuedWhere, string> = {
  primary: 'SLUNG · LOADED',
  secondary: 'HOLSTER · LOADED',
  backpack: 'ON YOUR BACK',
  carried: 'IN YOUR KIT',
  stash: 'IN THE LOCKER',
};

/**
 * Back aboard after losing everything: the ship's reserve has re-armed you, and says so.
 * A requisition slip from Molot's locker, stamped, listing what was issued and where it is.
 */
export function ReserveSlip({ items, onClose }: { items: Issued[]; onClose: () => void }) {
  const gun = items.some((i) => i.id === RESERVE_GUN);
  const pack = items.some((i) => i.id === RESERVE_PACK);
  useEffect(() => {
    audio.ui('equip');
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape' || e.code === 'Enter' || e.code === 'KeyE') {
        e.preventDefault();
        audio.ui('close');
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-root" data-nav-scope="reserve">
      <div className="panel reserve-slip">
        <div className="reserve-stamp">ВЫДАНО<br /><span>ISSUED</span></div>
        <div className="dim small">CREW RESERVE // РЕЗЕРВ ЭКИПАЖА</div>
        <div className="panel-title warn">EMERGENCY KIT ISSUED</div>
        <div className="reserve-rows">
          {items.map((it) => {
            const d = itemDef(it.id);
            return (
              <div key={it.id} className="reserve-row">
                <span className="loot-icon"><AtlasSprite name={d.icon} fit={{ w: 44, h: 26 }} /></span>
                <span>{d.name}{it.qty > 1 ? <span className="dim"> ×{it.qty}</span> : null}</span>
                <span className="grow" />
                <span className="dim small">{WHERE[it.where]}</span>
              </div>
            );
          })}
        </div>
        <p className="reserve-note">
          {gun
            ? `"You came back without a gun${pack ? ' or a bag' : ''}, so you get mine. Crew issue: no trader will give you a kopek for it, and I want it back. Bring back better."`
            : '"Lost your bag down there? Take the old sack. Try not to leave this one on the floor."'}
          <span className="dim"> · MOLOT</span>
        </p>
        <p className="dim small">The reserve only fills what's missing. It won't stack up, and it can't be sold.</p>
        <button className="deploy" data-nav-default onClick={() => { audio.ui('close'); onClose(); }}>[ UNDERSTOOD ] <Key a="confirm" /></button>
      </div>
    </div>
  );
}
