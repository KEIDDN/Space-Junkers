import { useEffect } from 'react';
import { audio } from '../../engine/audio';
import { shipUi } from '../../state/shipStore';

/** The operations board: contracts posted by the crew. */
export function BoardPanel() {
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
  return (
    <div className="modal-root">
      <div className="panel airlock-panel">
        <div className="panel-title">OPERATIONS BOARD <span className="dim">// ЗАДАНИЯ</span></div>
        <p className="dim">No contracts posted.</p>
        <button className="btn" onClick={() => shipUi.close()}>CLOSE [ESC]</button>
      </div>
    </div>
  );
}
