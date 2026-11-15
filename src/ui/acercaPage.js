import { renderNav } from "./common.js";
import { exportBibliographyPdf } from "./reportPdf.js";

renderNav("acerca.html");

document.getElementById("btn-bib-pdf")?.addEventListener("click", () => {
  exportBibliographyPdf();
});
