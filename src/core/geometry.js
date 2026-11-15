/**
 * Landing-site sky geometry: where are the Sun and Earth seen from a point on the Moon?
 * Pure functions (no DOM). All angles in degrees unless noted. Azimuth: 0 = North, 90 = East.
 */
export const R_MOON_KM = 1737.4;
const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const SUN_RADIUS_KM = 695700;
const AU_KM = 149597870.7;
export const EARTH_RADIUS_KM = 6371;

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Local frame (up, east, north) in the Moon body-fixed frame for a planetocentric lat/lon. */
export function siteBasis(latDeg, lonDeg) {
  const p = latDeg * RAD;
  const l = lonDeg * RAD;
  return {
    up: [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)],
    east: [-Math.sin(l), Math.cos(l), 0],
    north: [-Math.sin(p) * Math.cos(l), -Math.sin(p) * Math.sin(l), Math.cos(p)]
  };
}

/**
 * Sun & Earth position seen from a site at one instant.
 * @param {Ephemeris} eph
 * @param {number} tMs   UTC epoch ms
 * @param {{lat:number, lon:number, elevM?:number, basis?:object}} site
 */
export function skyAt(eph, tMs, site) {
  const basis = site.basis || (site.basis = siteBasis(site.lat, site.lon));
  const r = R_MOON_KM + (site.elevM || 0) / 1000;
  const pos = [basis.up[0] * r, basis.up[1] * r, basis.up[2] * r];
  const s = eph.sample(tMs);
  const body = (o) => {
    const v = [s[o] - pos[0], s[o + 1] - pos[1], s[o + 2] - pos[2]];
    const dist = Math.hypot(v[0], v[1], v[2]);
    const u = [v[0] / dist, v[1] / dist, v[2] / dist];
    const el = Math.asin(Math.max(-1, Math.min(1, dot(u, basis.up)))) * DEG;
    let az = Math.atan2(dot(u, basis.east), dot(u, basis.north)) * DEG;
    if (az < 0) az += 360;
    return { el, az, distKm: dist };
  };
  const sun = body(0);
  const earth = body(3);
  sun.radiusDeg = Math.asin(SUN_RADIUS_KM / sun.distKm) * DEG;
  earth.radiusDeg = Math.asin(EARTH_RADIUS_KM / earth.distKm) * DEG;
  return { sun, earth };
}

/** Terrain horizon elevation (deg) at an azimuth, linear interpolation over a 360-value profile. Flat/spherical if absent. */
export function horizonAt(profile, az) {
  if (!profile) return 0;
  const n = profile.length;
  const f = ((az % 360) + 360) % 360 / (360 / n);
  const i = Math.floor(f) % n;
  const w = f - Math.floor(f);
  return profile[i] * (1 - w) + profile[(i + 1) % n] * w;
}

/**
 * Time series of Sun/Earth over [t0, t1] at stepMin resolution.
 * Sun counts as "up" when its upper limb clears the terrain horizon (any part of the disc visible);
 * Earth counts as "up" when the disc centre clears the horizon (antenna line of sight).
 */
export function buildSeries(eph, site, horizon, t0Ms, t1Ms, stepMin = 10) {
  const stepMs = stepMin * 60000;
  const n = Math.max(2, Math.floor((t1Ms - t0Ms) / stepMs) + 1);
  const S = {
    t0Ms, stepMs, n,
    sunEl: new Float32Array(n), sunAz: new Float32Array(n), sunHz: new Float32Array(n),
    earthEl: new Float32Array(n), earthAz: new Float32Array(n), earthHz: new Float32Array(n),
    sunDist: new Float32Array(n),
    sunUp: new Uint8Array(n), earthUp: new Uint8Array(n)
  };
  for (let i = 0; i < n; i++) {
    const { sun, earth } = skyAt(eph, t0Ms + i * stepMs, site);
    const sh = horizonAt(horizon, sun.az);
    const eh = horizonAt(horizon, earth.az);
    S.sunEl[i] = sun.el; S.sunAz[i] = sun.az; S.sunHz[i] = sh; S.sunDist[i] = sun.distKm;
    S.earthEl[i] = earth.el; S.earthAz[i] = earth.az; S.earthHz[i] = eh;
    S.sunUp[i] = sun.el + sun.radiusDeg > sh ? 1 : 0;
    S.earthUp[i] = earth.el > eh ? 1 : 0;
  }
  return S;
}

/** Contiguous runs of a boolean series: [{up, i0, i1}] (i1 exclusive). */
export function runs(flags) {
  const out = [];
  let start = 0;
  for (let i = 1; i <= flags.length; i++) {
    if (i === flags.length || flags[i] !== flags[start]) {
      out.push({ up: flags[start] === 1, i0: start, i1: i });
      start = i;
    }
  }
  return out;
}

/** Hours until the next change of state starting at index i (null if no change inside the series). */
export function timeToChange(S, flags, i) {
  for (let k = i + 1; k < S.n; k++) {
    if (flags[k] !== flags[i]) return ((k - i) * S.stepMs) / 3.6e6;
  }
  return null;
}

/**
 * Power & communication metrics over the whole series.
 * Solar power index: mean over time of the irradiance on (a) a horizontal panel, sin(el),
 * and (b) a vertical panel that follows the Sun in azimuth, cos(el); both x (1 AU / distance)^2.
 */
export function computeMetrics(S) {
  const hours = (n) => (n * S.stepMs) / 3.6e6;
  let sunUp = 0, earthUp = 0, both = 0, hSum = 0, vSum = 0, elSum = 0, maxEl = -90;
  for (let i = 0; i < S.n; i++) {
    if (S.sunUp[i]) {
      sunUp++;
      const k = (AU_KM / S.sunDist[i]) ** 2;
      const e = S.sunEl[i] * RAD;
      hSum += Math.max(0, Math.sin(e)) * k;
      vSum += Math.max(0, Math.cos(e)) * k;
      elSum += S.sunEl[i];
    }
    if (S.earthUp[i]) earthUp++;
    if (S.sunUp[i] && S.earthUp[i]) both++;
    if (S.sunEl[i] > maxEl) maxEl = S.sunEl[i];
  }
  const longest = (flags, wantUp) => {
    let best = 0;
    for (const r of runs(flags)) if (r.up === wantUp) best = Math.max(best, r.i1 - r.i0);
    return hours(best);
  };
  return {
    windowHours: hours(S.n),
    sunlitPct: (100 * sunUp) / S.n,
    earthPct: (100 * earthUp) / S.n,
    bothPct: (100 * both) / S.n,
    longestSunH: longest(S.sunUp, true),
    longestDarkH: longest(S.sunUp, false),
    longestEarthH: longest(S.earthUp, true),
    longestEarthOutageH: longest(S.earthUp, false),
    meanSunElWhenLit: sunUp ? elSum / sunUp : 0,
    maxSunEl: maxEl,
    horizontalPowerIdx: hSum / S.n,
    verticalPowerIdx: vSum / S.n
  };
}

export const DEFAULT_THRESHOLDS = {
  minSunlitPct: 60,      // green above this
  okSunlitPct: 35,       // yellow above this
  maxDarkH: 72,          // green below this
  okDarkH: 200,          // yellow below this
  minEarthPct: 60,
  okEarthPct: 30,
  maxOutageH: 72,
  okOutageH: 200
};

/** Traffic-light assessment: each category 'green' | 'yellow' | 'red'. */
export function assess(m, th = DEFAULT_THRESHOLDS) {
  const power = m.sunlitPct >= th.minSunlitPct && m.longestDarkH <= th.maxDarkH ? "green"
    : m.sunlitPct >= th.okSunlitPct && m.longestDarkH <= th.okDarkH ? "yellow" : "red";
  const comms = m.earthPct >= th.minEarthPct && m.longestEarthOutageH <= th.maxOutageH ? "green"
    : m.earthPct >= th.okEarthPct && m.longestEarthOutageH <= th.okOutageH ? "yellow" : "red";
  const rank = { green: 0, yellow: 1, red: 2 };
  const overall = rank[power] >= rank[comms] ? power : comms;
  return { power, comms, overall };
}
