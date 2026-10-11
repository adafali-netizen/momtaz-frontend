// Étude de marché : sauvegarde des résultats dans le navigateur (IndexedDB).
// Chaque mot-clé terminé est enregistré : rien n'est perdu si l'onglet est rechargé ou fermé.

const BASE = "momtaz-veille";
const ANCIENNE = "etude";    // version 1 : une ligne par mot-clé (pays Maroc)
const TABLE = "etude2";      // version 2 : une ligne par pays + mot-clé
const cleDe = (pays, mot) => (pays || "MA") + "|" + mot;

function ouvrir() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("Sauvegarde indisponible dans ce navigateur")); return; }
    const req = indexedDB.open(BASE, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      const nouvelle = db.createObjectStore(TABLE, { keyPath: "cle" });
      // Reprise d'une étude sauvegardée avec l'ancienne version
      if (db.objectStoreNames.contains(ANCIENNE)) {
        const lecture = req.transaction.objectStore(ANCIENNE).getAll();
        lecture.onsuccess = () => {
          for (const r of lecture.result || []) nouvelle.put({ ...r, pays: "MA", cle: cleDe("MA", r.mot) });
          db.deleteObjectStore(ANCIENNE);
        };
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("Ouverture de la sauvegarde impossible"));
  });
}

async function operation(mode, action) {
  const db = await ouvrir();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(TABLE, mode);
      const req = action(tx.objectStore(TABLE));
      tx.oncomplete = () => resolve(req ? req.result : undefined);
      tx.onerror = () => reject(tx.error || new Error("Sauvegarde refusée"));
      tx.onabort = () => reject(tx.error || new Error("Sauvegarde annulée (espace disque insuffisant ?)"));
    });
  } finally {
    db.close();
  }
}

// Renvoie [{ mot, pays, ads, exact }] dans l'ordre où les mots-clés ont été relevés
export async function lireResultats() {
  const lignes = (await operation("readonly", s => s.getAll())) || [];
  return lignes.sort((a, b) => (a.le || 0) - (b.le || 0)).map(({ mot, pays, ads, exact }) => ({ mot, pays: pays || "MA", ads: ads || [], exact: !!exact }));
}

export async function sauverResultat({ mot, pays, ads, exact }) {
  await operation("readwrite", s => s.put({ cle: cleDe(pays, mot), mot, pays: pays || "MA", ads, exact: !!exact, le: Date.now() }));
}

export async function viderResultats() {
  await operation("readwrite", s => s.clear());
}

// Réglages de l'écran (petits) : mots-clés saisis, statut, maximum, expression exacte
const CLE_REGLAGES = "momtaz_etude_reglages";

export function lireReglages() {
  try { return JSON.parse(localStorage.getItem(CLE_REGLAGES) || "{}") || {}; } catch { return {}; }
}

export function sauverReglages(r) {
  try { localStorage.setItem(CLE_REGLAGES, JSON.stringify(r)); } catch { /* stockage indisponible */ }
}
