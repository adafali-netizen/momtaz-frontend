import { useMemo, useState } from "react";

// Tri des tableaux : clic sur un en-tête = tri décroissant, second clic = croissant.
// colonnes : { id: ligne => valeur } · defaut : { col, sens } · textes : colonnes triées de A à Z au premier clic

export function useTri(lignes, colonnes, defaut, textes = []) {
  const [tri, setTri] = useState(defaut);
  const triees = useMemo(() => {
    const f = colonnes[tri.col];
    if (!f) return lignes;
    const s = tri.sens === "asc" ? 1 : -1;
    return lignes.map((l, i) => ({ l, i, v: f(l) })).sort((a, b) => {
      const va = a.v, vb = b.v;
      const videA = va == null || va === "", videB = vb == null || vb === "";
      if (videA !== videB) return videA ? 1 : -1;   // valeurs vides toujours en bas
      if (typeof va === "string" || typeof vb === "string") return s * String(va).localeCompare(String(vb), "fr") || a.i - b.i;
      return s * (va - vb) || a.i - b.i;
    }).map(x => x.l);
  }, [lignes, colonnes, tri]);
  const trier = col => setTri(t => (t.col === col ? { col, sens: t.sens === "desc" ? "asc" : "desc" } : { col, sens: textes.includes(col) ? "asc" : "desc" }));
  return { triees, tri, trier };
}

// En-tête cliquable
export function Th({ col, tri, trier, children, droite, style }) {
  const actif = tri.col === col;
  return (
    <th onClick={() => trier(col)} title="Trier"
      style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap", textAlign: droite ? "right" : "left", color: actif ? "var(--blue)" : undefined, ...style }}>
      {children}{actif ? (tri.sens === "desc" ? " ↓" : " ↑") : ""}
    </th>
  );
}
