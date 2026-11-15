#!/usr/bin/env python3
import os
import sys
import requests
import build_moon_texture as bmt

URL = bmt.URL
IMG_PATH = os.path.join(bmt.CACHE, "ldem_16_float.img")
TOTAL_BYTES = bmt.COLS * bmt.ROWS * 4  # 66,355,200 bytes
CHUNK_SIZE = 1024 * 1024               # 1 MB chunk

def main():
    os.makedirs(bmt.CACHE, exist_ok=True)
    current_size = os.path.getsize(IMG_PATH) if os.path.exists(IMG_PATH) else 0

    if current_size < TOTAL_BYTES:
        print(f"Resuming download from byte {current_size:,} / {TOTAL_BYTES:,}...", flush=True)
        sess = requests.Session()
        with open(IMG_PATH, "ab") as f:
            while current_size < TOTAL_BYTES:
                end_byte = min(TOTAL_BYTES - 1, current_size + CHUNK_SIZE - 1)
                headers = {"Range": f"bytes={current_size}-{end_byte}"}
                expected = end_byte - current_size + 1
                for attempt in range(5):
                    try:
                        r = sess.get(URL, headers=headers, timeout=25)
                        if r.status_code in (200, 206) and len(r.content) == expected:
                            f.write(r.content)
                            f.flush()
                            current_size += len(r.content)
                            pct = (current_size / TOTAL_BYTES) * 100
                            print(f"[{pct:5.1f}%] {current_size:,} / {TOTAL_BYTES:,} bytes", flush=True)
                            break
                        else:
                            print(f"Retry chunk {current_size}: status={r.status_code}, len={len(r.content)} vs {expected}", flush=True)
                    except Exception as e:
                        print(f"Attempt {attempt+1} err: {e}", flush=True)
                else:
                    print("Failed after 5 attempts", flush=True)
                    return

    if os.path.getsize(IMG_PATH) == TOTAL_BYTES:
        print("Download 100% complete! Processing LOLA hillshaded textures...", flush=True)
        bmt.main()

if __name__ == "__main__":
    main()
