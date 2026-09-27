import { useEffect, useState } from 'react';
import { audio } from '../engine/audio';
import { useRaid } from '../state/raidStore';

/** A facility terminal: old text typing out on green phosphor. E or walking away closes it. */
export function TerminalView() {
  const entry = useRaid((s) => s.terminal);
  const [typed, setTyped] = useState(0);
  const total = entry ? entry.lines.reduce((n, l) => n + l.length, 0) : 0;

  useEffect(() => {
    setTyped(0);
    if (!entry) return;
    let n = 0;
    const id = window.setInterval(() => {
      n += 3;
      setTyped(n);
      if (n % 12 === 0) audio.blip(1400 + Math.random() * 300);
      if (n >= total) window.clearInterval(id);
    }, 18);
    return () => window.clearInterval(id);
  }, [entry, total]);

  if (!entry) return null;
  let left = typed;
  return (
    <div className="term-screen">
      <div className="term-panel crt">
        <div className="term-head">
          <span>{entry.from}</span>
          <span className="grow" />
          <span className="dim">TERMINAL</span>
        </div>
        <div className="term-title">{entry.title}</div>
        <div className="term-body">
          {entry.lines.map((line, i) => {
            const show = line.slice(0, Math.max(0, left));
            left -= line.length;
            return <div key={i} className="term-line">{show}{left < 0 && left > -line.length && <span className="term-cursor">█</span>}</div>;
          })}
        </div>
        <div className="term-foot dim">[E] LOG OFF · WALK AWAY TO LEAVE</div>
      </div>
    </div>
  );
}
