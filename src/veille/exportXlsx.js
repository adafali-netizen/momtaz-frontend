// Module Veille : écriture d'un fichier Excel (.xlsx) à plusieurs onglets.
import { texteSur } from "./veilleLib";

// feuilles : [{ nom, lignes: [{ colonne: valeur }] }]
export async function ecrireXlsx(nomFichier, feuilles) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  for (const { nom, lignes } of feuilles) {
    // Excel refuse les moitiés d'émojis et limite une cellule à 32 000 caractères
    const propres = lignes.map(l => Object.fromEntries(Object.entries(l).map(([k, v]) => [k, typeof v === "string" ? texteSur(v).slice(0, 32000) : v])));
    const ws = XLSX.utils.json_to_sheet(propres.length ? propres : [{ "Aucune donnée": "" }]);
    ws["!cols"] = Object.keys(propres[0] || {}).map(k => ({ wch: /^Texte/.test(k) ? 60 : /^Lien/.test(k) ? 40 : 18 }));
    XLSX.utils.book_append_sheet(wb, ws, nom.slice(0, 31));
  }
  XLSX.writeFile(wb, nomFichier);
}

export const horodatage = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
