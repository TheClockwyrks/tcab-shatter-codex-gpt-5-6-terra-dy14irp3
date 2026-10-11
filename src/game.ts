import type {
  Game,
  InitApi,
  RenderApi,
  UpdateApi,
} from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import * as C from "./constants";

export const BACKGROUND = "#07111f";
export type Screen = "title" | "howto" | "playing" | "paused" | "gameover";
export type SaucerEdge = "left" | "right";
export type FieldEdge = "top" | "bottom" | "left" | "right";
export interface ShipState {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly angle: number;
  readonly thrusting: boolean;
  readonly invuln: number;
  readonly collision: boolean;
  readonly fireCooldown: number;
}
export interface BulletState {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly life: number;
}
export interface RockState {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly size: C.RockSize;
  readonly spin: number;
  readonly health: number;
  readonly flash: number;
}
export interface SaucerState {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly mind: boolean;
  readonly gun: boolean;
  readonly travel: boolean;
  readonly weave: 1 | -1;
  readonly fireClock: number;
  readonly weaveClock: number;
  readonly age: number;
}
export interface TorpedoState {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly heading: number;
  readonly life: number;
  readonly homing: boolean;
}
export interface ShatterState {
  readonly screen: Screen;
  readonly menuIndex: number;
  readonly score: number;
  readonly lives: number;
  readonly wave: number;
  readonly waveBanner: number;
  readonly ship: ShipState;
  readonly bullets: readonly BulletState[];
  readonly rocks: readonly RockState[];
  readonly saucer: SaucerState | null;
  readonly enemyBullets: readonly BulletState[];
  readonly torpedoes: readonly TorpedoState[];
  readonly torpedoCharge: number;
  readonly waveSpawning: boolean;
  readonly saucerSpawning: boolean;
  readonly saucerClock: number;
  readonly saucerDue: number;
  readonly nextSaucerEdge: SaucerEdge | null;
  readonly nextSaucerRow: number | null;
  readonly nextSaucerAim: number | null;
  readonly nextRockSpeed: number | null;
  readonly nextRecycleEdge: FieldEdge | null;
  readonly tickClock: number;
  readonly nextId: number;
  readonly simTime: number;
  readonly muted: boolean;
}
type Snap = Record<string, unknown>;
type RO = DeepReadonly<ShatterState>;
export interface ShatterDebugApi {
  readonly version: number;
  reset(s: RO): ShatterState;
  snapshot(s: RO): Snap;
  reconcile(s: RO): ShatterState;
  menuItemRect(
    s: RO,
    i: number,
  ): { x: number; y: number; w: number; h: number } | null;
  [key: string]: unknown;
}
const wrap = (n: number, m: number) => ((n % m) + m) % m;
const unit = (a: number) => ({ x: Math.cos(a), y: Math.sin(a) });
const d = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  let x = b.x - a.x,
    y = b.y - a.y;
  if (x > C.FIELD_W / 2) x -= C.FIELD_W;
  if (x <= -C.FIELD_W / 2) x += C.FIELD_W;
  if (y > C.FIELD_H / 2) y -= C.FIELD_H;
  if (y <= -C.FIELD_H / 2) y += C.FIELD_H;
  return { x, y, r: Math.hypot(x, y) };
};
const ship = (): ShipState => ({
  x: C.SAFE_X,
  y: C.SAFE_Y,
  vx: 0,
  vy: 0,
  angle: C.FACE_UP,
  thrusting: false,
  invuln: 0,
  collision: true,
  fireCooldown: 0,
});
const fresh = (muted = false): ShatterState => ({
  screen: "title",
  menuIndex: 0,
  score: 0,
  lives: C.START_LIVES,
  wave: 0,
  waveBanner: 0,
  ship: ship(),
  bullets: [],
  rocks: [],
  saucer: null,
  enemyBullets: [],
  torpedoes: [],
  torpedoCharge: 1,
  waveSpawning: true,
  saucerSpawning: true,
  saucerClock: 0,
  saucerDue: C.SAUCER_FIRST_DELAY,
  nextSaucerEdge: null,
  nextSaucerRow: null,
  nextSaucerAim: null,
  nextRockSpeed: null,
  nextRecycleEdge: null,
  tickClock: 0,
  nextId: 1,
  simTime: 0,
  muted,
});
const rect = (s: RO, i: number) => {
  const n =
    s.screen === "paused"
      ? 3
      : s.screen === "title" || s.screen === "gameover"
        ? 2
        : 0;
  return i >= 0 && i < n ? { x: 460, y: 350 + i * 58, w: 360, h: 48 } : null;
};
const snapshot = (s: RO): Snap => ({
  ...s,
  version: C.SHATTER_DEBUG_VERSION,
  ship: { ...s.ship, speed: Math.hypot(s.ship.vx, s.ship.vy) },
  rocks: s.rocks.map((r) => ({ ...r, radius: C.ROCK_RADIUS[r.size] })),
  torpedoReady: s.torpedoCharge === 1,
});
const check = (x: number) => {
  if (!Number.isFinite(x))
    throw new Error("Shatter debug: expected finite number");
};
function debug(): ShatterDebugApi {
  const add = (
    s: RO,
    k: "bullets" | "enemyBullets",
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
  ) => {
    [x, y, vx, vy].forEach(check);
    return {
      ...s,
      [k]: [...s[k], { id: s.nextId, x, y, vx, vy, life }],
      nextId: s.nextId + 1,
    };
  };
  const find = (s: RO, id: number) => {
    if (
      ![...s.bullets, ...s.enemyBullets, ...s.rocks, ...s.torpedoes].some(
        (e) => e.id === id,
      )
    )
      throw new Error("Shatter debug: unknown id");
  };
  const api = {
    version: C.SHATTER_DEBUG_VERSION,
    reset: (s: RO) => fresh(s.muted),
    snapshot,
    reconcile: (s: RO) => ({ ...s }),
    menuItemRect: rect,
    setScreen: (s: RO, v: Screen) => ({ ...s, screen: v }),
    setMenuIndex: (s: RO, v: number) => ({ ...s, menuIndex: v }),
    setScore: (s: RO, v: number) => ({ ...s, score: v }),
    setLives: (s: RO, v: number) => ({ ...s, lives: v }),
    setWave: (s: RO, v: number) => ({ ...s, wave: v }),
    setWaveBanner: (s: RO, v: number) => ({ ...s, waveBanner: v }),
    setWaveSpawning: (s: RO, v: boolean) => ({ ...s, waveSpawning: v }),
    setSaucerSpawning: (s: RO, v: boolean) => ({ ...s, saucerSpawning: v }),
    setSaucerDue: (s: RO, v: number) => ({ ...s, saucerDue: v }),
    setShipPosition: (s: RO, x: number, y: number) => ({
      ...s,
      ship: { ...s.ship, x, y },
    }),
    setShipVelocity: (s: RO, vx: number, vy: number) => ({
      ...s,
      ship: { ...s.ship, vx, vy },
    }),
    setShipAngle: (s: RO, angle: number) => ({
      ...s,
      ship: { ...s.ship, angle },
    }),
    setShipInvuln: (s: RO, invuln: number) => ({
      ...s,
      ship: { ...s.ship, invuln },
    }),
    setFireCooldown: (s: RO, fireCooldown: number) => ({
      ...s,
      ship: { ...s.ship, fireCooldown },
    }),
    setShipCollision: (s: RO, collision: boolean) => ({
      ...s,
      ship: { ...s.ship, collision },
    }),
    addBullet: (s: RO, x: number, y: number, vx: number, vy: number) =>
      add(s, "bullets", x, y, vx, vy, C.BULLET_LIFE),
    removeBullet: (s: RO, id: number) => {
      find(s, id);
      return { ...s, bullets: s.bullets.filter((b) => b.id !== id) };
    },
    clearBullets: (s: RO) => ({ ...s, bullets: [] }),
    addEnemyBullet: (s: RO, x: number, y: number, vx: number, vy: number) =>
      add(s, "enemyBullets", x, y, vx, vy, C.SAUCER_BULLET_LIFE),
    removeEnemyBullet: (s: RO, id: number) => {
      find(s, id);
      return { ...s, enemyBullets: s.enemyBullets.filter((b) => b.id !== id) };
    },
    clearEnemyBullets: (s: RO) => ({ ...s, enemyBullets: [] }),
    addRock: (s: RO, size: C.RockSize, x: number, y: number) => ({
      ...s,
      rocks: [
        ...s.rocks,
        {
          id: s.nextId,
          x,
          y,
          vx: 0,
          vy: 0,
          size,
          spin: 0,
          health: C.ROCK_HEALTH[size],
          flash: 0,
        },
      ],
      nextId: s.nextId + 1,
    }),
    setRockVelocity: (s: RO, id: number, vx: number, vy: number) => {
      find(s, id);
      return {
        ...s,
        rocks: s.rocks.map((r) => (r.id === id ? { ...r, vx, vy } : r)),
      };
    },
    setRockHealth: (s: RO, id: number, health: number) => {
      find(s, id);
      return {
        ...s,
        rocks: s.rocks.map((r) => (r.id === id ? { ...r, health } : r)),
      };
    },
    removeRock: (s: RO, id: number) => {
      find(s, id);
      return { ...s, rocks: s.rocks.filter((r) => r.id !== id) };
    },
    clearRocks: (s: RO) => ({ ...s, rocks: [] }),
    addSaucer: (s: RO, x: number, y: number) => ({
      ...s,
      saucer: {
        id: s.nextId,
        x,
        y,
        vx: C.SAUCER_SPEED,
        vy: 0,
        mind: true,
        gun: true,
        travel: true,
        weave: 1,
        fireClock: C.SAUCER_FIRE_INTERVAL,
        weaveClock: C.SAUCER_WEAVE_INTERVAL,
        age: 0,
      },
      nextId: s.nextId + 1,
    }),
    setSaucerVelocity: (s: RO, vx: number, vy: number) => ({
      ...s,
      saucer: s.saucer && { ...s.saucer, vx, vy },
    }),
    setSaucerWeave: (s: RO, weave: 1 | -1) => ({
      ...s,
      saucer: s.saucer && { ...s.saucer, weave },
    }),
    removeSaucer: (s: RO) => ({ ...s, saucer: null }),
    setSaucerMind: (s: RO, mind: boolean) => ({
      ...s,
      saucer: s.saucer && { ...s.saucer, mind },
    }),
    setSaucerGun: (s: RO, gun: boolean) => ({
      ...s,
      saucer: s.saucer && { ...s.saucer, gun },
    }),
    setSaucerTravel: (s: RO, travel: boolean) => ({
      ...s,
      saucer: s.saucer && { ...s.saucer, travel },
    }),
    setNextSaucerEdge: (s: RO, v: SaucerEdge) => ({ ...s, nextSaucerEdge: v }),
    setNextSaucerRow: (s: RO, v: number) => ({ ...s, nextSaucerRow: v }),
    setNextSaucerAim: (s: RO, v: number) => ({ ...s, nextSaucerAim: v }),
    setNextRockSpeed: (s: RO, v: number) => ({ ...s, nextRockSpeed: v }),
    setNextRecycleEdge: (s: RO, v: FieldEdge) => ({ ...s, nextRecycleEdge: v }),
    setTorpedoCharge: (s: RO, torpedoCharge: number) => ({
      ...s,
      torpedoCharge,
    }),
    addTorpedo: (s: RO, x: number, y: number, heading: number) => {
      const u = unit(heading);
      return {
        ...s,
        torpedoes: [
          ...s.torpedoes,
          {
            id: s.nextId,
            x,
            y,
            vx: u.x * C.TORPEDO_SPEED,
            vy: u.y * C.TORPEDO_SPEED,
            heading,
            life: C.TORPEDO_LIFE,
            homing: true,
          },
        ],
        nextId: s.nextId + 1,
      };
    },
    setTorpedoHeading: (s: RO, id: number, heading: number) => {
      find(s, id);
      const u = unit(heading);
      return {
        ...s,
        torpedoes: s.torpedoes.map((t) =>
          t.id === id
            ? {
                ...t,
                heading,
                vx: u.x * C.TORPEDO_SPEED,
                vy: u.y * C.TORPEDO_SPEED,
              }
            : t,
        ),
      };
    },
    setTorpedoHoming: (s: RO, id: number, homing: boolean) => {
      find(s, id);
      return {
        ...s,
        torpedoes: s.torpedoes.map((t) => (t.id === id ? { ...t, homing } : t)),
      };
    },
    removeTorpedo: (s: RO, id: number) => {
      find(s, id);
      return { ...s, torpedoes: s.torpedoes.filter((t) => t.id !== id) };
    },
    clearTorpedoes: (s: RO) => ({ ...s, torpedoes: [] }),
  };
  return api as ShatterDebugApi;
}
function wave(s: ShatterState): ShatterState {
  let id = s.nextId;
  const rocks: RockState[] = [];
  const m = 1 + Math.min(C.WAVE_SPEED_CAP, C.WAVE_SPEED_STEP * (s.wave - 1));
  for (let i = 0; i < C.WAVE_BASE_ROCKS + s.wave; i++) {
    let x, y;
    do {
      x = Math.random() * C.FIELD_W;
      y = Math.random() * C.FIELD_H;
    } while (
      d({ x, y }, s.ship).r < C.WAVE_MIN_SHIP_DIST ||
      Math.hypot(x - C.STAR_X, y - C.STAR_Y) < C.WAVE_MIN_STAR_DIST
    );
    const a = Math.random() * Math.PI * 2,
      v =
        (s.nextRockSpeed ??
          C.ROCK_SPEED_MIN.large +
            Math.random() * (C.ROCK_SPEED_MAX.large - C.ROCK_SPEED_MIN.large)) *
        m;
    rocks.push({
      id: id++,
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      size: "large",
      spin: 0,
      health: 3,
      flash: 0,
    });
  }
  return {
    ...s,
    rocks: [...s.rocks, ...rocks],
    nextId: id,
    nextRockSpeed: null,
  };
}
function tick(
  old: ShatterState,
  held: {
    up: boolean;
    left: boolean;
    right: boolean;
    fire: boolean;
    torpedo: boolean;
  },
  audio: UpdateApi["audio"],
): ShatterState {
  if (old.screen !== "playing")
    return { ...old, simTime: old.simTime + C.TICK_DT };
  const angle =
    old.ship.angle +
    (held.right ? 1 : 0) * C.SHIP_TURN * C.TICK_DT -
    (held.left ? 1 : 0) * C.SHIP_TURN * C.TICK_DT;
  let vx = old.ship.vx;
  let vy = old.ship.vy;
  if (held.up) {
    const u = unit(angle);
    vx += u.x * C.SHIP_THRUST * C.TICK_DT;
    vy += u.y * C.SHIP_THRUST * C.TICK_DT;
  }
  const drag = Math.pow(0.5, C.TICK_DT / C.SHIP_DRAG_HALFLIFE);
  vx *= drag;
  vy *= drag;
  const speed = Math.hypot(vx, vy);
  if (speed > C.SHIP_MAX) {
    vx = (vx / speed) * C.SHIP_MAX;
    vy = (vy / speed) * C.SHIP_MAX;
  }
  let s: ShatterState = {
    ...old,
    simTime: old.simTime + C.TICK_DT,
    ship: {
      ...old.ship,
      angle,
      vx,
      vy,
      x: wrap(old.ship.x + vx * C.TICK_DT, C.FIELD_W),
      y: wrap(old.ship.y + vy * C.TICK_DT, C.FIELD_H),
      thrusting: held.up,
      invuln: Math.max(0, old.ship.invuln - C.TICK_DT),
      fireCooldown: Math.max(0, old.ship.fireCooldown - 1),
    },
  };
  if (
    held.fire &&
    s.ship.fireCooldown === 0 &&
    s.bullets.length < C.MAX_BULLETS
  ) {
    const u = unit(angle);
    s = {
      ...s,
      bullets: [
        ...s.bullets,
        {
          id: s.nextId,
          x: s.ship.x + u.x * C.SHIP_R,
          y: s.ship.y + u.y * C.SHIP_R,
          vx: s.ship.vx + u.x * C.MUZZLE_SPEED,
          vy: s.ship.vy + u.y * C.MUZZLE_SPEED,
          life: C.BULLET_LIFE,
        },
      ],
      nextId: s.nextId + 1,
      ship: { ...s.ship, fireCooldown: C.FIRE_INTERVAL_TICKS },
    };
    audio.play(C.CUES.fire);
  }
  if (held.torpedo && s.torpedoCharge === 1 && !s.torpedoes.length) {
    const u = unit(angle);
    s = {
      ...s,
      torpedoes: [
        {
          id: s.nextId,
          x: s.ship.x,
          y: s.ship.y,
          vx: u.x * C.TORPEDO_SPEED,
          vy: u.y * C.TORPEDO_SPEED,
          heading: angle,
          life: C.TORPEDO_LIFE,
          homing: true,
        },
      ],
      nextId: s.nextId + 1,
      torpedoCharge: 0,
    };
  }
  const grav = <T extends BulletState | RockState>(e: T): T => {
    const dx = C.STAR_X - e.x,
      dy = C.STAR_Y - e.y,
      r = Math.hypot(dx, dy) || 1,
      a = C.MU / Math.max(r, C.SOFTEN) ** 2,
      nvx = e.vx + (dx / r) * a * C.TICK_DT,
      nvy = e.vy + (dy / r) * a * C.TICK_DT;
    return {
      ...e,
      vx: nvx,
      vy: nvy,
      x: wrap(e.x + nvx * C.TICK_DT, C.FIELD_W),
      y: wrap(e.y + nvy * C.TICK_DT, C.FIELD_H),
      life: "life" in e ? e.life - C.TICK_DT : undefined,
    } as T;
  };
  s = {
    ...s,
    bullets: s.bullets
      .map(grav)
      .filter(
        (b) =>
          b.life > 0 && Math.hypot(b.x - C.STAR_X, b.y - C.STAR_Y) > C.CORE_R,
      ),
    enemyBullets: s.enemyBullets
      .map(grav)
      .filter(
        (b) =>
          b.life > 0 && Math.hypot(b.x - C.STAR_X, b.y - C.STAR_Y) > C.CORE_R,
      ),
    rocks: s.rocks.map((r) => ({
      ...grav(r),
      spin: r.spin + C.TICK_DT,
      flash: Math.max(0, r.flash - C.TICK_DT),
    })),
  };
  for (const b of [...s.bullets]) {
    const r = s.rocks.find(
      (x) => d(b, x).r <= C.BULLET_R + C.ROCK_RADIUS[x.size],
    );
    if (r) {
      s = { ...s, bullets: s.bullets.filter((x) => x.id !== b.id) };
      if (r.health > 1)
        s = {
          ...s,
          rocks: s.rocks.map((x) =>
            x.id === r.id
              ? { ...x, health: x.health - 1, flash: C.HIT_FLASH_TIME }
              : x,
          ),
        };
      else {
        s = {
          ...s,
          rocks: s.rocks.filter((x) => x.id !== r.id),
          score:
            s.score +
            (r.size === "large" ? 20 : r.size === "medium" ? 50 : 100),
        };
        audio.play(C.CUES.shatter);
      }
    }
  }
  const torps: TorpedoState[] = [];
  for (const t of s.torpedoes) {
    let h = t.heading;
    if (t.homing) {
      const target = s.rocks
        .map((r) => ({ ...r, ...d(t, r) }))
        .filter(
          (r) =>
            Math.abs(
              Math.atan2(
                Math.sin(Math.atan2(r.y, r.x) - h),
                Math.cos(Math.atan2(r.y, r.x) - h),
              ),
            ) <= C.TORPEDO_CONE,
        )
        .sort((a, b) => a.r - b.r)[0];
      if (target) {
        const delta = Math.atan2(
          Math.sin(Math.atan2(target.y, target.x) - h),
          Math.cos(Math.atan2(target.y, target.x) - h),
        );
        h += Math.max(
          -C.TORPEDO_TURN * C.TICK_DT,
          Math.min(C.TORPEDO_TURN * C.TICK_DT, delta),
        );
      }
    }
    const u = unit(h),
      nt = {
        ...t,
        heading: h,
        vx: u.x * C.TORPEDO_SPEED,
        vy: u.y * C.TORPEDO_SPEED,
        x: wrap(t.x + u.x * C.TORPEDO_SPEED * C.TICK_DT, C.FIELD_W),
        y: wrap(t.y + u.y * C.TORPEDO_SPEED * C.TICK_DT, C.FIELD_H),
        life: t.life - C.TICK_DT,
      };
    const hit = s.rocks.find(
      (r) => d(nt, r).r <= C.TORPEDO_R + C.ROCK_RADIUS[r.size],
    );
    if (hit) {
      s = {
        ...s,
        rocks: s.rocks.filter((r) => r.id !== hit.id),
        score:
          s.score +
          (hit.size === "large" ? 20 : hit.size === "medium" ? 50 : 100),
      };
      audio.play(C.CUES.shatter);
    } else if (nt.life > 0) torps.push(nt);
  }
  s = {
    ...s,
    torpedoes: torps,
    torpedoCharge: Math.min(
      1,
      s.torpedoCharge + C.TICK_DT / C.TORPEDO_RECHARGE,
    ),
  };
  const banner = Math.max(0, s.waveBanner - C.TICK_DT);
  s = { ...s, waveBanner: banner };
  if (old.waveBanner > 0 && banner === 0 && s.waveSpawning) s = wave(s);
  else if (old.rocks.length > 0 && s.rocks.length === 0 && s.waveSpawning)
    s = { ...s, wave: s.wave + 1, waveBanner: C.WAVE_BANNER_TIME };
  return s;
}
function draw(ctx: CanvasRenderingContext2D, s: RO) {
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, C.FIELD_W, C.FIELD_H);
  const halo = ctx.createRadialGradient(
    C.STAR_X,
    C.STAR_Y,
    C.CORE_R,
    C.STAR_X,
    C.STAR_Y,
    C.HALO_R * 1.5,
  );
  halo.addColorStop(0, "#fff0a0");
  halo.addColorStop(1, "#ff7a1800");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(C.STAR_X, C.STAR_Y, C.HALO_R * 1.5, 0, 7);
  ctx.fill();
  s.rocks.forEach((r) => {
    ctx.strokeStyle = r.flash ? "#fff" : "#a8c4d8";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(r.x, r.y, C.ROCK_RADIUS[r.size], 0, 7);
    ctx.stroke();
  });
  const dot = (b: BulletState, c: string, r: number) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(b.x, b.y, r, 0, 7);
    ctx.fill();
  };
  s.bullets.forEach((b) => dot(b, "#7eeaff", C.BULLET_R));
  s.enemyBullets.forEach((b) => dot(b, "#ff728d", C.SAUCER_BULLET_R));
  s.torpedoes.forEach((t) => dot(t, "#ffe26d", C.TORPEDO_R));
  ctx.save();
  ctx.translate(s.ship.x, s.ship.y);
  ctx.rotate(s.ship.angle);
  ctx.strokeStyle = "#e9fbff";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(20, 0);
  ctx.lineTo(-13, -12);
  ctx.lineTo(-8, 0);
  ctx.lineTo(-13, 12);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = "#eff8ff";
  ctx.font = "bold 24px system-ui";
  ctx.fillText(`SCORE ${s.score}`, 32, 46);
  ctx.font = "16px system-ui";
  ctx.fillText(`SHIPS ${"▲".repeat(Math.max(0, s.lives - 1))}`, 32, 74);
  ctx.fillText("TORPEDO", 32, 105);
  ctx.strokeRect(32, 112, 120, 8);
  ctx.fillStyle = "#ffe36b";
  ctx.fillRect(32, 112, 120 * s.torpedoCharge, 8);
  if (s.waveBanner) {
    ctx.textAlign = "center";
    ctx.font = "bold 52px system-ui";
    ctx.fillStyle = "#fff";
    ctx.fillText(`WAVE ${s.wave}`, 640, 340);
    ctx.textAlign = "left";
  }
}
function renderScreen(ctx: CanvasRenderingContext2D, s: RO) {
  draw(ctx, s);
  if (s.screen === "playing") return;
  ctx.fillStyle = "#06101be8";
  ctx.fillRect(0, 0, C.FIELD_W, C.FIELD_H);
  ctx.textAlign = "center";
  ctx.fillStyle = "#f4fbff";
  if (s.screen === "howto") {
    ctx.font = "bold 42px system-ui";
    ctx.fillText("HOW TO PLAY", 640, 140);
    ctx.font = "20px system-ui";
    [
      "Clear armored rocks through their fragments.",
      "Bullets and rocks curve around the gravity well — your ship does not.",
      "ARROWS / WASD fly • SPACE fires • F launches a torpedo",
      "ENTER selects • ESC returns • P pauses • M mutes",
    ].forEach((t, i) => ctx.fillText(t, 640, 240 + i * 56));
    ctx.textAlign = "left";
    return;
  }
  const title =
    s.screen === "title"
      ? "SHATTER"
      : s.screen === "paused"
        ? "PAUSED"
        : "GAME OVER";
  ctx.font = "bold 70px system-ui";
  ctx.fillText(title, 640, 180);
  ctx.font = "18px system-ui";
  if (s.screen === "title") ctx.fillText("GRAVITY WELL SHOOTER", 640, 220);
  const items =
    s.screen === "title"
      ? ["PLAY", "HOW TO PLAY"]
      : s.screen === "paused"
        ? ["RESUME", "RESTART", "QUIT TO MENU"]
        : ["PLAY AGAIN", "MENU"];
  ctx.font = "bold 25px system-ui";
  items.forEach((x, i) => {
    ctx.fillStyle = i === s.menuIndex ? "#ffe370" : "#e8f5ff";
    ctx.fillText(i === s.menuIndex ? `› ${x} ‹` : x, 640, 380 + i * 58);
  });
  ctx.textAlign = "left";
}
export const game: Game<ShatterState, ShatterDebugApi> = {
  initialize(api: InitApi<ShatterState>) {
    C.ACTIONS.forEach((a) => api.input.register(a, C.BINDINGS[a]));
    Object.values(C.CUES).forEach((c) =>
      api.audio.define(c, {
        wave: "square",
        freq: 440,
        durationMs: 100,
        gain: 0.12,
      }),
    );
    api.diagnostics.register("screen", (s) => s.screen);
    api.diagnostics.register("score", (s) => s.score);
    api.diagnostics.register("lives", (s) => s.lives);
    api.diagnostics.register("wave", (s) => s.wave);
    api.diagnostics.register("rocks", (s) => s.rocks.length);
    api.diagnostics.register("time", (s) => s.simTime);
    return [fresh(), debug()];
  },
  update(state: RO, api: UpdateApi, dt: number) {
    if (api.input.pressed("mute")) api.audio.setMuted(!api.audio.muted());
    let s: ShatterState = { ...state, muted: api.audio.muted() };
    const pressed = (a: C.ActionName) => api.input.pressed(a);
    if (s.screen === "playing" && pressed("pause"))
      return { ...s, screen: "paused" };
    if (s.screen === "paused" && (pressed("pause") || pressed("back")))
      return { ...s, screen: "playing" };
    if (s.screen !== "playing") {
      if (s.screen === "howto" && (pressed("back") || pressed("confirm")))
        return { ...s, screen: "title", menuIndex: 1 };
      const count = s.screen === "paused" ? 3 : 2;
      if (pressed("up"))
        s = { ...s, menuIndex: (s.menuIndex + count - 1) % count };
      if (pressed("down")) s = { ...s, menuIndex: (s.menuIndex + 1) % count };
      if (pressed("confirm")) {
        if (s.screen === "title")
          return s.menuIndex
            ? { ...s, screen: "howto" }
            : {
                ...fresh(s.muted),
                screen: "playing",
                wave: 1,
                waveBanner: C.WAVE_BANNER_TIME,
              };
        if (s.screen === "paused")
          return s.menuIndex === 0
            ? { ...s, screen: "playing" }
            : s.menuIndex === 1
              ? {
                  ...fresh(s.muted),
                  screen: "playing",
                  wave: 1,
                  waveBanner: C.WAVE_BANNER_TIME,
                }
              : { ...s, screen: "title", menuIndex: 0 };
        return s.menuIndex
          ? { ...s, screen: "title", menuIndex: 0 }
          : {
              ...fresh(s.muted),
              screen: "playing",
              wave: 1,
              waveBanner: C.WAVE_BANNER_TIME,
            };
      }
      return s;
    }
    const held = {
      up: api.input.value("up") > 0,
      left: api.input.value("left") > 0,
      right: api.input.value("right") > 0,
      fire: api.input.value("a") > 0,
      torpedo: pressed("b"),
    };
    let clock = s.tickClock + dt;
    while (clock >= C.TICK_DT) {
      s = tick(s, held, api.audio);
      clock -= C.TICK_DT;
    }
    if (held.up) api.audio.loop(C.CUES.thrust);
    else api.audio.stop(C.CUES.thrust);
    return { ...s, tickClock: clock, muted: api.audio.muted() };
  },
  render(state: RO, api: RenderApi) {
    renderScreen(api.ctx, state);
  },
};
