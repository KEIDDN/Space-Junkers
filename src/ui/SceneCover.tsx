import { useEffect, useState } from 'react';

export interface Cover {
  /** Lines typed out while the screen is dark. */
  lines: string[];
  /** 'in': going dark; 'hold': dark, text showing; 'out': revealing the new scene. */
  phase: 'in' | 'hold' | 'out';
  tone?: 'ok' | 'bad' | 'plain';
}

/**
 * What the player sees between places: the screen goes dark, a terminal types a few
 * lines, and the next scene fades up. Scene swaps happen behind it, so the game never
 * looks like it's switching web pages.
 */
export function SceneCover({ cover }: { cover: Cover | null }) {
  const [typed, setTyped] = useState(0);
  const text = cover?.lines.join('\n') ?? '';

  useEffect(() => {
    setTyped(0);
    if (!cover) return;
    let n = 0;
    const id = window.setInterval(() => {
      n += 2;
      setTyped(n);
      if (n >= text.length) window.clearInterval(id);
    }, 16);
    return () => window.clearInterval(id);
    // Retype only when the text changes, not on phase changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  if (!cover) return null;
  let left = typed;
  return (
    <div className={`scene-cover ${cover.phase}`} data-nav-scope="cover">
      <div className={`scene-cover-text ${cover.tone ?? 'plain'}`}>
        {cover.lines.map((line, i) => {
          const show = line.slice(0, Math.max(0, left));
          left -= line.length + 1;
          return <div key={i} className={i === 0 ? 'lead' : ''}>{show}{left < 0 && left > -line.length - 1 && <span className="term-cursor">█</span>}</div>;
        })}
      </div>
    </div>
  );
}
