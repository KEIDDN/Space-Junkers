import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { anim } from '../../engine/assets';
import type { CrewStation } from '../../data/shipLayout';

type CrewAnim = 'idle' | 'walk' | 'talk' | 'interact' | 'sit';

const FPS: Record<CrewAnim, number> = { idle: 2.2, walk: 7, talk: 5, interact: 2.6, sit: 1.8 };

/**
 * A crew member at their station. Loops their station animation, turns to face the
 * operator when they come close, and talks with their hands while in conversation.
 */
export class CrewActor {
  readonly container = new Container();
  private sprite: Sprite;
  private anims: Record<CrewAnim, Texture[]>;
  private current: CrewAnim;
  private t = Math.random() * 3;
  private frame = 0;
  private pingpong = 1;
  private gestureTimer = 3 + Math.random() * 6;
  private gestureLeft = 0;
  /** Set on the frame they start fiddling with their station (for its sound). */
  busied = false;

  constructor(readonly station: CrewStation, sprite: string) {
    const a = (n: CrewAnim) => anim(`crew_${sprite}_${n}`);
    this.anims = { idle: a('idle'), walk: a('walk'), talk: a('talk'), interact: a('interact'), sit: a('sit') };
    this.current = station.anim;
    const shadow = new Graphics().ellipse(0, 0, 10, 3).fill({ color: 0x000000, alpha: 0.4 });
    this.sprite = new Sprite(this.anims[this.current][0]);
    this.sprite.anchor.set(0.5, 1);
    this.sprite.y = 1;
    this.container.addChild(shadow, this.sprite);
    this.container.position.set(Math.round(station.x), Math.round(station.y));
    this.container.zIndex = station.y;
    if (station.faceRight) this.sprite.scale.x = -1;
  }

  update(dt: number, px: number, py: number, talking: boolean): void {
    this.busied = false;
    const seated = this.station.anim === 'sit';
    const near = Math.hypot(px - this.station.x, py - this.station.y) < 90;
    let want: CrewAnim = this.station.anim;
    if (talking && !seated) want = 'talk';
    else if (talking && seated) want = 'sit';
    else if (!seated && !near) {
      // Now and then, busy themselves with their station.
      this.gestureTimer -= dt;
      if (this.gestureTimer <= 0 && this.gestureLeft <= 0) {
        this.gestureLeft = 2 + Math.random() * 2;
        this.gestureTimer = 6 + Math.random() * 8;
        this.busied = true;
      }
      if (this.gestureLeft > 0) {
        this.gestureLeft -= dt;
        want = this.station.anim === 'idle' ? 'interact' : 'idle';
      }
    }
    if (want !== this.current) {
      this.current = want;
      this.frame = 0;
      this.t = 0;
    }
    // Turn to face whoever is talking to them (seated crew stay put).
    if ((near || talking) && !seated) this.sprite.scale.x = px > this.station.x ? -1 : 1;

    const frames = this.anims[this.current];
    this.t += dt;
    const step = 1 / FPS[this.current];
    while (this.t >= step) {
      this.t -= step;
      // Station loops ping-pong: the painted frames are variations, not a cycle.
      if (this.current === 'talk') this.frame = (this.frame + 1) % frames.length;
      else {
        if (this.frame + this.pingpong >= frames.length || this.frame + this.pingpong < 0) this.pingpong *= -1;
        this.frame += this.pingpong;
      }
    }
    this.sprite.texture = frames[this.frame];
  }
}
