"""Sanity check: polar-stereographic orientation vs the independent global LDEM_128 product."""
import os, sys, json
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
import fetch_lola as f

sid = sys.argv[1] if len(sys.argv) > 1 else "im2"
site = [s for s in json.load(open(f.SITES, encoding="utf-8"))["sites"] if s["id"] == sid][0]
dem = np.load(os.path.join(f.OUT, f"{sid}.npy"))
lat, lon = f.local_latlon(site["lat"], site["lon"] % 360.0)
sub = (slice(None, None, 10), slice(None, None, 10))
g = f.sample_global(lat[sub], lon[sub])
p = dem[sub]
ok = ~np.isnan(g)
print("pixels", ok.sum(), "corr", np.corrcoef(g[ok], p[ok])[0, 1], "mean abs diff m", np.abs(g[ok] - p[ok]).mean())
