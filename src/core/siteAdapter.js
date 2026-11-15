/**
 * Adapts a 1D LOLA terrain product (from public/data/sites/<id>.json)
 * into a 2D dataset format ready for the 3D WebGL scene and 4D A* pathfinder.
 */
export function adaptSiteToPathfinder(siteProduct, siteMeta = {}) {
  const N = siteProduct.metadata.grid_size || 160;
  const cellM = siteProduct.metadata.cell_size_m || 120.0;
  const domainKm = siteProduct.metadata.domain_km || ((N * cellM) / 1000.0);

  const to2D = (arr) => {
    if (Array.isArray(arr[0])) return arr;
    const grid = [];
    for (let j = 0; j < N; j++) {
      grid.push(arr.slice(j * N, (j + 1) * N));
    }
    return grid;
  };

  const elev2D = to2D(siteProduct.elevation_m);
  const slope2D = to2D(siteProduct.slope_deg);
  const illum2D = to2D(siteProduct.illumination_frac);

  const temp2D = [];
  const ice2D = [];
  const comms2D = [];

  const lat = siteProduct.metadata.lat ?? siteMeta.lat ?? -85.0;
  const isPolar = Math.abs(lat) > 65.0;

  for (let j = 0; j < N; j++) {
    const trow = [];
    const irow = [];
    const crow = [];
    for (let i = 0; i < N; i++) {
      const illum = illum2D[j][i];
      let tK;
      if (isPolar) {
        tK = illum < 0.1 ? 40.0 + illum * 110.0 : 96.0 + Math.pow(illum, 0.6) * 110.0;
      } else {
        // Equatorial / mid-lat diurnal swing
        tK = illum < 0.05 ? 90.0 : 180.0 + illum * 190.0;
      }
      trow.push(Number(tK.toFixed(1)));

      const ice = tK < 110.0 ? Math.min(5.6, Number((((110.0 - tK) / 70.0) * 5.6).toFixed(2))) : 0.0;
      irow.push(ice);

      const comms = siteProduct.earth_visible_frac
        ? (siteProduct.earth_visible_frac[j * N + i] > 0.05 ? 1 : 0)
        : 1;
      crow.push(comms);
    }
    temp2D.push(trow);
    ice2D.push(irow);
    comms2D.push(crow);
  }

  const c = Math.floor(N / 2);
  const presets = [
    {
      id: `${siteProduct.metadata.id}_touchdown_recon`,
      name_en: `Sortie 1: Touchdown Zone to Adjacent High Ground`,
      name_es: `Misión 1: Reconocimiento desde Punto de Aterrizaje`,
      desc_en: `Tactical traverse from ${siteProduct.metadata.name} touchdown coordinate across local LOLA elevation ridge.`,
      desc_es: `Travesía táctica desde las coordenadas de ${siteProduct.metadata.name} explorando crestas elevadas.`,
      start: [c, c],
      goal: [Math.min(N - 8, c + 24), Math.max(8, c - 26)],
      sun_azimuth: 315,
      max_slope: 15.0,
      weights: { slope: 4.5, shadow: 1.8, comms: 2.5 }
    },
    {
      id: `${siteProduct.metadata.id}_high_illumination`,
      name_en: `Sortie 2: Peak Solar Elevation Ridge Route`,
      name_es: `Misión 2: Corredor de Cumbre de Alta Iluminación`,
      desc_en: `High-solar illumination crest route maximizing rover PV power collection and battery state-of-charge.`,
      desc_es: `Ruta de cresta iluminada para maximizar recarga solar y autonomía de baterías.`,
      start: [Math.max(8, c - 22), Math.max(8, c - 22)],
      goal: [Math.min(N - 8, c + 26), Math.min(N - 8, c + 26)],
      sun_azimuth: 270,
      max_slope: 14.0,
      weights: { slope: 4.0, shadow: 3.5, comms: 2.0 }
    }
  ];

  return {
    metadata: {
      ...siteProduct.metadata,
      grid_size: N,
      cell_size_m: cellM,
      domain_km: domainKm
    },
    presets,
    elevation_m: elev2D,
    slope_deg: slope2D,
    illumination_frac: illum2D,
    temperature_k: temp2D,
    ice_wt_pct: ice2D,
    dte_comms_los: comms2D
  };
}
