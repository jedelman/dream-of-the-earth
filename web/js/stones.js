// The stones at the ley nodes (Jason, 11-09: "We should rework the portal UX as well - it doesn't work very well for
// non-fliers! Maybe pin position and switch to a lane selector, space or shift to cancel; have a shrine or a circle of
// standing stones that you can interact with before the pillar of light pulls you up"). A ring of standing stones at the
// foot of each node's pillar: step in and touch them, and the light lifts you to the ring overhead, where you choose
// a lane. The stones are stone: anyone can see them, but only someone who sees the ley lines (a prism) sees what they
// hum to, and only then do their veins and the ring on the ground glow. At sea they float. Computed, like everything.
import * as THREE from "three";
import { curved } from "./curvature.js";
import { hashString } from "./rng.js";

/** The ring's radius (m) and how many stones stand in it. */
export const CIRCLE_R = 14, STONES = 9;
const GREY = 0xa9a5b4, GOLD = 0xffc94a;

/**
 * pillars: the highways' ({ x, z, top, node }); heightAt: the land's. Returns { group, circles, near(x, z, r),
 * update(t, lit) }. circles: [{ i, x, z, y (the ground in the ring, or the sea's surface), top (the ring overhead), node }].
 */
export function buildStones(pillars, heightAt) {
  const group = new THREE.Group();
  const stone = curved(new THREE.MeshLambertMaterial({ color: GREY, emissive: new THREE.Color(GOLD), emissiveIntensity: 0, flatShading: true }), "-ley-stone");
  const glowMat = curved(new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), "-ley-ring");
  const circles = [], floating = [];
  pillars.forEach((pl) => {
    const centre = heightAt(pl.x, pl.z), sea = centre < 0;
    const key = `${pl.node.lat.toFixed(4)},${pl.node.lon.toFixed(4)}`, h = hashString(`stones:${key}`) >>> 0;
    const ring = new THREE.Group();
    for (let k = 0; k < STONES; k++) {
      const u = ((h >>> (k * 3)) & 7) / 7, a = (k / STONES) * Math.PI * 2 + u * 0.2;
      const x = Math.cos(a) * CIRCLE_R, z = Math.sin(a) * CIRCLE_R;
      const tall = 3.2 + u * 2.2, ground = sea ? 0 : heightAt(pl.x + x, pl.z + z);
      const m = new THREE.Mesh(new THREE.BoxGeometry(1.3, tall, 0.8).translate(0, tall / 2 - 0.3, 0), stone);
      m.position.set(x, (sea ? -0.4 : ground) - (sea ? 0 : centre), z);
      m.rotation.set((u - 0.5) * 0.12, -a, (0.5 - u) * 0.1); // each faces the middle, leaning a little
      ring.add(m);
    }
    // A ring of light on the ground (or the water) inside the stones, for whoever sees the ley.
    const glow = new THREE.Mesh(new THREE.RingGeometry(CIRCLE_R - 3.2, CIRCLE_R - 2.4, 24).rotateX(-Math.PI / 2), glowMat);
    glow.position.y = 0.15;
    glow.renderOrder = 2;
    ring.add(glow);
    const y = sea ? 0 : centre;
    ring.position.set(pl.x, y, pl.z);
    group.add(ring);
    if (sea) floating.push({ ring, phase: (h % 997) / 997 });
    circles.push({ i: circles.length, x: pl.x, z: pl.z, y, top: pl.top, node: pl.node, sea });
  });
  return {
    group,
    circles,
    near(x, z, r) { return circles.filter((c) => Math.hypot(c.x - x, c.z - z) < r); },
    /** lit: whether you see the ley (the stones' veins and the ring glow, softly breathing). */
    update(t, lit) {
      stone.emissiveIntensity = lit ? 0.12 + 0.06 * Math.sin(t * 1.3) : 0;
      glowMat.opacity = lit ? 0.45 + 0.2 * Math.sin(t * 1.3) : 0;
      for (const f of floating) f.ring.position.y = Math.sin(t * 0.8 + f.phase * 6.28) * 0.25;
    },
  };
}
