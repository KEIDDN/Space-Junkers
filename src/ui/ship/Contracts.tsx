import { CREW } from '../../data/crew';
import { DESTINATION } from '../../data/destinations';
import { ITEMS } from '../../data/items';
import type { QuestDef, QuestReward } from '../../data/quests';
import { objectiveProgress, objectiveText, type QuestStatus } from '../../core/quests';
import type { Profile } from '../../core/profile';

export function rewardText(r: QuestReward): string {
  const parts: string[] = [];
  if (r.credits) parts.push(`${r.credits.toLocaleString()} KR`);
  for (const [id, n] of r.items ?? []) parts.push(`${ITEMS[id].stack > 1 || n === 1 ? '' : `${n}× `}${ITEMS[id].name}${ITEMS[id].stack > 1 ? ` ×${n}` : ''}`);
  if (r.destination) parts.push(`COORDINATES: ${DESTINATION[r.destination].name}`);
  if (r.trust) parts.push('TRUST');
  return parts.join(' · ');
}

const STATUS_LABEL: Record<QuestStatus, string> = {
  locked: 'LOCKED', available: 'NEW', active: 'ACTIVE', ready: 'READY TO HAND IN', turnedIn: 'DONE',
};

/** One contract: who, what, how far along, what it pays. */
export function ContractCard({ p, def, status, onClick, compact, preview }: {
  p: Profile; def: QuestDef; status: QuestStatus; onClick?: () => void; compact?: boolean;
  /** Offer view: show the objectives of a contract not yet taken. */
  preview?: boolean;
}) {
  const crew = CREW[def.giver];
  return (
    <div className={`contract ${status} ${onClick ? 'clickable' : ''}`} onClick={onClick} data-nav={onClick ? '' : undefined} style={{ ['--crew' as string]: crew.color }}>
      <div className="contract-head">
        <span className="contract-title">{def.title}</span>
        {!compact && <span className="contract-giver">{crew.callsign}</span>}
        <span className={`contract-status ${status}`}>{preview ? 'OFFER' : STATUS_LABEL[status]}</span>
      </div>
      {(status !== 'available' || preview) && def.objectives.map((o, i) => {
        const { have, need } = objectiveProgress(p, def, i);
        const done = have >= need;
        return (
          <div key={i} className={`objective ${done ? 'done' : ''}`}>
            <span>{done ? '■' : '□'} {objectiveText(o)}</span>
            <span className="obj-count">{have}/{need}</span>
          </div>
        );
      })}
      <div className="contract-reward dim">REWARD · {rewardText(def.reward)}</div>
    </div>
  );
}
