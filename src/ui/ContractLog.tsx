import { CREW } from '../data/crew';
import { liveContracts } from '../core/quests';
import { foundItems } from '../core/raidResult';
import { useProfile } from '../state/profileStore';
import { useRaid } from '../state/raidStore';
import { rewardText } from './ship/Contracts';

/**
 * The job sheet, in the raid: why you're down here and how far along you are. The same
 * contracts and objectives as aboard, with this raid's progress counted in. Functional on
 * purpose: who asked, what, how many, what it pays. The briefing stays on the ship.
 */
export function ContractLog({ compact }: { compact?: boolean }) {
  const quests = useProfile((s) => s.quests);
  const stash = useProfile((s) => s.stash);
  const log = useRaid((s) => s.log);
  const read = useRaid((s) => s.lore.length);
  const destination = useRaid((s) => s.destination);
  const loadout = useRaid((s) => s.loadout);
  const brought = useRaid((s) => s.brought);
  const contracts = liveContracts({ ...useProfile.getState(), quests, stash }, { ...log, read }, destination, foundItems(loadout, brought));
  return (
    <div className={`job-log ${compact ? 'compact' : ''}`}>
      <div className="job-log-title">JOB SHEET</div>
      {contracts.length === 0 && (
        <div className="dim small">No contract taken. Anything you carry out is still yours to sell.</div>
      )}
      {contracts.map((c) => {
        const crew = CREW[c.giver];
        const done = c.objectives.every((o) => o.have >= o.need);
        return (
          <div key={c.id} className={`contract ${done ? 'ready' : 'active'}`} style={{ ['--crew' as string]: crew.color }}>
            <div className="contract-head">
              <span className="contract-title">{c.title}</span>
              <span className="contract-giver">{crew.callsign}</span>
            </div>
            {c.objectives.map((o, i) => {
              const ok = o.have >= o.need;
              return (
                <div key={i} className={`objective ${ok ? 'done' : ''} ${o.here || ok ? '' : 'elsewhere'}`}>
                  <span>
                    {ok ? '■' : '□'} {o.text}
                    {o.note && !ok && <span className="obj-note"> · {o.note}</span>}
                  </span>
                  <span className="obj-count">{o.have}/{o.need}</span>
                </div>
              );
            })}
            {!compact && !done && c.intel && <div className="contract-intel small">{c.intel}</div>}
            {!compact && <div className="contract-reward dim">REWARD · {rewardText(c.reward)}</div>}
          </div>
        );
      })}
    </div>
  );
}
