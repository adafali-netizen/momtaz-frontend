// Niches : classement automatique des produits, des pages et des mots-clés (français, darija, arabe, anglais).
// La niche d'une page peut être corrigée à la main (veille_config « niches_pages »).

export const CLE_NICHES = "niches_pages";

const mots = (...l) => new RegExp("(?<![\\p{L}])(" + l.join("|") + ")", "iu");

export const NICHES = [
  { id: "cuisine",      label: "Cuisine",              re: mots("cuisine", "kitchen", "po[eê]le", "casserole", "blender", "mixeur", "friteuse", "air ?fryer", "caf[eé]", "couteau", "[eé]plucheur", "hachoir", "presse", "lunch ?box", "[eé]pices?", "vaisselle", "[eé]gouttoir", "mandoline", "thermos", "مطبخ", "المطبخ", "طنجرة", "خلاط", "عصارة", "قهوة", "سكين", "الطبخ", "قشارة", "توابل") },
  { id: "maison",       label: "Maison et rangement",  re: mots("rangement", "organi[sz]", "[eé]tag[eè]re", "poubelle", "serpilli[eè]re", "mop", "nettoy", "aspirateur", "s[eé]choir", "linge", "salle de bain", "douche", "lampe", "ventilateur", "chauffage", "rideau", "storage", "منظم", "ترتيب", "تنظيف", "الدار", "البيت", "المنزل", "حمام", "مصباح", "رف", "خزانة الملابس") },
  { id: "ameublement",  label: "Ameublement et déco",  re: mots("meuble", "armoire", "table", "chaise", "fauteuil", "canap[eé]", "matelas", "bureau", "console", "d[eé]co", "tapis", "miroir", "طاولة", "كرسي", "سرير", "أثاث", "ديكور", "زربية", "مرآة") },
  { id: "auto",         label: "Auto et moto",         re: mots("voiture", "auto(?!m)", "moto", "car(?![a-z])", "v[eé]hicule", "volant", "pneu", "dash ?cam", "r[eé]troviseur", "طوموبيل", "سيارة", "السيارة", "موطور", "طوموبيلتك") },
  { id: "enfants",      label: "Bébé et enfants",      re: mots("b[eé]b[eé]", "baby", "enfants?", "kids?", "jouets?", "toys?", "poussette", "biberon", "t[eé]l[eé]command[eé]", "أطفال", "طفل", "رضيع", "لعبة", "ألعاب", "بيبي", "ولادك") },
  { id: "bricolage",    label: "Bricolage et jardin",  re: mots("outils?", "perceuse", "visseuse", "scie", "tournevis", "cl[eé] ", "meuleuse", "laser", "mastic", "silicone", "jardin", "arrosage", "tuyau", "pompe", "[eé]tanch", "wrench", "drill", "بريكولاج", "أدوات", "منشار", "شنيور", "الحديقة", "تسربات") },
  { id: "bienetre",     label: "Bien-être et santé",   re: mots("massage", "masseur", "posture", "genou", "dos", "orthop", "semelle", "douleur", "sant[eé]", "sommeil", "oreiller", "coussin", "حزام", "تدليك", "الظهر", "الركبة", "ألم", "آلام", "المفاصل", "وسادة") },
  { id: "beaute",       label: "Beauté et soins",      re: mots("beaut[eé]", "cheveux", "tondeuse", "rasoir", "[eé]pilat", "maquillage", "cr[eè]me", "parfum", "ongles?", "soins?", "شعر", "تجميل", "عطر", "بشرة", "حلاقة", "الشعر") },
  { id: "vetements",    label: "Vêtements et mode",    re: mots("robe", "pantalon", "chemise", "t-?shirt", "jean", "veste", "hoodie", "pyjama", "chaussures?", "sneakers?", "sandales?", "sacs?", "abaya", "jel?laba", "montre femme", "ملابس", "حذاء", "صباط", "فستان", "عباية", "جلابة", "قفطان") },
  { id: "electronique", label: "Électronique et high-tech", re: mots("cam[eé]ra", "[eé]couteurs?", "bluetooth", "chargeur", "smart ?watch", "montre", "projecteur", "gps", "t[eé]l[eé]phone", "phone", "enceinte", "usb", "كاميرا", "سماعة", "شاحن", "ساعة", "هاتف", "التيليفون") },
  { id: "sport",        label: "Sport et loisirs",     re: mots("fitness", "sport", "musculation", "v[eé]lo", "camping", "p[eê]che", "tente", "gym", "trottinette", "رياضة", "صيد", "تخييم", "خيمة") },
  { id: "animaux",      label: "Animaux",              re: mots("chats?", "chiens?", "animal", "animaux", "pets?", "قط", "كلب", "القطط") },
];

export const NICHE_LABEL = Object.fromEntries([...NICHES.map(n => [n.id, n.label]), ["generaliste", "Généraliste"], ["autre", "Autre"]]);
export const NICHE_IDS = [...NICHES.map(n => n.id), "generaliste", "autre"];

// Niche d'un texte (nom de produit pesé 3 fois, textes de pub 1 fois) ; null si rien de reconnu
export function nicheDe(nom, textes = []) {
  const scores = {};
  for (const n of NICHES) {
    let s = 0;
    if (n.re.test(String(nom || ""))) s += 3;
    for (const t of textes) if (t && n.re.test(String(t))) s += 1;
    if (s) scores[n.id] = s;
  }
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : null;
}

// Niche d'un produit du classement
export const nicheProduit = g => nicheDe(g.nom, g.cartes.slice(0, 8).map(c => c.texte)) || "autre";

// Niche de chaque page : la niche qui pèse le plus dans ses pubs ; « Généraliste » si aucune ne fait 40 %.
// corrections : { page_id: niche } saisies à la main
export function nichesPages(groupes, corrections = {}) {
  const poids = {};
  for (const g of groupes) {
    const n = g.niche || nicheProduit(g);
    for (const v of g.vendors) {
      const p = (poids[v.fb_page_id] = poids[v.fb_page_id] || {});
      p[n] = (p[n] || 0) + Math.max(1, v.pubs);
    }
  }
  const out = {};
  for (const [page, p] of Object.entries(poids)) {
    const total = Object.values(p).reduce((s, x) => s + x, 0);
    const [best, val] = Object.entries(p).filter(([k]) => k !== "autre").sort((a, b) => b[1] - a[1])[0] || ["autre", 0];
    out[page] = best === "autre" || val / total < 0.4 ? "generaliste" : best;
  }
  for (const [page, n] of Object.entries(corrections || {})) if (n) out[page] = n;
  return out;
}

// Niche d'un mot-clé (phrases d'appel à l'action : aucune, utilisées seulement par la recherche « toutes niches »)
export const nicheMot = mot => nicheDe(mot, []);
