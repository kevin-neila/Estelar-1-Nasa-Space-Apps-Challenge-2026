#!/usr/bin/env python3
"""
Builds the precomputed Sun/Earth ephemeris used by the browser.

What it does
------------
Uses JPL's DE421 planetary ephemeris plus the lunar orientation kernel
(moon_pa_de421_1900-2050.bpc, which includes libration) through Skyfield, and
writes the position of the Sun and of the Earth *relative to the Moon's centre*,
expressed in the Moon's MEAN-EARTH / POLAR-AXIS body-fixed frame ("MOON_ME_DE421").

That is exactly the frame in which NASA's LOLA elevation maps are published, so
a (lat, lon) on the LOLA map and the vectors written here share the same axes.

Output
------
public/data/ephemeris.bin   Float32 little-endian, shape [N, 6]:
                            sun_x, sun_y, sun_z, earth_x, earth_y, earth_z   (km)
public/data/ephemeris.json  metadata (start time, step, count, sources)

Usage:  python scripts/build_ephemeris.py [start_year] [end_year] [step_minutes]
"""
import json
import os
import sys
from datetime import datetime, timezone

import numpy as np
from skyfield.api import Loader
from skyfield.planetarylib import PlanetaryConstants

ROOT = os.path.join(os.path.dirname(__file__), "..")
CACHE = os.path.join(ROOT, "scripts", "cache", "spice")
OUT = os.path.join(ROOT, "public", "data")


def main():
    y0 = int(sys.argv[1]) if len(sys.argv) > 1 else 2026
    y1 = int(sys.argv[2]) if len(sys.argv) > 2 else 2030
    step_min = int(sys.argv[3]) if len(sys.argv) > 3 else 60

    os.makedirs(CACHE, exist_ok=True)
    os.makedirs(OUT, exist_ok=True)
    load = Loader(CACHE)
    ts = load.timescale()
    eph = load("de421.bsp")

    pc = PlanetaryConstants()
    pc.read_text(load("moon_080317.tf"))
    pc.read_text(load("pck00008.tpc"))
    pc.read_binary(load("moon_pa_de421_1900-2050.bpc"))
    frame = pc.build_frame_named("MOON_ME_DE421")

    start = datetime(y0, 1, 1, tzinfo=timezone.utc)
    end = datetime(y1 + 1, 1, 1, tzinfo=timezone.utc)
    n = int((end - start).total_seconds() // (step_min * 60))
    minutes = np.arange(n) * step_min
    t = ts.utc(y0, 1, 1, 0, minutes)

    moon, sun, earth = eph["moon"], eph["sun"], eph["earth"]
    obs = moon.at(t)
    sun_xyz = obs.observe(sun).frame_xyz(frame).km      # (3, N)  light-time corrected
    earth_xyz = obs.observe(earth).frame_xyz(frame).km  # (3, N)

    arr = np.concatenate([sun_xyz, earth_xyz], axis=0).T.astype("<f4")  # (N, 6)
    arr.tofile(os.path.join(OUT, "ephemeris.bin"))

    meta = {
        "frame": "MOON_ME_DE421 (Mean-Earth / polar-axis, includes physical libration)",
        "origin": "Moon centre",
        "start_utc": start.isoformat().replace("+00:00", "Z"),
        "step_seconds": step_min * 60,
        "count": int(n),
        "columns": ["sun_x_km", "sun_y_km", "sun_z_km", "earth_x_km", "earth_y_km", "earth_z_km"],
        "dtype": "float32-le",
        "moon_radius_km": 1737.4,
        "sources": [
            "JPL DE421 planetary ephemeris (de421.bsp)",
            "NAIF lunar orientation kernel moon_pa_de421_1900-2050.bpc + moon_080317.tf",
            "Computed with Skyfield (light-time corrected, no aberration, no refraction)",
        ],
    }
    with open(os.path.join(OUT, "ephemeris.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)
    print(f"[OK] {n} samples, {arr.nbytes/1024:.0f} KB -> public/data/ephemeris.bin")
    print("     sample 0 sun km:", arr[0, :3], " earth km:", arr[0, 3:])


if __name__ == "__main__":
    main()
