#!/usr/bin/env python3
"""
Builds the globe texture from REAL NASA LOLA topography (LDEM_16, 16 px/deg).
Hillshaded relief + subtle hypsometric tint. No imagery is invented: every pixel is derived from
the LOLA elevation grid. Output: public/textures/moon_lola_2k.jpg and moon_lola_4k.jpg
(equirectangular, longitude 0..360 east from left to right, north up).
"""
import os

import numpy as np
import requests
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), "..")
CACHE = os.path.join(ROOT, "scripts", "cache")
OUT = os.path.join(ROOT, "public", "textures")
URL = ("https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/"
       "cylindrical/float_img/ldem_16_float.img")
COLS, ROWS = 5760, 2880
R = 1737400.0


def main():
    os.makedirs(CACHE, exist_ok=True)
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(CACHE, "ldem_16_float.img")
    need = COLS * ROWS * 4
    if not os.path.exists(path) or os.path.getsize(path) != need:
        print("downloading LDEM_16 (66 MB) ...")
        with requests.get(URL, stream=True, timeout=120) as r:
            r.raise_for_status()
            with open(path, "wb") as f:
                for chunk in r.iter_content(1 << 20):
                    f.write(chunk)
    h = np.fromfile(path, dtype="<f4").reshape(ROWS, COLS).astype(np.float64) * 1000.0  # metres

    lat = np.radians(90.0 - (np.arange(ROWS) + 0.5) / 16.0)
    dy = np.pi * R / ROWS
    dx = (2 * np.pi * R / COLS) * np.maximum(np.cos(lat), 0.02)[:, None]
    gy, gx = np.gradient(h)
    ex = 3.0  # vertical exaggeration for readability
    dzdx = ex * gx / dx
    dzdy = ex * -gy / dy          # row index grows southwards
    az, alt = np.radians(300.0), np.radians(38.0)   # light from the upper-left
    nx, ny, nz = -dzdx, -dzdy, np.ones_like(h)
    norm = np.sqrt(nx * nx + ny * ny + nz * nz)
    lx, ly, lz = np.sin(az) * np.cos(alt), np.cos(az) * np.cos(alt), np.sin(alt)
    shade = np.clip((nx * lx + ny * ly + nz * lz) / norm, 0, 1)
    shade = (shade - np.percentile(shade, 1)) / (np.percentile(shade, 99.5) - np.percentile(shade, 1))
    shade = np.clip(shade, 0, 1) ** 0.9

    t = np.clip((h + 7000.0) / 12000.0, 0, 1)      # -7 km .. +5 km
    low = np.array([0.50, 0.55, 0.62])             # cold blue-grey lowlands
    high = np.array([0.95, 0.90, 0.78])            # pale highlands
    tint = low[None, None, :] * (1 - t[..., None]) + high[None, None, :] * t[..., None]
    img = np.clip(tint * (0.30 + 0.80 * shade[..., None]), 0, 1)
    full = Image.fromarray((img * 255).astype(np.uint8), "RGB")
    full.resize((4096, 2048), Image.LANCZOS).save(os.path.join(OUT, "moon_lola_4k.jpg"), quality=86, optimize=True)
    full.resize((2048, 1024), Image.LANCZOS).save(os.path.join(OUT, "moon_lola_2k.jpg"), quality=86, optimize=True)
    # grayscale height map for bump mapping
    hm = np.clip((h + 9000.0) / 17000.0, 0, 1)
    Image.fromarray((hm * 255).astype(np.uint8), "L").resize((2048, 1024), Image.LANCZOS).save(
        os.path.join(OUT, "moon_lola_height_2k.png"), optimize=True)
    print("[OK] textures written to public/textures")


if __name__ == "__main__":
    main()
