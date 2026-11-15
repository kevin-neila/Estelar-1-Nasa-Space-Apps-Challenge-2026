#!/usr/bin/env python3
"""
Downloads REAL NASA LOLA terrain around every CLPS site (no synthetic terrain).

Sources (NASA PDS Geosciences Node, Lunar Orbiter Laser Altimeter GDR):
  * LDEM_80S_20M_FLOAT  - polar stereographic, 20 m/pixel, 80S..90S   (south-pole sites)
  * LDEM_128_FLOAT      - global cylindrical, 128 px/deg (~237 m/px)  (all other sites)

The files are 3.7 GB and 4.2 GB, so we never download them whole: the PDS server
supports HTTP Range requests and we only read the rows around each site.

For every site we resample the terrain to a local tangent-plane grid
(east/north metres from the site, 60 m cells, 60 x 60 km) and store heights in
metres relative to the 1737.4 km reference sphere, which is what LOLA uses.

Output: scripts/cache/dem/<site_id>.npy  (float32, [1000,1000], row 0 = north)
        scripts/cache/dem/<site_id>.json (grid metadata)

Usage:  python scripts/fetch_lola.py [site_id ...]
"""
import json
import math
import os
import sys
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import requests

ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT = os.path.join(ROOT, "scripts", "cache", "dem")
SITES = os.path.join(ROOT, "public", "data", "sites.json")

BASE = "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/"
POLAR_URL = BASE + "polar/float_img/ldem_80s_20m_float.img"
GLOBAL_URL = BASE + "cylindrical/float_img/ldem_128_float.img"

R_M = 1737400.0
GRID_N = 1000
CELL_M = 60.0
HALF_M = GRID_N * CELL_M / 2.0

POLAR_N = 30400          # pixels per side
POLAR_RES_M = 20.0
POLAR_CENTER = 15199.5   # 0-based index of the pole
POLAR_STEP = 3           # read every 3rd row/col -> 60 m, matches our grid
GLOBAL_COLS = 46080
GLOBAL_ROWS = 23040
GLOBAL_PPD = 128.0

session = requests.Session()


def range_get(url, start, length, tries=5):
    for k in range(tries):
        try:
            r = session.get(url, headers={"Range": f"bytes={start}-{start + length - 1}"}, timeout=60)
            if r.status_code in (200, 206) and len(r.content) == length:
                return r.content
        except requests.RequestException:
            pass
    raise RuntimeError(f"range request failed {url} {start}+{length}")


def local_latlon(lat0_deg, lon0_deg):
    """lat/lon (radians) of every cell of the local grid (azimuthal-equidistant inverse)."""
    phi0 = math.radians(lat0_deg)
    lam0 = math.radians(lon0_deg)
    idx = (np.arange(GRID_N) + 0.5) * CELL_M - HALF_M
    e = idx[None, :] * np.ones((GRID_N, 1))          # east  (columns)
    n = -idx[:, None] * np.ones((1, GRID_N))         # north (row 0 is north)
    x, y = e / R_M, n / R_M
    c = np.hypot(x, y)
    c_safe = np.where(c == 0, 1e-12, c)
    lat = np.arcsin(np.cos(c) * math.sin(phi0) + y * np.sin(c) * math.cos(phi0) / c_safe)
    lon = lam0 + np.arctan2(x * np.sin(c), c_safe * math.cos(phi0) * np.cos(c) - y * math.sin(phi0) * np.sin(c))
    return lat, np.mod(lon, 2 * math.pi)


def bilinear(arr, fy, fx):
    """Bilinear sample with NaN outside the array."""
    h, w = arr.shape
    out = np.full(fy.shape, np.nan, dtype=np.float32)
    ok = (fy >= 0) & (fy <= h - 1) & (fx >= 0) & (fx <= w - 1)
    y0 = np.clip(np.floor(fy[ok]).astype(int), 0, h - 2)
    x0 = np.clip(np.floor(fx[ok]).astype(int), 0, w - 2)
    ty = fy[ok] - y0
    tx = fx[ok] - x0
    v = (arr[y0, x0] * (1 - ty) * (1 - tx) + arr[y0, x0 + 1] * (1 - ty) * tx
         + arr[y0 + 1, x0] * ty * (1 - tx) + arr[y0 + 1, x0 + 1] * ty * tx)
    out[ok] = v
    return out


# ----------------------------------------------------------------------------- polar
def polar_pixel(lat, lon):
    colat = lat + math.pi / 2.0
    rho = 2.0 * R_M * np.tan(colat / 2.0)
    x = rho * np.sin(lon)
    y = rho * np.cos(lon)
    col = POLAR_CENTER + x / POLAR_RES_M
    row = POLAR_CENTER - y / POLAR_RES_M
    return row, col


def sample_polar(lat, lon):
    mask = lat <= math.radians(-80.0)
    out = np.full(lat.shape, np.nan, dtype=np.float32)
    if not mask.any():
        return out
    row, col = polar_pixel(lat[mask], lon[mask])
    r0 = int(max(0, math.floor(row.min()) - 2 * POLAR_STEP))
    r1 = int(min(POLAR_N - 1, math.ceil(row.max()) + 2 * POLAR_STEP))
    c0 = int(max(0, math.floor(col.min()) - 2 * POLAR_STEP))
    c1 = int(min(POLAR_N - 1, math.ceil(col.max()) + 2 * POLAR_STEP))
    rows = list(range(r0, r1 + 1, POLAR_STEP))
    ncols = c1 - c0 + 1
    print(f"    polar: reading {len(rows)} rows x {ncols} px")

    def read_row(r):
        buf = range_get(POLAR_URL, (r * POLAR_N + c0) * 4, ncols * 4)
        return np.frombuffer(buf, dtype="<f4")[::POLAR_STEP]

    with ThreadPoolExecutor(max_workers=12) as ex:
        data = np.stack(list(ex.map(read_row, rows)))
    data = data * 1000.0  # km -> m
    fy = (row - r0) / POLAR_STEP
    fx = (col - c0) / POLAR_STEP
    out[mask] = bilinear(data, fy, fx)
    return out


# ---------------------------------------------------------------------------- global
def sample_global(lat, lon):
    latd = np.degrees(lat)
    lond = np.degrees(lon)
    row = (90.0 - latd) * GLOBAL_PPD - 0.5
    col = lond * GLOBAL_PPD - 0.5
    r0 = int(max(0, math.floor(row.min()) - 2))
    r1 = int(min(GLOBAL_ROWS - 1, math.ceil(row.max()) + 2))
    # unwrap columns around the median to handle the 0/360 seam
    ref = np.median(col)
    colu = np.where(col - ref > GLOBAL_COLS / 2, col - GLOBAL_COLS, np.where(col - ref < -GLOBAL_COLS / 2, col + GLOBAL_COLS, col))
    c0 = int(math.floor(colu.min()) - 2)
    c1 = int(math.ceil(colu.max()) + 2)
    ncols = c1 - c0 + 1
    rows = list(range(r0, r1 + 1))
    print(f"    global: reading {len(rows)} rows x {ncols} px")

    def read_row(r):
        cols = np.arange(c0, c1 + 1) % GLOBAL_COLS
        # contiguous segments (at most two)
        splits = np.where(np.diff(cols) != 1)[0] + 1
        parts = []
        for seg in np.split(cols, splits):
            buf = range_get(GLOBAL_URL, (r * GLOBAL_COLS + int(seg[0])) * 4, len(seg) * 4)
            parts.append(np.frombuffer(buf, dtype="<f4"))
        return np.concatenate(parts)

    with ThreadPoolExecutor(max_workers=12) as ex:
        data = np.stack(list(ex.map(read_row, rows)))
    data = data * 1000.0
    return bilinear(data, row - r0, colu - c0)


def fetch_site(site):
    sid = site["id"]
    print(f"[{sid}] {site['name']}  lat={site['lat']} lon={site['lon']}")
    lat, lon = local_latlon(site["lat"], site["lon"] % 360.0)
    dem = np.full(lat.shape, np.nan, dtype=np.float32)
    src = "global"
    if site["lat"] <= -78.0:
        dem = sample_polar(lat, lon)
        src = "polar20m"
    missing = np.isnan(dem)
    if missing.any():
        print(f"    filling {missing.mean() * 100:.1f}% of cells from LDEM_128")
        g = sample_global(lat[missing], lon[missing])
        # sample_global expects arrays; keep shape
        dem[missing] = g
        src = src + "+global128" if src != "global" else "global128"
    still = np.isnan(dem)
    if still.any():
        dem[still] = np.nanmean(dem)
    os.makedirs(OUT, exist_ok=True)
    np.save(os.path.join(OUT, f"{sid}.npy"), dem.astype(np.float32))
    meta = {
        "id": sid, "grid": GRID_N, "cell_m": CELL_M, "source": src,
        "polar_native_m": POLAR_RES_M if "polar" in src else None,
        "global_native_m": 237.0 if "global" in src else None,
        "unfilled_fraction": float(still.mean()),
        "min_m": float(dem.min()), "max_m": float(dem.max()),
    }
    with open(os.path.join(OUT, f"{sid}.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)
    print(f"    OK  elevation {dem.min():.0f} .. {dem.max():.0f} m  ({src})")


def main():
    sites = json.load(open(SITES, encoding="utf-8"))["sites"]
    wanted = set(sys.argv[1:])
    for s in sites:
        if wanted and s["id"] not in wanted:
            continue
        fetch_site(s)


if __name__ == "__main__":
    main()
