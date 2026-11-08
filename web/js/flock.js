// Your mutuals' creatures, where their intents put them: each grown from its seed
// and stats like your own, placed by whereAt() on the shared clock, eased so a new
// intent glides rather than jumps, with a small @handle over it when it's near (marked
// "bot" for accounts that label themselves so), a speech bubble when it says
// something, and a hop when it squeaks.
import * as THREE from "three";
import { generateCreature } from "./creature-graph.js";
import { buildCreature } from "./creature.js";
import { whereAt, fresh } from "./intents.js";
import { highwayAltitude } from "./ride.js";

const MAX = 24, LABEL_M = 600, WORLD_M = 16000;

export function buildFlock(scene, labelsEl) {
  const live = new Map(); // did -> { who, body, graph, key, pos, heading, label, seen }
  const tmp = new THREE.Vector3();

  function make(who) {
    const graph = generateCreature(who.intent.creature.seed);
    const body = buildCreature(graph, who.intent.creature.stats);
    scene.add(body.group);
    const label = document.createElement("div");
    label.className = "who";
    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.hidden = true;
    labelsEl.append(label, bubble);
    return { who, graph, body, key: `${who.intent.creature.seed}:${Object.values(who.intent.creature.stats).join(",")}`, pos: null, heading: 0, label, bubble, hopAt: -10 };
  }
  function drop(did) {
    const e = live.get(did);
    if (!e) return;
    scene.remove(e.body.group);
    e.body.group.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
    e.label.remove();
    e.bubble.remove();
    live.delete(did);
  }

  return {
    /** Who's in the dream: [{ did, handle, intent }] (already filtered to people you may see). */
    set(list) {
      const keep = new Set();
      for (const who of list.slice(0, MAX)) {
        keep.add(who.did);
        let e = live.get(who.did);
        const key = `${who.intent.creature.seed}:${Object.values(who.intent.creature.stats).join(",")}`;
        if (e && e.key !== key) { drop(who.did); e = null; }
        if (!e) { e = make(who); live.set(who.did, e); }
        e.who = who;
        const tag = document.createElement("span");
        tag.className = "bot";
        tag.textContent = "bot";
        e.label.replaceChildren(document.createTextNode(who.handle ? `@${who.handle}` : ""), ...(who.bot ? [tag] : []));
      }
      for (const did of [...live.keys()]) if (!keep.has(did)) drop(did);
    },
    /** Place everyone for this frame. world: the current world (frame + terrain); camera, for labels. */
    update(t, dt, nowS, world, camera, canvas) {
      const r = canvas.getBoundingClientRect();
      for (const e of live.values()) {
        const w = whereAt(e.who.intent, nowS), p = world.frame.toLocal(w.lat, w.lon);
        const far = Math.hypot(p.x, p.z) > WORLD_M;
        e.body.group.visible = !far;
        e.where = w;
        if (far) { e.label.hidden = true; e.bubble.hidden = true; e.pos = null; continue; }
        const g = Math.max(0, world.terrain.heightAt(p.x, p.z));
        const y = w.mode === "ride" ? highwayAltitude(world.terrain.heightAt(p.x, p.z)) : Math.max(g, w.alt ?? g);
        tmp.set(p.x, y, p.z);
        if (!e.pos || e.pos.distanceTo(tmp) > 2000) e.pos = tmp.clone(); // first sight, or a jump (a ride, a teleport)
        else e.pos.lerp(tmp, Math.min(1, dt * 3));
        e.body.group.position.copy(e.pos);
        const hop = t - e.hopAt;
        if (hop < 0.45) e.body.group.position.y += Math.sin((Math.PI * hop) / 0.45) * 3 * e.graph.scale;
        // Facing: compass bearing (0 = north = -z) to the creature's yaw.
        const yaw = -w.bearing;
        e.heading += Math.atan2(Math.sin(yaw - e.heading), Math.cos(yaw - e.heading)) * Math.min(1, dt * 4);
        e.body.group.rotation.y = e.heading;
        const onGround = y - g < 1 && w.mode !== "ride";
        e.body.update(t, { mode: onGround ? "ground" : "air", speed01: w.moving ? 0.7 : 0 });
        // The label: over its head, when near and in front of the camera.
        tmp.copy(e.pos).add({ x: 0, y: 7 * e.graph.scale, z: 0 });
        const d = camera.position.distanceTo(e.pos);
        tmp.project(camera);
        const show = d < LABEL_M && tmp.z < 1 && Math.abs(tmp.x) < 1.1 && Math.abs(tmp.y) < 1.1 && !!e.who.handle;
        e.label.hidden = !show;
        const at = `translate(${((tmp.x + 1) / 2) * r.width + r.left}px, ${((1 - tmp.y) / 2) * r.height + r.top}px)`;
        if (show) e.label.style.transform = `${at} translate(-50%, -100%)`;
        // A speech bubble over the name, while it's fresh.
        const say = e.who.intent.say, talking = show && fresh(say, nowS);
        e.bubble.hidden = !talking;
        if (talking) {
          if (e.bubble.textContent !== say.text) e.bubble.textContent = say.text;
          e.bubble.style.transform = `${at} translate(-50%, calc(-100% - 16px))`;
        }
      }
    },
    /** A mutual's creature hops (they squeaked). Returns where it is in this world, or null if it's not in view. */
    hop(did, t) {
      const e = live.get(did);
      if (!e || !e.pos || !e.body.group.visible) return null;
      e.hopAt = t;
      return { pos: e.pos.clone(), scale: e.graph.scale };
    },
    /** Mutuals within r metres of (x, z) in this world: [{ did, handle, x, y, z, entry }]. */
    near(x, z, r) {
      const out = [];
      for (const [did, e] of live) if (e.pos && e.body.group.visible && Math.hypot(e.pos.x - x, e.pos.z - z) < r) out.push({ did, handle: e.who.handle, x: e.pos.x, y: e.pos.y, z: e.pos.z, entry: e });
      return out;
    },
    /** Everyone and where they are now: [{ did, handle, lat, lon, kind, mode }], for the list and the globe. */
    everyone(nowS) {
      return [...live.values()].map((e) => { const w = whereAt(e.who.intent, nowS); return { did: e.who.did, handle: e.who.handle, lat: w.lat, lon: w.lon, kind: e.who.intent.kind, mode: w.mode, moving: w.moving }; });
    },
    get count() { return live.size; },
  };
}
