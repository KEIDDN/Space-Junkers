import { useEffect, useState } from 'react';
import { audio } from '../engine/audio';
import { useDevice } from '../state/deviceStore';

/**
 * Browsers only start sound after a click or a key press; a controller button doesn't
 * count everywhere. With a pad in hand and sound still locked, say so, once, quietly.
 */
export function AudioGate() {
  const pad = useDevice((s) => s.device === 'pad');
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    if (!pad) {
      setLocked(false);
      return;
    }
    // Pad presses already try to start sound (see PadNav); this only watches.
    const check = () => setLocked(audio.locked);
    const id = window.setInterval(check, 800);
    check();
    return () => window.clearInterval(id);
  }, [pad]);
  if (!pad || !locked) return null;
  return <div className="audio-gate crt-text">SOUND IS OFF UNTIL THE BROWSER SEES ONE CLICK OR KEY PRESS</div>;
}
