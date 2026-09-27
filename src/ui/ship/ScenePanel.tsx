import { useEffect, useState } from 'react';
import { CREW } from '../../data/crew';
import type { SceneLine } from '../../data/prologue';
import { audio } from '../../engine/audio';
import { AtlasSprite } from '../AtlasSprite';
import { Key } from '../Glyph';
import { useTypewriter } from './CrewPanel';

/**
 * A few lines from the crew, typed out in their voices, each speaker with their portrait.
 * Used for the moments aboard that aren't a conversation you started: the locker, the
 * first job over the cockpit radio, the last words at the airlock.
 */
export function ScenePanel({ lines, onDone }: { lines: SceneLine[]; onDone: () => void }) {
  const [i, setI] = useState(0);
  const line = lines[i];
  const def = CREW[line.who];
  const tw = useTypewriter(line.text, def.voice);

  const advance = () => {
    if (!tw.done) {
      tw.skipTo();
      return;
    }
    audio.ui('click');
    if (i + 1 < lines.length) setI(i + 1);
    else onDone();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'KeyE' || e.code === 'Enter') {
        e.preventDefault();
        advance();
      } else if (e.code === 'Escape') {
        // Skip the rest: nothing said here is ever needed twice.
        e.preventDefault();
        audio.ui('close');
        onDone();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="dialog-root" data-nav-scope="scene" style={{ ['--crew' as string]: def.color }}>
      <div className="dialog-box panel" onClick={advance} data-nav="" data-nav-default="">
        <div className={`dialog-portrait ${line.intercom ? 'intercom' : ''}`}>
          <AtlasSprite name={def.portrait} scale={2} />
        </div>
        <div className="dialog-body">
          <div className="dialog-head">
            <span className="dialog-name">{def.callsign}</span>
            <span className="dialog-role">{line.intercom ? 'ON THE INTERCOM' : def.role}</span>
            <span className="grow" />
            <span className="dim small">{i + 1}/{lines.length} · <Key a="back" /> SKIP</span>
          </div>
          <div className="dialog-text">
            {tw.shown}
            {tw.done && <span className="dialog-more blink">▼ <Key a="confirm" /></span>}
          </div>
        </div>
      </div>
    </div>
  );
}
