import { useEffect, useState } from 'react';

interface Frame { x: number; y: number; w: number; h: number }
type Atlas = { frames: Record<string, { frame: Frame }>; meta: { size: { w: number; h: number } } };

let atlasPromise: Promise<Atlas> | null = null;
function loadAtlas(): Promise<Atlas> {
  atlasPromise ??= fetch(`${import.meta.env.BASE_URL}assets/sprites.json`).then((r) => r.json());
  return atlasPromise;
}

/** Draws one atlas frame in the DOM (for menus/HUD), pixel-perfect at an integer scale. */
export function AtlasSprite({ name, scale = 4 }: { name: string; scale?: number }) {
  const [atlas, setAtlas] = useState<Atlas | null>(null);
  useEffect(() => {
    let live = true;
    void loadAtlas().then((a) => live && setAtlas(a));
    return () => { live = false; };
  }, []);
  const f = atlas?.frames[name]?.frame;
  if (!atlas || !f) return null;
  return (
    <div
      className="atlas-sprite"
      style={{
        width: f.w * scale,
        height: f.h * scale,
        backgroundImage: `url(${import.meta.env.BASE_URL}assets/sprites.png)`,
        backgroundPosition: `-${f.x * scale}px -${f.y * scale}px`,
        backgroundSize: `${atlas.meta.size.w * scale}px ${atlas.meta.size.h * scale}px`,
      }}
    />
  );
}
