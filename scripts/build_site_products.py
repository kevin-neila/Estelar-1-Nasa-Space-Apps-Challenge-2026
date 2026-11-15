#!/usr/bin/env python3
"""
Turns the raw LOLA windows (scripts/fetch_lola.py) + the ephemeris
(scripts/build_ephemeris.py) into the per-site files the browser loads.

For each site writes public/data/sites/<id>.json with:

  horizon_deg       360 values: elevation (deg) of the terrain horizon seen from the
                    landing point for azimuth 0..359 (0 = North, 90 = East).
                    Computed on the real LOLA DEM with lunar curvature included.
  pathfinder grid   167 x 167 cells, 240 m each (~40.08 km square) centred on the site:
                    elevation, slope, fraction of time the cell is sunlit and
                    fraction of time the Earth is visible (2026-2030, DE421).
  provenance        which LOLA product was used and its native resolution.

Nothing here is synthetic: terrain = LOLA, Sun/Earth = JPL DE421.
"""
import json
import math
import os
import sys

import numpy as np

ROOT = os.path.join(os.path.dirname(__file__), "..")
DEM_DIR = os.path.join(ROOT, "scripts", "cache", "dem")
DATA = os.path.join(ROOT, "public", "data")
OUT = os.path.join(DATA, "sites")

R_M = 1737400.0
GRID_N = 1000
CELL_M = 60.0
PF_N = 167
PF_STEP = 4
PF_CELL_M = CELL_M * PF_STEP
AZ_BINS = 72
RAY_KM = 30.0
SUN_RADIUS_DEG = 0.267


def sample_nearest(dem, fy, fx):
    iy = np.rint(fy).astype(np.int32)
    ix = np.rint(fx).astype(np.int32)
    ok = (iy >= 0) & (iy < GRID_N) & (ix >= 0) & (ix < GRID_N)
    iy = np.clip(iy, 0, GRID_N - 1)
    ix = np.clip(ix, 0, GRID_N - 1)
    return dem[iy, ix], ok


def horizon_angles(dem, rows, cols, az_deg, step_m, max_m):
    """Max terrain elevation angle (deg) per observer and azimuth, on a spherical Moon.
    tan(el) = ((R+h)cos(t) - (R+h0)) / ((R+h) sin(t)),  t = d / R."""
    d = np.arange(1, int(max_m / step_m) + 1) * step_m
    t = d / R_M
    cos_t, sin_t = np.cos(t), np.sin(t)
    az = np.radians(az_deg)
    s_az, c_az = np.sin(az), np.cos(az)
    h0 = dem[rows, cols].astype(np.float64)
    best = np.full((len(rows), len(az)), -90.0)
    for a in range(len(az)):
        fy = rows[:, None] - (d[None, :] * c_az[a]) / CELL_M
        fx = cols[:, None] + (d[None, :] * s_az[a]) / CELL_M
        h, ok = sample_nearest(dem, fy, fx)
        h = h.astype(np.float64)
        num = (R_M + h) * cos_t[None, :] - (R_M + h0[:, None])
        den = (R_M + h) * sin_t[None, :]
        ang = np.degrees(np.arctan2(num, den))
        ang = np.where(ok, ang, -90.0)
        best[:, a] = ang.max(axis=1)
    return best


def site_vectors(lat_deg, lon_deg):
    phi, lam = math.radians(lat_deg), math.radians(lon_deg)
    n = np.array([math.cos(phi) * math.cos(lam), math.cos(phi) * math.sin(lam), math.sin(phi)])
    e = np.array([-math.sin(lam), math.cos(lam), 0.0])
    north = np.array([-math.sin(phi) * math.cos(lam), -math.sin(phi) * math.sin(lam), math.cos(phi)])
    return n, e, north


def sky_series(eph, lat_deg, lon_deg, h_m, stride):
    n, e, north = site_vectors(lat_deg, lon_deg)
    pos = n * (R_M + h_m) / 1000.0
    out = []
    for k in (0, 3):
        v = eph[::stride, k:k + 3].astype(np.float64) - pos[None, :]
        u = v / np.linalg.norm(v, axis=1)[:, None]
        el = np.degrees(np.arcsin(np.clip(u @ n, -1, 1)))
        az = np.degrees(np.arctan2(u @ e, u @ north)) % 360.0
        out.append((el, az))
    return out


def process(site, eph):
    sid = site["id"]
    dem = np.load(os.path.join(DEM_DIR, f"{sid}.npy")).astype(np.float64)
    meta = json.load(open(os.path.join(DEM_DIR, f"{sid}.json"), encoding="utf-8"))
    c = GRID_N // 2
    h_site = float(dem[c, c])
    print(f"[{sid}] site elevation {h_site:.0f} m, source {meta['source']}")

    hz = horizon_angles(dem, np.array([c]), np.array([c]), np.arange(360.0), CELL_M, RAY_KM * 1000.0)[0]

    start = c - (PF_N * PF_STEP) // 2
    idx = start + np.arange(PF_N) * PF_STEP
    rr, cc = np.meshgrid(idx, idx, indexing="ij")
    rr, cc = rr.ravel(), cc.ravel()
    az72 = np.arange(AZ_BINS) * (360.0 / AZ_BINS)
    hz72 = np.empty((len(rr), AZ_BINS), dtype=np.float32)
    for s in range(0, len(rr), 400):
        hz72[s:s + 400] = horizon_angles(dem, rr[s:s + 400], cc[s:s + 400], az72, PF_CELL_M, RAY_KM * 1000.0)

    (sun_el, sun_az), (ea_el, ea_az) = sky_series(eph, site["lat"], site["lon"], h_site, stride=3)
    sun_bin = np.rint(sun_az / (360.0 / AZ_BINS)).astype(int) % AZ_BINS
    ea_bin = np.rint(ea_az / (360.0 / AZ_BINS)).astype(int) % AZ_BINS
    sunlit = np.empty(len(rr), dtype=np.float32)
    earthv = np.empty(len(rr), dtype=np.float32)
    for s in range(0, len(rr), 800):
        block = hz72[s:s + 800]
        sunlit[s:s + 800] = ((sun_el[None, :] + SUN_RADIUS_DEG) > block[:, sun_bin]).mean(axis=1)
        earthv[s:s + 800] = (ea_el[None, :] > block[:, ea_bin]).mean(axis=1)

    gy, gx = np.gradient(dem, CELL_M)
    slope = np.degrees(np.arctan(np.hypot(gx, gy)))[rr, cc]
    elev = dem[rr, cc]

    payload = {
        "metadata": {
            "id": sid, "name": site["name"], "lat": site["lat"], "lon": site["lon"],
            "grid_size": PF_N, "cell_size_m": PF_CELL_M,
            "domain_km": PF_N * PF_CELL_M / 1000.0,
            "site_elevation_m": round(h_site, 1),
            "terrain_source": meta["source"],
            "native_resolution_m": meta.get("polar_native_m") or meta.get("global_native_m"),
            "illumination_period": "2026-2030, sampled every 3 h",
            "datasets": [
                "NASA LRO LOLA LDEM_80S_20M (PDS Geosciences Node)",
                "NASA LRO LOLA LDEM_128 (PDS Geosciences Node)",
                "JPL DE421 + NAIF lunar orientation kernels (via Skyfield)",
            ],
        },
        "horizon_deg": [round(float(x), 2) for x in hz],
        "elevation_m": [round(float(x), 1) for x in elev],
        "slope_deg": [round(float(x), 1) for x in slope],
        "illumination_frac": [round(float(x), 3) for x in sunlit],
        "earth_visible_frac": [round(float(x), 3) for x in earthv],
    }
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, f"{sid}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, separators=(",", ":"))
    print(f"    horizon max {hz.max():.2f} deg | mean sunlit {sunlit.mean():.3f} | "
          f"mean earth {earthv.mean():.3f} | {os.path.getsize(path) / 1024:.0f} KB")


def main():
    eph = np.fromfile(os.path.join(DATA, "ephemeris.bin"), dtype="<f4").reshape(-1, 6)
    sites = json.load(open(os.path.join(DATA, "sites.json"), encoding="utf-8"))["sites"]
    wanted = set(sys.argv[1:])
    for s in sites:
        if wanted and s["id"] not in wanted:
            continue
        if not os.path.exists(os.path.join(DEM_DIR, f"{s['id']}.npy")):
            print(f"[{s['id']}] no DEM cached, skipping (run fetch_lola.py)")
            continue
        process(s, eph)


if __name__ == "__main__":
    main()
