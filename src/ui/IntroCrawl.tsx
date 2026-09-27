import { useEffect, useRef, useState } from 'react';
import { INTRO } from '../data/prologue';
import { audio } from '../engine/audio';
import { Key } from './Glyph';

const CPS = 38;
const PAUSE = 900;

/**
 * Before the first look at the ship: black, a few lines typed on an old terminal, the hiss
 * of a relay. Any key finishes the line; once it's all said, or skipped, it goes on.
 */
export function IntroCrawl({ onDone }: { onDone: () => void }) {
  const [line, setLine] = useState(0);
  const [chars, setChars] = useState(0);
  const done = useRef(false);
  const finish = () => {
    if (done.current) return;
    done.current = true;
    onDone();
  };

  useEffect(() => {
    audio.ui('squelch');
  }, []);

  useEffect(() => {
    if (line >= INTRO.length) {
      const t = window.setTimeout(finish, 1400);
      return () => window.clearTimeout(t);
    }
    const text = INTRO[line];
    if (chars < text.length) {
      const t = window.setTimeout(() => {
        setChars((c) => c + 1);
        if (chars % 3 === 0 && /\w/.test(text[chars])) audio.ui('tick');
      }, 1000 / CPS);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(() => {
      setLine((l) => l + 1);
      setChars(0);
    }, PAUSE + text.length * 12);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line, chars]);

  useEffect(() => {
    const skip = (e: KeyboardEvent) => {
      if (e.code === 'Escape') finish();
      else if (line < INTRO.length) {
        if (chars < INTRO[line].length) setChars(INTRO[line].length);
        else {
          setLine((l) => l + 1);
          setChars(0);
        }
      }
    };
    window.addEventListener('keydown', skip);
    return () => window.removeEventListener('keydown', skip);
  });

  return (
    <div className="screen intro-crawl" data-nav-scope="intro" onClick={() => finish()}>
      <div className="intro-lines">
        {INTRO.slice(0, line + 1).map((l, i) => (
          <div key={i} className={`intro-line ${i === INTRO.length - 1 ? 'last' : ''}`}>
            {i < line ? l : l.slice(0, chars)}
            {i === line && line < INTRO.length && <span className="term-cursor">█</span>}
          </div>
        ))}
      </div>
      <button className="intro-skip link" data-nav-default onClick={(e) => { e.stopPropagation(); finish(); }}>SKIP <Key a="back" /></button>
    </div>
  );
}
