/**
 * Ephemeris loader: Sun & Earth positions relative to the Moon centre, in the Moon's
 * Mean-Earth/polar-axis body-fixed frame (same frame as NASA LOLA maps).
 * Data is produced by scripts/build_ephemeris.py (JPL DE421 + NAIF lunar orientation, libration included).
 * Pure module: no DOM, so it also runs under Node for validation.
 */
export class Ephemeris {
  /** @param {object} meta  ephemeris.json   @param {ArrayBuffer} buf  ephemeris.bin */
  constructor(meta, buf) {
    this.meta = meta;
    this.data = new Float32Array(buf);
    this.startMs = Date.parse(meta.start_utc);
    this.stepMs = meta.step_seconds * 1000;
    this.count = meta.count;
    this.endMs = this.startMs + (this.count - 1) * this.stepMs;
  }

  static async load(base = "/data/") {
    const [meta, buf] = await Promise.all([
      fetch(`${base}ephemeris.json`).then((r) => r.json()),
      fetch(`${base}ephemeris.bin`).then((r) => r.arrayBuffer())
    ]);
    return new Ephemeris(meta, buf);
  }

  inRange(tMs) {
    return tMs >= this.startMs && tMs <= this.endMs;
  }

  clamp(tMs) {
    return Math.min(this.endMs, Math.max(this.startMs, tMs));
  }

  /** Linear interpolation (Moon rotates ~0.55 deg/h, so hourly samples give < 0.001 deg error). */
  sample(tMs, out = new Float64Array(6)) {
    const f = (this.clamp(tMs) - this.startMs) / this.stepMs;
    const i = Math.min(this.count - 2, Math.floor(f));
    const w = f - i;
    const a = i * 6;
    const b = a + 6;
    for (let k = 0; k < 6; k++) out[k] = this.data[a + k] * (1 - w) + this.data[b + k] * w;
    return out;
  }
}
