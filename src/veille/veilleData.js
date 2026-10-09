// Module Veille : lecture et écriture dans Supabase.
import { supabase } from "../supabaseClient";
import { productKey, siteOf, defaultName, risqueSante } from "./veilleLib";

// Supabase renvoie 1000 lignes maximum par requête : on lit page par page.
async function fetchAll(make) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await make().range(from, from + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function fetchPubs(releveId, pageIds) {
  const out = [];
  for (let i = 0; i < pageIds.length; i += 100) {
    const ids = pageIds.slice(i, i + 100);
    out.push(...await fetchAll(() => supabase.from("veille_pubs").select("*")
      .eq("releve_id", releveId).in("fb_page_id", ids).order("id")));
  }
  return out;
}

export async function loadVeille() {
  const [pages, releves, relevePages, produits] = await Promise.all([
    fetchAll(() => supabase.from("veille_pages").select("*").order("created_at")),
    fetchAll(() => supabase.from("veille_releves").select("*").order("id", { ascending: false })),
    fetchAll(() => supabase.from("veille_releve_pages").select("*").order("releve_id", { ascending: false })),
    fetchAll(() => supabase.from("veille_produits").select("*").order("id")),
  ]);

  // Dernier relevé de chaque page
  const latest = {};
  for (const rp of relevePages) if (!latest[rp.fb_page_id]) latest[rp.fb_page_id] = rp;
  const actifs = new Set(pages.filter(p => p.actif).map(p => p.fb_page_id));

  const parReleve = {};
  for (const rp of Object.values(latest)) {
    if (!actifs.has(rp.fb_page_id)) continue;
    (parReleve[rp.releve_id] = parReleve[rp.releve_id] || []).push(rp.fb_page_id);
  }
  const pubs = [];
  for (const [rid, ids] of Object.entries(parReleve)) pubs.push(...await fetchPubs(Number(rid), ids));

  const refDates = {};
  for (const rp of Object.values(latest)) refDates[rp.fb_page_id] = rp.capture_le;

  return { pages, releves, relevePages, produits, pubs, latest, refDates };
}

// Publicités d'un relevé et, pour chacune de ses pages, celles du relevé précédent de la même page.
export async function loadComparaison(releveId, relevePages) {
  const pagesDuReleve = relevePages.filter(r => r.releve_id === releveId).map(r => r.fb_page_id);
  const apres = await fetchPubs(releveId, pagesDuReleve);
  const precedents = {};
  const sansPrecedent = [];
  for (const pid of pagesDuReleve) {
    const prev = relevePages.find(r => r.fb_page_id === pid && r.releve_id < releveId);
    if (prev) (precedents[prev.releve_id] = precedents[prev.releve_id] || []).push(pid);
    else sansPrecedent.push(pid);
  }
  const avant = [];
  for (const [rid, ids] of Object.entries(precedents)) avant.push(...await fetchPubs(Number(rid), ids));
  // On ne compare que les pages qui ont un relevé précédent
  const comparables = new Set(Object.values(precedents).flat());
  return { apres: apres.filter(p => comparables.has(p.fb_page_id)), avant, sansPrecedent };
}

// fichiers : [{ pageId, pageNom, cartes, date, incomplet }] déjà lus et vérifiés
export async function saveReleve(fichiers, pagesExistantes, produitsExistants) {
  const connues = new Map(pagesExistantes.map(p => [p.fb_page_id, p]));

  // 1. Pages : création des nouvelles, mise à jour du nom et des sites des autres
  for (const f of fichiers) {
    const sites = [...new Set(f.cartes.map(c => siteOf(c.url)).filter(s => s && s !== "bit.ly"))].slice(0, 3).join(", ") || null;
    const p = connues.get(f.pageId);
    if (!p) {
      const { error } = await supabase.from("veille_pages").insert([{ fb_page_id: f.pageId, nom: f.pageNom, sites }]);
      if (error) throw error;
    } else {
      const maj = { actif: true };
      if (f.pageNom) maj.nom = f.pageNom;
      if (sites) maj.sites = sites;
      const { error } = await supabase.from("veille_pages").update(maj).eq("fb_page_id", f.pageId);
      if (error) throw error;
    }
  }

  // 2. Relevé
  const nbCartes = fichiers.reduce((s, f) => s + f.cartes.length, 0);
  const nbPubs = fichiers.reduce((s, f) => s + f.cartes.filter(c => !c.low).reduce((t, c) => t + c.nb, 0), 0);
  const { data: rel, error: e1 } = await supabase.from("veille_releves")
    .insert([{ source: "mhtml", nb_pages: fichiers.length, nb_cartes: nbCartes, nb_pubs: nbPubs }]).select().single();
  if (e1) throw e1;

  const { error: e2 } = await supabase.from("veille_releve_pages").insert(fichiers.map(f => ({
    releve_id: rel.id, fb_page_id: f.pageId, capture_le: f.date.toISOString(), incomplet: !!f.incomplet,
    nb_cartes: f.cartes.length, nb_pubs: f.cartes.filter(c => !c.low).reduce((t, c) => t + c.nb, 0),
  })));
  if (e2) throw e2;

  // 3. Publicités, par paquets de 500
  const lignes = fichiers.flatMap(f => f.cartes.map(c => ({
    releve_id: rel.id, fb_page_id: f.pageId, library_id: c.library_id, started_on: c.started_on,
    nb: c.nb, low: c.low, url: c.url, produit_key: productKey(c.url), format: c.format,
    media: c.media, thumb: c.thumb, texte: c.texte,
  })));
  for (let i = 0; i < lignes.length; i += 500) {
    const { error } = await supabase.from("veille_pubs").insert(lignes.slice(i, i + 500));
    if (error) throw error;
  }

  // 4. Nouveaux produits
  const deja = new Set(produitsExistants.map(p => p.fb_page_id + "|" + p.produit_key));
  const nouveaux = new Map();
  for (const l of lignes) {
    const k = l.fb_page_id + "|" + l.produit_key;
    if (deja.has(k) || nouveaux.has(k)) continue;
    const nom = defaultName(l.url, l.texte);
    nouveaux.set(k, {
      fb_page_id: l.fb_page_id, produit_key: l.produit_key, nom, groupe: nom,
      url: l.url && !/bit\.ly/i.test(l.url) ? l.url : null, risque_sante: risqueSante(nom),
    });
  }
  const aCreer = [...nouveaux.values()];
  for (let i = 0; i < aCreer.length; i += 500) {
    const { error } = await supabase.from("veille_produits")
      .upsert(aCreer.slice(i, i + 500), { onConflict: "fb_page_id,produit_key", ignoreDuplicates: true });
    if (error) throw error;
  }
  return { releveId: rel.id, nbCartes, nbPubs, nbNouveauxProduits: aCreer.length };
}

export async function updateProduits(ids, champs) {
  if (!ids.length) return;
  const { error } = await supabase.from("veille_produits")
    .update({ ...champs, updated_at: new Date().toISOString() }).in("id", ids);
  if (error) throw error;
}

export async function updatePage(fbPageId, champs) {
  const { error } = await supabase.from("veille_pages").update(champs).eq("fb_page_id", fbPageId);
  if (error) throw error;
}

export async function addPages(ids) {
  if (!ids.length) return;
  const { error } = await supabase.from("veille_pages")
    .upsert(ids.map(id => ({ fb_page_id: id, actif: true })), { onConflict: "fb_page_id" });
  if (error) throw error;
}

export async function deleteReleve(id) {
  const { error } = await supabase.from("veille_releves").delete().eq("id", id);
  if (error) throw error;
}
