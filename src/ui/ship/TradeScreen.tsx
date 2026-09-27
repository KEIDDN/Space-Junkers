import { useCallback, useState } from 'react';
import { CREW, TRUST_LEVELS, type CrewId } from '../../data/crew';
import { RARITY_COLOR, itemDef } from '../../data/items';
import { VENDORS } from '../../data/vendors';
import { buyPrice, crewLevel, marketFor, sellOffer, stockKey } from '../../core/economy';
import { repairCost } from '../../core/upgrades';
import type { ItemInstance } from '../../core/inventory';
import { audio } from '../../engine/audio';
import { getProfile, useProfile } from '../../state/profileStore';
import { shipActions } from '../../state/shipActions';
import { AtlasSprite } from '../AtlasSprite';
import { useDrag } from '../inventory/dragStore';
import { ShipInventory } from '../inventory/ShipInventory';
import { CATEGORY_NAME } from '../../data/items';
import { ByDevice, Key } from '../Glyph';

function VendorPanel({ crew }: { crew: CrewId }) {
  const def = CREW[crew];
  const vendor = VENDORS[crew];
  const profile = useProfile();
  const level = crewLevel(profile, crew);
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);
  const sellTarget = useDrag((s) => s.target?.kind === 'sell');
  const ok = useDrag((s) => s.ok);
  const market = marketFor(profile.day);

  const buy = (i: number) => {
    const r = shipActions.buy(crew, i);
    setMsg(r.ok ? { text: `Bought ${itemDef(vendor.stock[i].item).name}.`, bad: false } : { text: r.error, bad: true });
  };

  const buys = Object.entries(vendor.buys)
    .map(([cat, rate]) => `${cat === 'any' ? 'ANYTHING' : CATEGORY_NAME[cat as keyof typeof CATEGORY_NAME].toUpperCase()} ${Math.round(rate! * 100)}%`)
    .join(' · ');

  return (
    <section className="inv-panel vendor-panel" data-nav-group style={{ ['--crew' as string]: def.color }}>
      <header className="inv-head">
        <span className="inv-title" style={{ color: def.color }}>{def.callsign} // STOCK</span>
        <span className="inv-meta">{TRUST_LEVELS[level].name}</span>
      </header>
      <div className="vendor-list">
        {vendor.stock.map((e, i) => {
          const d = itemDef(e.item);
          const locked = e.trust > level;
          const bought = profile.purchases[stockKey(crew, i)] ?? 0;
          const soldOut = e.limit !== undefined && bought >= e.limit;
          const price = buyPrice(crew, e, level);
          const afford = profile.credits >= price;
          return (
            <button
              key={i}
              className={`vendor-row ${locked ? 'locked' : ''} ${soldOut ? 'soldout' : ''}`}
              disabled={locked || soldOut}
              onClick={() => buy(i)}
              onPointerEnter={() => audio.ui('hover')}
              title={locked ? `Requires trust: ${TRUST_LEVELS[e.trust].name}` : d.description}
            >
              <span className="vr-icon"><AtlasSprite name={d.icon} fit={{ w: 44, h: 26 }} /></span>
              <span className="vr-name" style={{ color: locked ? undefined : RARITY_COLOR[d.rarity] }}>
                {d.name}{e.qty && e.qty > 1 ? ` ×${e.qty}` : ''}
              </span>
              <span className="vr-note">
                {locked ? `REQ. ${TRUST_LEVELS[e.trust].name}` : soldOut ? 'SOLD OUT' : e.limit !== undefined ? `${e.limit - bought} LEFT` : ''}
              </span>
              <span className={`vr-price ${afford ? '' : 'bad'}`}>{price.toLocaleString()}</span>
            </button>
          );
        })}
      </div>
      <div className={`sell-zone ${sellTarget ? (ok ? 'ok' : 'bad') : ''}`} data-sell="1">
        <ByDevice kbm={<>DROP HERE TO SELL</>} pad={<>CARRY AN ITEM HERE TO SELL</>} />
        <div className="dim small">BUYS: {buys}</div>
        {crew === 'trader' && <div className="small"><span className="ok">▲ {CATEGORY_NAME[market.hot]}</span> · <span className="bad">▼ {CATEGORY_NAME[market.cold]}</span> today</div>}
      </div>
      {crew === 'merc' && profile.upgrades.includes('workbench') && (
        <div className="dim small"><ByDevice kbm={<>RIGHT-CLICK</>} pad={<Key a="more" />} /> WORN ARMOR TO REPAIR IT.</div>
      )}
      {msg && <div className={`vendor-msg ${msg.bad ? 'bad' : 'ok'}`}>{msg.text}</div>}
    </section>
  );
}

/** Trading with a crew member: your stash and loadout, their stock. */
export function TradeScreen({ crew, onClose }: { crew: CrewId; onClose: () => void }) {
  const sell = useCallback((uid: string) => {
    shipActions.sell(crew, uid);
  }, [crew]);
  const sellPrice = useCallback((item: ItemInstance) => sellOffer(crew, item, getProfile().day), [crew]);
  const bench = useProfile((s) => s.upgrades.includes('workbench')) && crew === 'merc';
  const repair = useCallback((uid: string) => {
    shipActions.repair(uid);
  }, []);
  return (
    <ShipInventory
      onClose={onClose}
      sell={sell}
      sellPrice={sellPrice}
      repair={bench ? repair : undefined}
      repairPrice={bench ? repairCost : undefined}
      title="SHIP STASH"
      side={<VendorPanel crew={crew} />}
    />
  );
}
