// L-systems: a string-rewriting grammar, then a 3D turtle that walks the
// string and leaves branches and bulbs behind. Pure and seeded, so the same
// grammar and seed grow the same shape on every device.
//
// Turtle symbols (after "The Algorithmic Beauty of Plants", Prusinkiewicz &
// Lindenmayer):
//   F  draw forward      f  move forward without drawing
//   +  yaw left          -  yaw right
//   &  pitch down        ^  pitch up
//   \  roll left         /  roll right        |  turn around
//   [  push state        ]  pop state
//   !  thinner           O  a bulb (an eye, a lantern)
// Anything else is a placeholder for rules and draws nothing.

/**
 * Rewrite `axiom` `iterations` times. rules: { X: "F[+X]" } or, for a
 * stochastic rule, { X: [["F[+X]", 2], ["FX", 1]] } (weighted). Stops growing
 * at maxLength symbols.
 */
export function expand(axiom, rules, iterations, rand, maxLength = 20000) {
  let s = axiom;
  for (let i = 0; i < iterations; i++) {
    let out = "";
    for (const ch of s) {
      const r = rules[ch];
      if (r === undefined) out += ch;
      else if (typeof r === "string") out += r;
      else {
        const total = r.reduce((t, [, w]) => t + w, 0);
        let x = rand() * total;
        let pick = r[r.length - 1][0];
        for (const [succ, w] of r) { if ((x -= w) < 0) { pick = succ; break; } }
        out += pick;
      }
      if (out.length > maxLength) return out.slice(0, maxLength);
    }
    s = out;
  }
  return s;
}

const rot = (v, axis, a) => {
  // Rodrigues' rotation of v about a unit axis by angle a.
  const c = Math.cos(a), s = Math.sin(a), d = v[0] * axis[0] + v[1] * axis[1] + v[2] * axis[2];
  const x = [axis[1] * v[2] - axis[2] * v[1], axis[2] * v[0] - axis[0] * v[2], axis[0] * v[1] - axis[1] * v[0]];
  return [0, 1, 2].map((i) => v[i] * c + x[i] * s + axis[i] * d * (1 - c));
};

/**
 * Walk the string. Returns { segments: [{ a, b, r0, r1, depth, branch }], bulbs:
 * [{ p, r, depth, branch }] } in turtle space (starts at the origin, heading +y).
 * opts: { angle (deg), length, lengthDecay, radius, radiusDecay, jitter (deg) }.
 * `branch` numbers each bracketed branch, so animation can phase them apart.
 */
export function turtle(str, opts, rand) {
  const { angle = 25, length = 1, lengthDecay = 0.8, radius = 0.1, radiusDecay = 0.75, jitter = 0 } = opts;
  const A = (angle * Math.PI) / 180, J = (jitter * Math.PI) / 180;
  const jit = () => (J ? (rand() * 2 - 1) * J : 0);
  let st = { p: [0, 0, 0], H: [0, 1, 0], L: [-1, 0, 0], U: [0, 0, 1], len: length, r: radius, depth: 0, branch: 0 };
  const stack = [];
  const segments = [], bulbs = [];
  let branches = 0;
  for (const ch of str) {
    switch (ch) {
      case "F": case "f": {
        const b = [st.p[0] + st.H[0] * st.len, st.p[1] + st.H[1] * st.len, st.p[2] + st.H[2] * st.len];
        if (ch === "F") segments.push({ a: st.p, b, r0: st.r, r1: st.r * 0.92, depth: st.depth, branch: st.branch });
        st = { ...st, p: b, r: ch === "F" ? st.r * 0.92 : st.r };
        break;
      }
      case "+": case "-": { const a = (ch === "+" ? A : -A) + jit(); st = { ...st, H: rot(st.H, st.U, a), L: rot(st.L, st.U, a) }; break; }
      case "&": case "^": { const a = (ch === "&" ? A : -A) + jit(); st = { ...st, H: rot(st.H, st.L, a), U: rot(st.U, st.L, a) }; break; }
      case "\\": case "/": { const a = (ch === "\\" ? A : -A) + jit(); st = { ...st, L: rot(st.L, st.H, a), U: rot(st.U, st.H, a) }; break; }
      case "|": st = { ...st, H: st.H.map((x) => -x), L: st.L.map((x) => -x) }; break;
      case "[": stack.push(st); st = { ...st, depth: st.depth + 1, len: st.len * lengthDecay, r: st.r * radiusDecay, branch: ++branches }; break;
      case "]": if (stack.length) st = stack.pop(); break;
      case "!": st = { ...st, r: st.r * 0.7 }; break;
      case "O": bulbs.push({ p: st.p, r: st.r * 2.6 + st.len * 0.18, depth: st.depth, branch: st.branch }); break;
      default: break;
    }
  }
  return { segments, bulbs };
}
