import { buildSeries, computeMetrics, assess, DEFAULT_THRESHOLDS } from "./geometry.js";

/** Step (minutes) chosen so that sunset/Earthset events are resolved to a few minutes. */
export const stepFor = (days) => (days <= 8 ? 10 : 15);

/** Runs a site x date scenario and returns the series, metrics and traffic lights. */
export function runScenario(eph, site, horizon, t0Ms, days, thresholds = DEFAULT_THRESHOLDS) {
  const t0 = eph.clamp(t0Ms);
  const t1 = Math.min(eph.endMs, t0 + days * 86400000);
  const S = buildSeries(eph, site, horizon, t0, t1, stepFor(days));
  const metrics = computeMetrics(S);
  return { S, metrics, lights: assess(metrics, thresholds), t0, t1 };
}

/** Resumen en lenguaje natural para no especialistas (lang: "es" | "en"). */
export function plainSummary(m, siteName, lang = "es") {
  if (lang === "en") {
    const f = (h) => (h < 48 ? `${h.toFixed(0)} hours` : `${(h / 24).toFixed(1)} days`);
    const sun = m.sunlitPct > 95 ? "almost always in sunlight" : m.sunlitPct > 60 ? "in sunlight most of the time" : m.sunlitPct > 30 ? "in sunlight about half of the time" : "mostly in darkness";
    const earth = m.earthPct > 95 ? "Earth is always in view, so the lander can talk to us directly" : m.earthPct > 60 ? "Earth is usually in view" : m.earthPct > 0.5 ? "Earth is only sometimes above the horizon, so communication would come in windows" : "Earth never rises above the horizon here, so a relay satellite would be needed";
    return `${siteName} is ${sun} (${m.sunlitPct.toFixed(0)}%). The longest stretch without sunlight is ${f(m.longestDarkH)}, which a lander must survive on battery and heaters. ${earth[0].toUpperCase()}${earth.slice(1)} (${m.earthPct.toFixed(0)}% of the time; longest outage ${f(m.longestEarthOutageH)}).`;
  }
  const f = (h) => (h < 48 ? `${h.toFixed(0)} horas` : `${(h / 24).toFixed(1)} días`);
  const sun = m.sunlitPct > 95 ? "casi siempre está iluminado por el Sol" : m.sunlitPct > 60 ? "está iluminado la mayor parte del tiempo" : m.sunlitPct > 30 ? "está iluminado cerca de la mitad del tiempo" : "permanece mayormente en oscuridad";
  const earth = m.earthPct > 95 ? "La Tierra está siempre a la vista, por lo que el módulo puede comunicarse directamente con nosotros" : m.earthPct > 60 ? "La Tierra suele estar a la vista" : m.earthPct > 0.5 ? "La Tierra solo a veces está sobre el horizonte, por lo que la comunicación llegaría en ventanas" : "La Tierra nunca sale sobre el horizonte aquí, por lo que se necesitaría un satélite de relevo";
  return `${siteName} ${sun} (${m.sunlitPct.toFixed(0)}%). El período más largo sin luz solar es de ${f(m.longestDarkH)}, que el módulo debe sobrevivir con batería y calefactores. ${earth} (${m.earthPct.toFixed(0)}% del tiempo; mayor corte de ${f(m.longestEarthOutageH)}).`;
}
