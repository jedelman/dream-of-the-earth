// The camera director: where the camera should be, from what you're doing, and
// moving it there the way an operator would. It works relative to the creature,
// so when the world regrows or you board a highway (both move the creature's
// coordinates) the camera doesn't jump.
//
// A base framing follows you, chosen by what you're doing (low and close on the
// ground, behind and banking in the air, near the surface in water, wide on a
// highway), looks ahead along your way and toward where you've tapped to go, and
// drifts into a slow orbit when you sit still. Short event shots interrupt it:
// a low angle on a tree you shook, a close-up when you squeak, a look up at a sky
// being, a crane down when you arrive somewhere, a lurch of speed onto a highway.
import * as THREE from "three";
import { smoothDamp, shotWeight, bankFor, fovFor, orbitRate } from "./camerawork.js";

const UP = new THREE.Vector3(0, 1, 0);

export function buildDirector(camera) {
  const off = new THREE.Vector3(0, 40, 120), offV = new THREE.Vector3(); // camera, relative to the creature
  const look = new THREE.Vector3(), lookV = new THREE.Vector3(); // what it looks at, relative to the creature
  let fov = camera.fov, fovV = 0, roll = 0, rollV = 0;
  let shot = null, idleSince = 0, orbit = 0, lastHeading = null, turnRate = 0;
  const vel = new THREE.Vector3(), lastSubject = new THREE.Vector3(), hasLast = { v: false };
  const tmp = new THREE.Vector3(), offT = new THREE.Vector3(), lookT = new THREE.Vector3(), abs = new THREE.Vector3();

  const damp3 = (v, vv, target, st, dt) => {
    for (const k of ["x", "y", "z"]) [v[k], vv[k]] = smoothDamp(v[k], target[k], vv[k], st, dt);
  };

  return {
    /** Someone touched the controls: no idle orbit for a while. */
    input(t) { idleSince = t; orbit = 0; },
    /**
     * Play an event shot. frame(ctx, age) returns { off, look, fov } relative to the creature.
     * start: snap to the shot's first frame (for a crane that starts wide).
     */
    play(kind, t, frame, { dur = 3, blendIn = 0.6, blendOut = 1, start = false } = {}) {
      shot = { kind, t0: t, dur, blendIn, blendOut, frame, start };
    },
    get shot() { return shot && shot.kind; },
    /** End the current shot early, blending back to the base framing. */
    release(t) { if (shot) shot.dur = Math.min(shot.dur, t - shot.t0 + shot.blendOut); },

    /**
     * ctx: { t, dt, subject (Vector3), heading, mode ("air" | "ground" | "water"), speed01, riding,
     *        rig ({ back, up, near }), heightAt(x, z) | null, goal (Vector3 | null), sunDir, gold, scale,
     *        eyes (0..1: how far into the creature's own eyes), eye (Vector3: from the subject to its eyes) }
     */
    update(ctx) {
      const { t, dt, subject, heading, mode, speed01, riding, rig } = ctx;
      const f = tmp.set(-Math.sin(heading), 0, -Math.cos(heading));
      // How fast you're turning, for banking.
      if (lastHeading !== null) {
        const d = Math.atan2(Math.sin(heading - lastHeading), Math.cos(heading - lastHeading));
        turnRate += (d / Math.max(dt, 1e-3) - turnRate) * Math.min(1, dt * 6);
      }
      lastHeading = heading;
      // How fast you're moving through the world (the camera trails a little behind).
      if (hasLast.v && !riding) {
        const jump = abs.copy(subject).sub(lastSubject);
        if (jump.length() < 500) vel.lerp(jump.divideScalar(Math.max(dt, 1e-3)), Math.min(1, dt * 4));
        else vel.set(0, 0, 0); // the world regrew under us
      } else vel.set(0, 0, 0);
      lastSubject.copy(subject);
      hasLast.v = true;

      // ---- The base framing, by what you're doing ----
      let fovT = 62, rollT = 0;
      if (riding) {
        offT.copy(f).multiplyScalar(-Math.max(140, rig.back)).add(UP.clone().multiplyScalar(Math.max(45, rig.up)));
        lookT.copy(f).multiplyScalar(rig.near ? 40 : 0).add(UP.clone().multiplyScalar(rig.near ? 8 : 0));
        fovT = fovFor(speed01, true);
        rollT = Math.sin(t * 0.35) * 0.025;
      } else if (!rig.near) {
        // Zoomed out: straight framing, as the zoom asks.
        offT.copy(f).multiplyScalar(-rig.back).add(UP.clone().multiplyScalar(rig.up));
        lookT.set(0, 0, 0);
      } else if (mode === "water") {
        offT.copy(f).multiplyScalar(-Math.min(45, rig.back)).add(UP.clone().multiplyScalar(Math.min(10, rig.up)));
        lookT.copy(f).multiplyScalar(20).add(UP.clone().multiplyScalar(2));
      } else if (mode === "ground") {
        offT.copy(f).multiplyScalar(-rig.back * 0.85).add(UP.clone().multiplyScalar(rig.up * 0.55 + 2));
        lookT.copy(f).multiplyScalar(14).add(UP.clone().multiplyScalar(4 * (ctx.scale || 1)));
      } else {
        offT.copy(f).multiplyScalar(-rig.back).add(UP.clone().multiplyScalar(rig.up));
        lookT.copy(f).multiplyScalar(20 + 30 * speed01).add(UP.clone().multiplyScalar(6));
        fovT = fovFor(speed01);
        rollT = bankFor(turnRate, speed01);
      }
      if (!riding && rig.near) {
        offT.addScaledVector(vel, -0.12); // trail a beat behind when moving fast
        // On the way somewhere you tapped: glance toward it.
        if (ctx.goal) {
          abs.copy(ctx.goal).sub(subject);
          const d = abs.length();
          if (d > 30) lookT.lerp(abs.multiplyScalar(Math.min(1, 600 / d)), 0.3);
        }
        // Sitting still: a slow orbit, lingering when it faces a low golden sun.
        if (t - idleSince > 10 && speed01 < 0.05 && !ctx.goal && !(ctx.eyes > 0.5)) {
          const facing = ctx.sunDir ? -(offT.x * ctx.sunDir.x + offT.z * ctx.sunDir.z) / Math.max(1, Math.hypot(offT.x, offT.z)) : 0;
          orbit += dt * orbitRate(facing, ctx.gold || 0);
          offT.applyAxisAngle(UP, orbit).multiplyScalar(1.25);
          offT.y *= 1.1;
          lookT.set(0, 3 * (ctx.scale || 1), 0);
          fovT = 55;
        }
      }

      // ---- Through its eyes: zoomed all the way in, the camera sits at the creature's eyes, looking where it's going ----
      const eyes = !riding && ctx.eye ? ctx.eyes || 0 : 0;
      if (eyes > 0) {
        offT.lerp(ctx.eye, eyes);
        lookT.lerp(abs.copy(f).multiplyScalar(120).add(ctx.eye).add(UP.clone().multiplyScalar(-8)), eyes);
        fovT += (72 - fovT) * eyes;
      }

      // ---- Event shots blend over the base ----
      if (shot) {
        const age = t - shot.t0;
        if (age > shot.dur) shot = null;
        else {
          const s = shot.frame(ctx, age);
          if (shot.start) { off.copy(s.off); look.copy(s.look); offV.set(0, 0, 0); lookV.set(0, 0, 0); fov = s.fov ?? fov; shot.start = false; }
          const w = shotWeight(age, shot.dur, shot.blendIn, shot.blendOut);
          offT.lerp(s.off, w);
          lookT.lerp(s.look, w);
          if (s.fov) fovT += (s.fov - fovT) * w;
          rollT *= 1 - w;
        }
      }

      // ---- Move like an operator: springs, faster when zoomed out ----
      const st0 = !rig.near ? 0.15 : riding ? 0.5 : mode === "ground" ? 0.28 : 0.38;
      const st = st0 + (0.05 - st0) * eyes; // in its eyes the camera is locked to its head
      damp3(off, offV, offT, st, dt);
      damp3(look, lookV, lookT, 0.22 + (0.06 - 0.22) * eyes, dt);
      [fov, fovV] = smoothDamp(fov, fovT, fovV, 0.6, dt);
      [roll, rollV] = smoothDamp(roll, rollT, rollV, 0.45, dt);

      // ---- Place the camera; don't let it into the hills ----
      abs.copy(subject).add(off);
      if (ctx.heightAt && rig.near) {
        let lift = 0;
        for (let k = 1; k <= 4; k++) {
          const q = k / 4, x = subject.x + off.x * q, z = subject.z + off.z * q, y = subject.y + off.y * q;
          const g = ctx.heightAt(x, z);
          if (g >= 0) lift = Math.max(lift, (g + 4 - y) / q);
        }
        if (lift > 0) { abs.y += lift; off.y += lift * 0.5; } // and remember some of it, so it doesn't bob
      }
      camera.position.copy(abs);
      camera.lookAt(abs.copy(subject).add(look));
      camera.rotateZ(roll);
      if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = fov; camera.updateProjectionMatrix(); }
    },
  };
}

// ---- Event shots: each returns { off, look, fov } relative to the creature ----
const side = (dx, dz) => new THREE.Vector3(-dz, 0, dx).normalize();

/** A close-up: three-quarters front, at eye level, a little closer than you were. */
export function squeakShot(heading, scale, zoom) {
  const f = new THREE.Vector3(-Math.sin(heading), 0, -Math.cos(heading)).applyAxisAngle(UP, 0.6);
  const off = f.multiplyScalar(Math.max(26 + 14 * scale, zoom * 0.8)).add(new THREE.Vector3(0, 4 * scale, 0));
  return () => ({ off, look: new THREE.Vector3(0, 2 * scale, 0), fov: 50 });
}
/** A low angle on a tree you shook: you and its crown in frame, leaves falling between. */
export function treeShot(subject, rec) {
  return () => {
    const tx = rec.x - subject.x, tz = rec.z - subject.z;
    const mid = new THREE.Vector3(tx * 0.5, rec.y - subject.y + rec.height * 0.45, tz * 0.5);
    const d = Math.max(rec.height * 1.4, Math.hypot(tx, tz) * 1.3, 25);
    const off = mid.clone().add(side(tx, tz).multiplyScalar(d * 0.9)).add(new THREE.Vector3(0, -rec.height * 0.25, 0));
    off.y = Math.max(off.y, rec.y - subject.y + 3);
    return { off, look: mid, fov: 58 };
  };
}
/** You and a cairn, from the side, the cairn on the left of the frame (sheets open on the right). */
export function cairnShot(subject, at, height) {
  return () => {
    const tx = at.x - subject.x, tz = at.z - subject.z, L = Math.hypot(tx, tz) || 1;
    const mid = new THREE.Vector3(tx * 0.5, at.y - subject.y + height * 0.4, tz * 0.5);
    const d = Math.max(height * 1.8, L * 1.6, 30);
    // Looking along -s, screen right is (s.z, 0, -s.x); with s = (tz, 0, -tx)/L the cairn falls on the left.
    const off = mid.clone().add(new THREE.Vector3(tz / L, 0, -tx / L).multiplyScalar(d)).add(new THREE.Vector3(0, height * 0.35, 0));
    return { off, look: mid, fov: 56 };
  };
}
/** You and a butterfly, from the side. */
export function butterflyShot(subject, b) {
  return () => {
    const bx = b.x - subject.x, bz = b.z - subject.z;
    const mid = new THREE.Vector3(bx * 0.5, (b.y - subject.y) * 0.5 + 2, bz * 0.5);
    return { off: mid.clone().add(side(bx, bz).multiplyScalar(Math.max(18, Math.hypot(bx, bz) * 1.4))), look: mid, fov: 50 };
  };
}
/** Looking up past you at a sky being. */
export function beingShot(subject, at) {
  return () => {
    const to = new THREE.Vector3().copy(at).sub(subject);
    const flat = new THREE.Vector3(to.x, 0, to.z).normalize();
    return { off: flat.clone().multiplyScalar(-28).add(new THREE.Vector3(0, 2, 0)), look: to.multiplyScalar(0.5), fov: 70 };
  };
}
/** Arriving somewhere: start high and wide, crane down to you. */
export function arriveShot(heading, base, dur) {
  const f = new THREE.Vector3(-Math.sin(heading + 0.7), 0, -Math.cos(heading + 0.7));
  return (ctx, age) => {
    const e = 1 - Math.min(1, age / dur);
    const ease = e * e * (3 - 2 * e);
    const off = f.clone().multiplyScalar(-(base.back + 900 * ease)).add(new THREE.Vector3(0, base.up + 600 * ease, 0));
    return { off, look: new THREE.Vector3(0, 0, 0), fov: 62 - 10 * ease };
  };
}
/** Onto a highway: a lurch of speed (the field of view kicks wide, then settles). */
export const boardShot = () => (ctx) => ({ off: new THREE.Vector3(-Math.sin(ctx.heading), 0, -Math.cos(ctx.heading)).multiplyScalar(-90).add(new THREE.Vector3(0, 30, 0)), look: new THREE.Vector3(0, 0, 0), fov: 92 });
