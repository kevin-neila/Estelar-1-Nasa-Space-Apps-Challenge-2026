/**
 * NASA Open APIs & Moon Trek Live Telemetry Connector
 * Ready to accept the user's official api.nasa.gov API key via:
 *   1. Environment variable: VITE_NASA_API_KEY in /home/cacho/artemis-forge/.env
 *   2. Runtime localStorage key: "ARTEMIS_NASA_API_KEY"
 */

export class NasaApiClient {
  constructor() {
    this.envKey = import.meta.env?.VITE_NASA_API_KEY || "";
    this.storageKey = localStorage.getItem("ARTEMIS_NASA_API_KEY") || "";
  }

  getApiKey() {
    return this.storageKey || this.envKey || "DEMO_KEY";
  }

  hasCustomKey() {
    const k = this.getApiKey();
    return Boolean(k && k !== "DEMO_KEY" && k.trim().length > 8);
  }

  setRuntimeApiKey(key) {
    const cleaned = (key || "").trim();
    if (cleaned) {
      localStorage.setItem("ARTEMIS_NASA_API_KEY", cleaned);
    } else {
      localStorage.removeItem("ARTEMIS_NASA_API_KEY");
    }
    this.storageKey = cleaned;
  }

  /**
   * Queries NASA DONKI (Space Weather Database Of Notifications, Knowledge, Information)
   * for Solar Energetic Particle (SEP) & Geomagnetic Storm alerts affecting Lunar South Pole EVA radiation budgets.
   */
  async fetchSpaceWeatherRadiationStatus() {
    const apiKey = this.getApiKey();
    const endDate = new Date().toISOString().slice(0, 10);
    const startObj = new Date(Date.now() - 7 * 86400 * 1000);
    const startDate = startObj.toISOString().slice(0, 10);

    const url = `https://api.nasa.gov/DONKI/SEP?startDate=${startDate}&endDate=${endDate}&api_key=${encodeURIComponent(apiKey)}`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return {
        online: true,
        usingCustomKey: this.hasCustomKey(),
        sepEventsCount: Array.isArray(data) ? data.length : 0,
        radiationStatus: Array.isArray(data) && data.length > 0 ? "ELEVATED SEP FLUX" : "NOMINAL GCR FLUX"
      };
    } catch {
      return {
        online: false,
        usingCustomKey: this.hasCustomKey(),
        sepEventsCount: 0,
        radiationStatus: "OFFLINE PDS CACHE"
      };
    }
  }
}
