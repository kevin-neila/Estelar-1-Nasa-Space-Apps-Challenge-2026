/**
 * ArtemisForge 4D Spatiotemporal Weighted A* Pathfinder & PSR Sortie Planner
 * Implements Bekker-Wong lunar regolith slope penalties, grazing solar shadow raymarching,
 * Diviner cryogenic thermal drawdown, and Direct-to-Earth DSN line-of-sight constraints.
 */

class MinHeap {
  constructor() {
    this.heap = [];
  }
  push(node) {
    this.heap.push(node);
    this._bubbleUp(this.heap.length - 1);
  }
  pop() {
    if (this.heap.length === 0) return null;
    const top = this.heap[0];
    const bottom = this.heap.pop();
    if (this.heap.length > 0) {
      this.heap[0] = bottom;
      this._sinkDown(0);
    }
    return top;
  }
  get size() {
    return this.heap.length;
  }
  _bubbleUp(idx) {
    while (idx > 0) {
      const parent = (idx - 1) >> 1;
      if (this.heap[parent].f <= this.heap[idx].f) break;
      const tmp = this.heap[parent];
      this.heap[parent] = this.heap[idx];
      this.heap[idx] = tmp;
      idx = parent;
    }
  }
  _sinkDown(idx) {
    const len = this.heap.length;
    while (true) {
      let left = (idx << 1) + 1;
      let right = left + 1;
      let smallest = idx;
      if (left < len && this.heap[left].f < this.heap[smallest].f) smallest = left;
      if (right < len && this.heap[right].f < this.heap[smallest].f) smallest = right;
      if (smallest === idx) break;
      const tmp = this.heap[smallest];
      this.heap[smallest] = this.heap[idx];
      this.heap[idx] = tmp;
      idx = smallest;
    }
  }
}

/**
 * Raymarches across the LRO LOLA DEM grid to compute instantaneous grazing solar illumination
 * at a given solar azimuth (0-360°) and grazing solar elevation (default 1.6° at South Pole).
 * Returns a flat Uint8Array(N*N) where 1 = sunlit, 0 = shadowed.
 */
export function computeDynamicShadowMask(dataset, sunAzimuthDeg, sunElevDeg = 1.6) {
  const N = dataset.metadata.grid_size;
  const cellM = dataset.metadata.cell_size_m;
  const elev = dataset.elevation_m;
  const mask = new Uint8Array(N * N);

  const rad = (sunAzimuthDeg * Math.PI) / 180.0;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  const tanSun = Math.tan((sunElevDeg * Math.PI) / 180.0);

  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const z0 = elev[j][i];
      let shadowed = 0;

      // March toward the sun up to 44 cells (~6.8 km)
      for (let step = 1; step <= 44; step++) {
        const rx = Math.round(i + dx * step);
        const ry = Math.round(j + dy * step);
        if (rx < 0 || rx >= N || ry < 0 || ry >= N) break;

        const dz = elev[ry][rx] - z0;
        if (dz > 0) {
          const distM = step * cellM;
          if (dz / distM > tanSun) {
            shadowed = 1;
            break;
          }
        }
      }
      mask[j * N + i] = shadowed ? 0 : 1;
    }
  }
  return mask;
}

/**
 * Converts grid coordinates (i, j) into Lunar Coordinates (Lat, Lon)
 * and local cartesian (x_km, y_km) relative to domain center.
 */
export function gridToLunarCoords(i, j, N = 128, domainKm = 20.0, centerLat = -89.8, centerLon = 0.0) {
  const xKm = (i / (N - 1) - 0.5) * domainKm;
  const yKm = (j / (N - 1) - 0.5) * domainKm;
  
  let lat = centerLat + (yKm / 30.33);
  lat = Math.max(-90.0, Math.min(90.0, lat));
  
  const cosLat = Math.max(0.005, Math.cos((lat * Math.PI) / 180.0));
  let lon = centerLon + (xKm / (30.33 * cosLat));
  lon = ((lon + 540.0) % 360.0) - 180.0;

  const latStr = `${Math.abs(lat).toFixed(3)}°${lat < 0 ? "S" : "N"}`;
  const lonStr = `${Math.abs(lon).toFixed(2)}°${lon < 0 ? "W" : "E"}`;

  return {
    xKm: Number(xKm.toFixed(2)),
    yKm: Number(yKm.toFixed(2)),
    latStr,
    lonStr
  };
}

/**
 * Runs 8-directional weighted A* pathfinding between start [i,j] and goal [i,j].
 */
export function findOptimalLunarRoute(dataset, shadowMask, config) {
  const t0 = performance.now();
  const N = dataset.metadata.grid_size;
  const cellM = dataset.metadata.cell_size_m;
  const elev = dataset.elevation_m;
  const slope = dataset.slope_deg;
  const tempK = dataset.temperature_k;
  const iceWt = dataset.ice_wt_pct;
  const comms = dataset.dte_comms_los;

  const [startI, startJ] = config.start;
  const [goalI, goalJ] = config.goal;
  const maxSafeSlope = config.maxSlope ?? 15.0;
  const wSlope = config.weightSlope ?? 4.0;
  const wShadow = config.weightShadow ?? 2.2;
  const wComms = config.weightComms ?? 2.5;

  const startIdx = startJ * N + startI;
  const goalIdx = goalJ * N + goalI;

  const gScore = new Float64Array(N * N).fill(Infinity);
  const parent = new Int32Array(N * N).fill(-1);
  const closed = new Uint8Array(N * N);

  const open = new MinHeap();
  gScore[startIdx] = 0;

  const heuristic = (i, j) => {
    const di = i - goalI;
    const dj = j - goalJ;
    return Math.sqrt(di * di + dj * dj) * cellM;
  };

  open.push({ idx: startIdx, f: heuristic(startI, startJ) });

  const dirs = [
    [-1, 0, 1.0],
    [1, 0, 1.0],
    [0, -1, 1.0],
    [0, 1, 1.0],
    [-1, -1, Math.SQRT2],
    [1, -1, Math.SQRT2],
    [-1, 1, Math.SQRT2],
    [1, 1, Math.SQRT2]
  ];

  let found = false;
  while (open.size > 0) {
    const current = open.pop();
    const u = current.idx;
    if (u === goalIdx) {
      found = true;
      break;
    }
    if (closed[u]) continue;
    closed[u] = 1;

    const ui = u % N;
    const uj = (u / N) | 0;
    const uz = elev[uj][ui];

    for (let d = 0; d < 8; d++) {
      const vi = ui + dirs[d][0];
      const vj = uj + dirs[d][1];
      if (vi < 0 || vi >= N || vj < 0 || vj >= N) continue;

      const v = vj * N + vi;
      if (closed[v]) continue;

      const vz = elev[vj][vi];
      const horizDist = dirs[d][2] * cellM;
      const dz = vz - uz;
      const stepDist3D = Math.sqrt(horizDist * horizDist + dz * dz);

      const cellSlope = slope[vj][vi];
      const localStepSlope = (Math.atan2(Math.abs(dz), horizDist) * 180.0) / Math.PI;
      const effectiveSlope = Math.max(cellSlope, localStepSlope);

      // 1. Bekker-Wong Terramechanics Slope Cost
      let slopeFactor = 1.0 + wSlope * 0.25 * Math.pow(effectiveSlope / 10.0, 2);
      if (effectiveSlope > maxSafeSlope) {
        const excess = effectiveSlope - maxSafeSlope;
        slopeFactor += wSlope * (3.5 * excess + 0.85 * excess * excess);
      }
      if (effectiveSlope > 26.0) {
        // Near-impassable crater wall rollover barrier
        slopeFactor += 250.0;
      }

      // 2. Dynamic Grazing Shadow & Cryogenic PSR Cost
      const isSunlit = shadowMask[v] === 1;
      const cellTemp = tempK[vj][vi];
      let shadowFactor = 0.0;
      if (!isSunlit) {
        shadowFactor += wShadow * 1.4;
      }
      if (cellTemp < 110.0) {
        // Deep cryogenic cold trap penalty (unless near goal target)
        const cryoSeverity = (110.0 - cellTemp) / 70.0;
        shadowFactor += wShadow * 1.8 * cryoSeverity;
      }

      // 3. Direct-to-Earth DSN Line-of-Sight Occlusion Cost
      const hasComms = comms[vj][vi] === 1;
      const commsFactor = hasComms ? 0.0 : wComms * 1.65;

      const stepCost = stepDist3D * (slopeFactor + shadowFactor + commsFactor);
      const tentativeG = gScore[u] + stepCost;

      if (tentativeG < gScore[v]) {
        gScore[v] = tentativeG;
        parent[v] = u;
        open.push({ idx: v, f: tentativeG + heuristic(vi, vj) });
      }
    }
  }

  // Reconstruct path
  const rawPath = [];
  if (found) {
    let curr = goalIdx;
    while (curr !== -1) {
      const ci = curr % N;
      const cj = (curr / N) | 0;
      rawPath.push([ci, cj]);
      curr = parent[curr];
    }
    rawPath.reverse();
  } else {
    rawPath.push([startI, startJ], [goalI, goalJ]);
  }

  // Compute detailed mission telemetry along path
  let totalDistM = 0;
  let totalTimeHours = 0;
  let psrCryoMinutes = 0;
  let maxSlopeDeg = 0;
  let minTempK = 999;
  let maxIceWt = 0;
  let commsCount = 0;
  let sunlitCount = 0;

  // Artemis LTV / VIPER Battery Model: 3000 Wh total capacity, starts at 100% (3000 Wh)
  const batteryCapacityWh = 3000.0;
  let netEnergyUsedWh = 0.0;

  const waypoints = [];

  for (let k = 0; k < rawPath.length; k++) {
    const [i, j] = rawPath[k];
    const z = elev[j][i];
    const slp = slope[j][i];
    const tmp = tempK[j][i];
    const ice = iceWt[j][i];
    const dte = comms[j][i];
    const lit = shadowMask[j * N + i];

    if (slp > maxSlopeDeg) maxSlopeDeg = slp;
    if (tmp < minTempK) minTempK = tmp;
    if (ice > maxIceWt) maxIceWt = ice;
    if (dte === 1) commsCount++;
    if (lit === 1) sunlitCount++;

    let segDistM = 0;
    if (k > 0) {
      const [pi, pj] = rawPath[k - 1];
      const pz = elev[pj][pi];
      const dx = (i - pi) * cellM;
      const dy = (j - pj) * cellM;
      const dz = z - pz;
      segDistM = Math.sqrt(dx * dx + dy * dy + dz * dz);
      totalDistM += segDistM;

      // Artemis LTV Rover speed: nominal 6.8 km/h on flat sunlit terrain, slows on steep slopes or dark PSRs
      const speedKmh = Math.max(1.8, 6.8 * (1.0 - Math.min(0.6, slp / 30.0)) * (lit ? 1.0 : 0.82));
      const segHours = (segDistM / 1000.0) / speedKmh;
      totalTimeHours += segHours;

      if (tmp < 110.0 || !lit) {
        psrCryoMinutes += segHours * 60.0;
      }

      // Power draw calculation:
      // Locomotion power scales with slope; survival heaters draw +240W in cryo shadow; solar arrays generate 190W in sunlight
      const driveWatts = 210.0 * (1.0 + (slp / 15.0) * 0.75);
      const heaterWatts = tmp < 110.0 ? 220.0 : !lit ? 130.0 : 30.0;
      const solarGenWatts = lit ? 185.0 : 0.0;
      const netWatts = Math.max(45.0, driveWatts + heaterWatts - solarGenWatts);
      netEnergyUsedWh += netWatts * segHours;
    }

    // Add 20-minute science core drilling power budget at final target if target is in ice zone
    if (k === rawPath.length - 1 && ice > 0.5) {
      const drillHours = 0.33;
      totalTimeHours += drillHours;
      psrCryoMinutes += drillHours * 60.0;
      netEnergyUsedWh += 280.0 * drillHours;
    }

    const coords = gridToLunarCoords(
      i,
      j,
      N,
      dataset.metadata.domain_km,
      dataset.metadata.lat ?? -89.8,
      dataset.metadata.lon ?? 0.0
    );
    waypoints.push({
      step: k,
      i,
      j,
      xKm: coords.xKm,
      yKm: coords.yKm,
      latStr: coords.latStr,
      lonStr: coords.lonStr,
      distKm: Number((totalDistM / 1000.0).toFixed(2)),
      elevM: z,
      slopeDeg: slp,
      tempK: tmp,
      iceWt: ice,
      sunlit: lit === 1,
      comms: dte === 1
    });
  }

  const batteryRemainingPct = Math.max(
    0,
    Math.min(100, ((batteryCapacityWh - netEnergyUsedWh) / batteryCapacityWh) * 100.0)
  );
  const commsCoveragePct = (commsCount / Math.max(1, rawPath.length)) * 100.0;
  const sunlitCoveragePct = (sunlitCount / Math.max(1, rawPath.length)) * 100.0;

  // Determine Go / Caution / No-Go Safety Verdict
  let verdict = "GO";
  if (maxSlopeDeg > maxSafeSlope + 3.5 || batteryRemainingPct < 18.0 || psrCryoMinutes > 210) {
    verdict = "NOGO";
  } else if (maxSlopeDeg > maxSafeSlope + 0.2 || batteryRemainingPct < 35.0 || psrCryoMinutes > 135 || commsCoveragePct < 42.0) {
    verdict = "CAUTION";
  }

  const computeMs = Number((performance.now() - t0).toFixed(1));

  return {
    waypoints,
    computeMs,
    telemetry: {
      distanceKm: Number((totalDistM / 1000.0).toFixed(2)),
      durationHours: Number(totalTimeHours.toFixed(2)),
      durationFormatted: `${Math.floor(totalTimeHours)}h ${Math.round((totalTimeHours % 1) * 60)}m`,
      energyUsedWh: Math.round(netEnergyUsedWh),
      batteryRemainingPct: Number(batteryRemainingPct.toFixed(1)),
      psrCryoMinutes: Math.round(psrCryoMinutes),
      maxSlopeDeg: Number(maxSlopeDeg.toFixed(1)),
      minTempK: Number(minTempK.toFixed(1)),
      maxIceWt: Number(maxIceWt.toFixed(2)),
      commsCoveragePct: Number(commsCoveragePct.toFixed(1)),
      sunlitCoveragePct: Number(sunlitCoveragePct.toFixed(1)),
      verdict
    }
  };
}
