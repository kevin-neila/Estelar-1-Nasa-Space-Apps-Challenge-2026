import { jsPDF } from "jspdf";

/**
 * Generates and downloads an executive NASA Artemis III EVA & LTV Traverse Flight Readiness Dossier PDF.
 */
export function exportArtemisEvaDossierPdf({
  missionName,
  sunAzimuthDeg,
  maxSafeSlope,
  routeResult,
  sceneSnapshotDataUrl
}) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const { waypoints, telemetry } = routeResult;
  const startWp = waypoints[0];
  const goalWp = waypoints[waypoints.length - 1];

  // 1. Dark Navy Header Banner
  doc.setFillColor(8, 17, 34);
  doc.rect(0, 0, 210, 34, "F");

  doc.setTextColor(56, 189, 248);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("NASA INTERNATIONAL SPACE APPS CHALLENGE 2026 • THE NEXT FRONTIER", 14, 11);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text("ARTEMISFORGE — EVA & ROVER FLIGHT READINESS DOSSIER", 14, 20);

  doc.setTextColor(148, 163, 184);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(
    `SECTOR: SHACKLETON CRATER RIM & CONNECTING RIDGE (89.5°S - 90.0°S)   |   GENERATED: ${new Date().toISOString()}`,
    14,
    28
  );

  // 2. Mission Title & Safety Verdict Box
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(14, 40, 182, 20, 2, 2, "F");

  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(missionName || "Custom Lunar South Pole Sortie", 18, 48);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    `HLS Landing Zone: ${startWp.latStr}, ${startWp.lonStr} (${startWp.elevM}m)   ->   PSR Target: ${goalWp.latStr}, ${goalWp.lonStr} (${goalWp.elevM}m)`,
    18,
    55
  );

  // Verdict Badge
  if (telemetry.verdict === "GO") {
    doc.setFillColor(16, 185, 129);
  } else if (telemetry.verdict === "CAUTION") {
    doc.setFillColor(245, 158, 11);
  } else {
    doc.setFillColor(239, 68, 68);
  }
  doc.roundedRect(154, 43, 38, 13, 2, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(`STATUS: ${telemetry.verdict}`, 173, 51, { align: "center" });

  // 3. 3D Terrain Snapshot + Telemetry Grid
  let yCursor = 66;
  if (sceneSnapshotDataUrl) {
    try {
      doc.addImage(sceneSnapshotDataUrl, "JPEG", 14, yCursor, 92, 58);
      doc.setDrawColor(203, 213, 225);
      doc.rect(14, yCursor, 92, 58);
    } catch {
      // Ignore image embed issues if canvas tainted
    }
  }

  // Telemetry Summary Box on Right Side
  const rx = 110;
  doc.setFillColor(15, 23, 42);
  doc.roundedRect(rx, yCursor, 86, 58, 2, 2, "F");

  doc.setTextColor(56, 189, 248);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.text("TELEMETRY & PSR SORTIE BUDGET", rx + 5, yCursor + 8);

  const metrics = [
    ["Total 3D Traverse Distance:", `${telemetry.distanceKm} km`],
    ["Est. Mission Elapsed Time:", `${telemetry.durationFormatted}`],
    ["LTV Battery Remaining:", `${telemetry.batteryRemainingPct}% (${3000 - telemetry.energyUsedWh}/3000 Wh)`],
    ["PSR Cryogenic Dwell (<110K):", `${telemetry.psrCryoMinutes} min`],
    ["Peak Slope / Kinematic Limit:", `${telemetry.maxSlopeDeg}° (Limit: ${maxSafeSlope}°)`],
    ["Minimum Diviner Surface Temp:", `${telemetry.minTempK} K (${(telemetry.minTempK - 273.15).toFixed(1)}°C)`],
    ["Peak Water-Ice Concentration:", `${telemetry.maxIceWt} wt% H2O`],
    ["Direct-to-Earth DSN Comms:", `${telemetry.commsCoveragePct}% LOS Coverage`],
    ["Solar Grazing Azimuth:", `${sunAzimuthDeg}° (Elev: 1.6°)`]
  ];

  doc.setFontSize(8.2);
  metrics.forEach(([label, val], idx) => {
    const my = yCursor + 15 + idx * 4.6;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(203, 213, 225);
    doc.text(label, rx + 5, my);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text(val, rx + 81, my, { align: "right" });
  });

  // 4. Waypoint Flight Log Table
  yCursor = 132;
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.text("AUTONOMOUS WAYPOINT NAVIGATION LOG (4D WEIGHTED A* SOLUTION)", 14, yCursor);

  yCursor += 4;
  doc.setFillColor(30, 41, 59);
  doc.rect(14, yCursor, 182, 7, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7.8);

  const headers = [
    ["WP #", 17],
    ["LUNAR COORDS", 34],
    ["DIST (km)", 68],
    ["LOLA ELEV", 92],
    ["SLOPE", 116],
    ["DIVINER TEMP", 136],
    ["ICE (wt%)", 162],
    ["DSN COMMS", 180]
  ];
  headers.forEach(([hText, hx]) => doc.text(hText, hx, yCursor + 4.8));

  // Sample up to 16 evenly spaced waypoints along the route
  const maxRows = 16;
  const stepStride = Math.max(1, Math.floor((waypoints.length - 1) / (maxRows - 1)));
  const sampled = [];
  for (let idx = 0; idx < waypoints.length; idx += stepStride) {
    sampled.push(waypoints[idx]);
  }
  if (sampled[sampled.length - 1] !== goalWp) {
    sampled[sampled.length - 1] = goalWp;
  }

  yCursor += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.8);

  sampled.slice(0, maxRows).forEach((wp, rIdx) => {
    if (rIdx % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(14, yCursor, 182, 6.2, "F");
    }
    doc.setTextColor(30, 41, 59);
    const ry = yCursor + 4.3;
    const tag = rIdx === 0 ? "HLS-0" : rIdx === sampled.length - 1 ? "PSR-END" : `WP-${wp.step}`;
    doc.text(tag, 17, ry);
    doc.text(`${wp.latStr}, ${wp.lonStr}`, 34, ry);
    doc.text(`${wp.distKm.toFixed(2)} km`, 68, ry);
    doc.text(`${wp.elevM.toFixed(0)} m`, 92, ry);
    doc.text(`${wp.slopeDeg.toFixed(1)}°`, 116, ry);
    doc.text(`${wp.tempK.toFixed(1)} K`, 136, ry);
    doc.text(`${wp.iceWt.toFixed(2)}%`, 162, ry);
    doc.text(wp.comms ? "LOS LOCK" : "OCCLUDED", 180, ry);
    yCursor += 6.2;
  });

  // 5. Official NASA Open Data Attribution Footer
  doc.setDrawColor(203, 213, 225);
  doc.line(14, 272, 196, 272);
  doc.setTextColor(100, 116, 139);
  doc.setFontSize(7.5);
  doc.text(
    "NASA PDS DATA CITATIONS: (1) LRO LOLA Polar Digital Elevation Model LDEM_85S_20M; (2) LRO Diviner Radiometer Bolometric Brightness Temp;",
    14,
    277
  );
  doc.text(
    "(3) ShadowCam / LROC NAC Polar Illumination Mosaic; (4) NASA JPL HORIZONS Direct-to-Earth DSN Ephemeris. Built for Space Apps 2026.",
    14,
    282
  );

  doc.save("ArtemisForge_EVA_Flight_Dossier.pdf");
}
