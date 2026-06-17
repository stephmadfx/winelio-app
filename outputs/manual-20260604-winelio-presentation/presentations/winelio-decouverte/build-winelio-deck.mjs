import pptxgen from "/Users/steph/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/.pnpm/pptxgenjs@4.0.1/node_modules/pptxgenjs/dist/pptxgen.cjs.js";
import path from "node:path";

const OUT = process.env.WINELIO_DECK_OUT || "/Users/steph/PROJETS/WINELIO/winelio/outputs/manual-20260604-winelio-presentation/presentations/winelio-decouverte/output/Presentation-Winelio-Decouverte.pptx";
const LOGO_COLOR = "/Users/steph/PROJETS/WINELIO/winelio/public/logo-color.png";
const LOGO_DARK = "/Users/steph/PROJETS/WINELIO/winelio/public/logo-on-dark.png";

const pptx = new pptxgen();
pptx.layout = "LAYOUT_WIDE";
pptx.author = "Winelio";
pptx.company = "Winelio";
pptx.subject = "Presentation de decouverte Winelio";
pptx.title = "Winelio - Presentation de decouverte";
pptx.lang = "fr-FR";
pptx.theme = {
  headFontFace: "Aptos Display",
  bodyFontFace: "Aptos",
  lang: "fr-FR",
};
pptx.defineLayout({ name: "WINELIO", width: 13.333, height: 7.5 });
pptx.layout = "WINELIO";

const C = {
  orange: "FF6B35",
  amber: "F7931E",
  dark: "2D3436",
  gray: "636E72",
  light: "F8F9FA",
  paper: "FFF8F2",
  white: "FFFFFF",
  green: "1F9D73",
  blue: "2C7BE5",
  red: "E55353",
  line: "E7EAED",
  ink2: "4A5255",
};

function hexToRgb(hex) {
  const s = hex.replace("#", "");
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}

function withAlpha(hex, alpha) {
  const [r, g, b] = hexToRgb(hex);
  return { color: hex, transparency: Math.round((1 - alpha) * 100), _rgb: [r, g, b] };
}

function addBg(slide, dark = false) {
  slide.background = { color: dark ? C.dark : C.paper };
  if (!dark) {
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.333, h: 7.5, fill: { color: C.paper }, line: { color: C.paper } });
    slide.addShape(pptx.ShapeType.arc, { x: 10.1, y: -1.25, w: 4.2, h: 4.2, adjustPoint: 0.22, rotate: 15, fill: { color: C.amber, transparency: 82 }, line: { color: C.amber, transparency: 100 } });
    slide.addShape(pptx.ShapeType.arc, { x: -1.0, y: 5.65, w: 3.2, h: 3.2, adjustPoint: 0.35, rotate: -10, fill: { color: C.orange, transparency: 86 }, line: { color: C.orange, transparency: 100 } });
  } else {
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.333, h: 7.5, fill: { color: C.dark }, line: { color: C.dark } });
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.333, h: 0.11, fill: { color: C.orange }, line: { color: C.orange } });
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0.11, w: 13.333, h: 0.05, fill: { color: C.amber }, line: { color: C.amber } });
  }
}

function footer(slide, n, dark = false) {
  slide.addText(`${String(n).padStart(2, "0")} / 18`, {
    x: 11.82, y: 7.08, w: 0.8, h: 0.18,
    fontFace: "Aptos", fontSize: 7.5,
    color: dark ? "CED6DA" : "9AA3A8",
    margin: 0,
  });
  slide.addText("Winelio", {
    x: 0.55, y: 7.06, w: 1.0, h: 0.2,
    fontFace: "Aptos", fontSize: 8.5, bold: true,
    color: dark ? "FFFFFF" : C.gray,
    margin: 0,
  });
}

function logo(slide, dark = false, x = 0.55, y = 0.38, w = 1.7) {
  slide.addImage({ path: dark ? LOGO_DARK : LOGO_COLOR, x, y, w, h: w * 0.275 });
}

function title(slide, kicker, claim, opts = {}) {
  const dark = opts.dark || false;
  const color = dark ? C.white : C.dark;
  slide.addText(kicker.toUpperCase(), {
    x: 0.58, y: 0.95, w: 2.2, h: 0.22, margin: 0,
    fontFace: "Aptos", fontSize: 8.5, bold: true,
    charSpace: 1.2, color: dark ? C.amber : C.orange,
  });
  slide.addText(claim, {
    x: 0.55, y: 1.22, w: opts.w || 7.7, h: opts.h || 0.95,
    fontFace: "Aptos Display", fontSize: opts.size || 31, bold: true,
    breakLine: false, color,
    fit: "shrink", margin: 0,
  });
}

function body(slide, text, x, y, w, h, opts = {}) {
  slide.addText(text, {
    x, y, w, h,
    fontFace: "Aptos",
    fontSize: opts.size || 16,
    color: opts.color || C.ink2,
    bold: opts.bold || false,
    breakLine: false,
    fit: "shrink",
    valign: opts.valign || "mid",
    margin: opts.margin ?? 0.08,
    paraSpaceAfterPt: opts.paraSpaceAfterPt ?? 6,
    bullet: opts.bullet || undefined,
  });
}

function pill(slide, text, x, y, w, fill, color = C.white) {
  slide.addShape(pptx.ShapeType.roundRect, { x, y, w, h: 0.44, rectRadius: 0.08, fill: { color: fill }, line: { color: fill } });
  body(slide, text, x + 0.14, y + 0.12, w - 0.28, 0.18, { size: 9, color, bold: true, margin: 0 });
}

function card(slide, x, y, w, h, fill = C.white, line = C.line) {
  slide.addShape(pptx.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.06, fill: { color: fill }, line: { color: line, transparency: 0, width: 0.8 } });
}

function metric(slide, value, label, x, y, w, color = C.orange) {
  slide.addText(value, { x, y, w, h: 0.48, margin: 0, fontFace: "Aptos Display", fontSize: 29, bold: true, color });
  body(slide, label, x, y + 0.54, w, 0.35, { size: 10.5, color: C.gray, margin: 0 });
}

function arrow(slide, x1, y1, x2, y2, color = C.orange, width = 2) {
  slide.addShape(pptx.ShapeType.line, {
    x: x1, y: y1, w: x2 - x1, h: y2 - y1,
    line: { color, width, beginArrowType: "none", endArrowType: "triangle" },
  });
}

function addNotes(slide, notes) {
  if (slide.addNotes) slide.addNotes(notes);
}

function slide1() {
  const s = pptx.addSlide(); addBg(s, true);
  logo(s, true, 0.62, 0.52, 2.05);
  s.addText("Presentation decouverte", { x: 0.66, y: 1.62, w: 3.1, h: 0.25, margin: 0, fontFace: "Aptos", fontSize: 13, color: C.amber, bold: true });
  s.addText("Winelio", { x: 0.62, y: 2.06, w: 5.2, h: 0.8, margin: 0, fontFace: "Aptos Display", fontSize: 54, bold: true, color: C.white });
  s.addText("Recommander les bons professionnels. Generer un complement de revenu. Faire grandir un reseau de confiance.", {
    x: 0.66, y: 3.02, w: 7.2, h: 0.9, margin: 0, fontFace: "Aptos", fontSize: 21, color: "F2F4F5", fit: "shrink",
  });
  s.addShape(pptx.ShapeType.chevron, { x: 9.1, y: 1.65, w: 1.4, h: 1.8, rotate: 0, fill: { color: C.orange }, line: { color: C.orange } });
  s.addShape(pptx.ShapeType.chevron, { x: 10.05, y: 2.42, w: 1.4, h: 1.8, rotate: 0, fill: { color: C.amber }, line: { color: C.amber } });
  s.addShape(pptx.ShapeType.chevron, { x: 10.92, y: 3.19, w: 1.4, h: 1.8, rotate: 0, fill: { color: "FFFFFF", transparency: 18 }, line: { color: "FFFFFF", transparency: 100 } });
  footer(s, 1, true);
  addNotes(s, "Ouvrir simplement : Winelio part d'une idee connue de tous, recommander une bonne personne, mais la structure et la remunere proprement.");
}

function slide2() {
  const s = pptx.addSlide(); addBg(s); logo(s); title(s, "Point de depart", "Tout le monde recommande deja des professionnels.");
  body(s, "Un plombier fiable, un artisan serieux, une entreprise qui tient ses promesses : ces recommandations circulent deja tous les jours.", 0.68, 2.25, 5.0, 1.1, { size: 19, color: C.dark });
  const items = [["Famille", C.orange], ["Voisins", C.amber], ["Clients", C.blue], ["Collegues", C.green]];
  items.forEach(([t, c], i) => {
    const x = 7.0 + (i % 2) * 2.05, y = 2.05 + Math.floor(i / 2) * 1.45;
    s.addShape(pptx.ShapeType.ellipse, { x, y, w: 1.0, h: 1.0, fill: { color: c }, line: { color: c } });
    body(s, t, x - 0.28, y + 1.1, 1.58, 0.25, { size: 12, color: C.dark, bold: true, margin: 0, valign: "mid" });
  });
  arrow(s, 8.1, 3.02, 8.85, 3.02, C.gray, 1.2);
  arrow(s, 9.0, 2.65, 8.1, 2.65, C.gray, 1.2);
  arrow(s, 9.05, 4.1, 9.65, 3.35, C.gray, 1.2);
  pill(s, "Winelio organise ce bouche-a-oreille", 0.68, 5.54, 3.7, C.orange);
  footer(s, 2);
  addNotes(s, "Faire lever la main mentalement : qui a deja recommande un artisan ? Winelio ne cree pas un comportement artificiel, il l'organise.");
}

function slide3() {
  const s = pptx.addSlide(); addBg(s); logo(s); title(s, "Le probleme", "Aujourd'hui, la valeur de la recommandation est rarement reconnue.");
  const rows = [
    ["La confiance", "est donnee gratuitement"],
    ["Le professionnel", "gagne un nouveau client"],
    ["La personne qui recommande", "n'a souvent aucun suivi"],
  ];
  rows.forEach((r, i) => {
    const y = 2.15 + i * 1.05;
    s.addShape(pptx.ShapeType.rect, { x: 0.72, y, w: 0.09, h: 0.55, fill: { color: i === 0 ? C.orange : i === 1 ? C.amber : C.gray }, line: { color: i === 0 ? C.orange : i === 1 ? C.amber : C.gray } });
    body(s, r[0], 1.0, y - 0.02, 2.7, 0.28, { size: 18, bold: true, color: C.dark, margin: 0 });
    body(s, r[1], 3.6, y - 0.01, 4.7, 0.28, { size: 18, color: C.gray, margin: 0 });
  });
  card(s, 8.65, 2.0, 3.4, 2.6, "FFFFFF");
  metric(s, "0 EUR", "pour une recommandation non structuree", 9.1, 2.45, 2.4, C.red);
  body(s, "Winelio transforme une mise en relation utile en parcours suivi, mesurable et remunere.", 8.98, 3.58, 2.75, 0.55, { size: 13, color: C.dark });
  footer(s, 3);
  addNotes(s, "Ne pas dramatiser : le bouche-a-oreille existe, mais il fuit. Winelio met un cadre clair et suivi.");
}

function slide4() {
  const s = pptx.addSlide(); addBg(s); logo(s); title(s, "La solution", "Une plateforme simple pour recommander, suivre et etre recompense.");
  const steps = [["1", "Je connais un besoin"], ["2", "Je recommande un pro"], ["3", "Le dossier avance"], ["4", "La commission tombe"]];
  steps.forEach((st, i) => {
    const x = 0.8 + i * 3.0;
    card(s, x, 2.25, 2.35, 1.72, "FFFFFF");
    s.addShape(pptx.ShapeType.ellipse, { x: x + 0.18, y: 2.48, w: 0.42, h: 0.42, fill: { color: i < 2 ? C.orange : C.amber }, line: { color: i < 2 ? C.orange : C.amber } });
    body(s, st[0], x + 0.31, 2.56, 0.15, 0.08, { size: 10, color: C.white, bold: true, margin: 0 });
    body(s, st[1], x + 0.22, 3.08, 1.85, 0.44, { size: 14, color: C.dark, bold: true });
    if (i < 3) arrow(s, x + 2.42, 3.1, x + 2.78, 3.1, C.orange, 1.5);
  });
  body(s, "L'idee centrale : Winelio ne vend pas du reve, Winelio structure une mise en relation qui peut produire de la valeur.", 1.35, 5.35, 10.2, 0.48, { size: 18, color: C.dark, bold: true, margin: 0 });
  footer(s, 4);
  addNotes(s, "Expliquer en 4 temps, sans entrer encore dans le reseau. La personne doit d'abord comprendre le geste de recommandation.");
}

function slide5() {
  const s = pptx.addSlide(); addBg(s); logo(s); title(s, "Pour qui ?", "Winelio relie trois profils qui ont chacun quelque chose a gagner.");
  const cols = [
    ["Le parrain", "Recommande autour de lui et suit ses dossiers."],
    ["Le professionnel", "Recoit des opportunites qualifiees et remunere la recommandation utile."],
    ["Le client final", "Trouve plus vite une personne de confiance."],
  ];
  cols.forEach((c, i) => {
    const x = 0.8 + i * 4.0;
    s.addShape(pptx.ShapeType.hexagon, { x: x + 1.0, y: 2.03, w: 1.15, h: 1.0, fill: { color: [C.orange, C.amber, C.green][i] }, line: { color: [C.orange, C.amber, C.green][i] } });
    body(s, c[0], x, 3.33, 3.0, 0.32, { size: 19, color: C.dark, bold: true, margin: 0 });
    body(s, c[1], x, 3.85, 3.05, 0.75, { size: 14.5, color: C.gray });
  });
  footer(s, 5);
  addNotes(s, "Le public etant melange, cette slide permet a chacun de se situer sans exclure personne.");
}

function slide6() {
  const s = pptx.addSlide(); addBg(s); logo(s); title(s, "Cas concret", "Une recommandation commence souvent par une phrase tres simple.");
  card(s, 0.85, 2.05, 5.4, 2.5, "FFFFFF");
  body(s, "\"Je connais quelqu'un de fiable pour ton projet. Je peux te mettre en relation.\"", 1.25, 2.65, 4.55, 0.9, { size: 23, color: C.dark, bold: true, margin: 0.05 });
  card(s, 7.1, 1.85, 4.9, 3.1, "FFF5F0", "FFD3C2");
  body(s, "Dans Winelio, cette phrase devient :", 7.45, 2.2, 3.8, 0.3, { size: 14, color: C.gray, bold: true, margin: 0 });
  const pts = ["une fiche contact", "un professionnel choisi", "un suivi d'etapes", "une commission calculee"];
  pts.forEach((p, i) => body(s, `• ${p}`, 7.55, 2.75 + i * 0.42, 3.4, 0.24, { size: 15, color: C.dark, margin: 0 }));
  footer(s, 6);
  addNotes(s, "Rendre la mecanique concrete : une conversation devient un dossier suivi.");
}

function slide7() {
  const s = pptx.addSlide(); addBg(s); logo(s); title(s, "Workflow", "Les 8 etapes donnent de la clarte jusqu'a l'affaire terminee.");
  const steps = ["Recue", "Acceptee", "Contact", "RDV", "Devis", "Valide", "Paiement", "Terminee"];
  steps.forEach((st, i) => {
    const x = 0.65 + i * 1.52;
    s.addShape(pptx.ShapeType.ellipse, { x, y: 3.1, w: 0.62, h: 0.62, fill: { color: i < 5 ? C.orange : i === 5 ? C.green : C.amber }, line: { color: C.white, width: 1.2 } });
    body(s, String(i + 1), x + 0.22, 3.25, 0.2, 0.1, { size: 11, color: C.white, bold: true, margin: 0 });
    body(s, st, x - 0.15, 3.88, 0.95, 0.25, { size: 10.5, color: C.dark, bold: i === 5, margin: 0 });
    if (i < 7) arrow(s, x + 0.7, 3.4, x + 1.35, 3.4, C.line, 1);
  });
  pill(s, "Etape 6 : le devis valide declenche les commissions", 4.35, 5.03, 4.65, C.green);
  footer(s, 7);
  addNotes(s, "Insister sur l'etape 6 : on parle de commissions quand une vraie affaire avance, pas au simple clic.");
}

function slide8() {
  const s = pptx.addSlide(); addBg(s); logo(s); title(s, "Complement de revenu", "Le potentiel vient de la repetition de petites opportunites reelles.");
  const vals = [
    ["1 reco", "un dossier suivi"],
    ["3 a 5 reco/mois", "un rythme accessible"],
    ["des pros actifs", "plus de transformation"],
    ["un reseau", "effet cumulatif"],
  ];
  vals.forEach((m, i) => metric(s, m[0], m[1], 0.95 + i * 3.05, 2.55, 2.35, [C.orange, C.amber, C.blue, C.green][i]));
  body(s, "La promesse n'est pas de devenir riche sans rien faire. L'opportunite, c'est d'etre remunere quand on cree une vraie mise en relation utile.", 1.05, 5.35, 11.0, 0.55, { size: 18, color: C.dark, bold: true, margin: 0 });
  footer(s, 8);
  addNotes(s, "Poser le cadre ethique : complement de revenu, effort, regularite, qualite des recommandations.");
}

function slide9() {
  const s = pptx.addSlide(); addBg(s); logo(s); title(s, "Repartition", "Quand une affaire est validee, la valeur est partagee selon des regles claires.");
  const data = [
    ["Parrain direct", 60, C.orange],
    ["Reseau niv. 1-5", 15, C.amber],
    ["Bonus pro + Wins", 2, C.green],
    ["Plateforme", 23, C.gray],
  ];
  let y = 2.0;
  data.forEach(([label, val, col]) => {
    body(s, label, 0.95, y + 0.08, 2.35, 0.24, { size: 14, color: C.dark, bold: true, margin: 0 });
    s.addShape(pptx.ShapeType.rect, { x: 3.55, y: y + 0.03, w: 5.65, h: 0.34, fill: { color: "F0F2F4" }, line: { color: "F0F2F4" } });
    s.addShape(pptx.ShapeType.rect, { x: 3.55, y: y + 0.03, w: 5.65 * (val / 60), h: 0.34, fill: { color: col }, line: { color: col } });
    body(s, `${val}%`, 9.55, y + 0.08, 0.7, 0.14, { size: 13, color: C.dark, bold: true, margin: 0 });
    y += 0.78;
  });
  card(s, 10.45, 2.06, 1.55, 2.7, "FFF5F0", "FFD3C2");
  body(s, "Reseau", 10.7, 2.42, 1.0, 0.18, { size: 12, color: C.orange, bold: true, margin: 0 });
  body(s, "3% par niveau", 10.68, 2.95, 1.06, 0.32, { size: 18, color: C.dark, bold: true, margin: 0 });
  body(s, "soit 15% au total sur 5 niveaux.", 10.68, 3.52, 1.04, 0.54, { size: 11, color: C.gray, bold: true, margin: 0 });
  footer(s, 9);
  addNotes(s, "Presenter la repartition simplement. Attention : reseau a 3% par niveau, pas 5%. La plateforme garde la part d'equilibre.");
}

function slide10() {
  const s = pptx.addSlide(); addBg(s); logo(s); title(s, "Le reseau", "On commence par recommander, puis on peut aider d'autres personnes a recommander.");
  const lanes = [
    ["Moi", "Je recommande directement", "60%", C.orange],
    ["Niveau 1", "J'aide quelqu'un a demarrer", "3%", C.amber],
    ["Niveaux 2-5", "Le reseau continue de se developper", "3% / niveau", C.gray],
  ];
  lanes.forEach((l, i) => {
    const y = 2.15 + i * 1.05;
    s.addShape(pptx.ShapeType.rect, { x: 0.95, y, w: 0.16, h: 0.66, fill: { color: l[3] }, line: { color: l[3] } });
    body(s, l[0], 1.32, y + 0.02, 1.65, 0.24, { size: 18, color: C.dark, bold: true, margin: 0 });
    body(s, l[1], 3.02, y + 0.07, 4.5, 0.2, { size: 14, color: C.gray, margin: 0 });
    s.addShape(pptx.ShapeType.roundRect, { x: 8.6, y: y - 0.02, w: 1.55, h: 0.44, rectRadius: 0.06, fill: { color: l[3] }, line: { color: l[3] } });
    body(s, l[2], 8.78, y + 0.11, 1.2, 0.12, { size: 11, color: C.white, bold: true, margin: 0 });
  });
  body(s, "La logique est progressive : d'abord comprendre, ensuite recommander, puis transmettre la methode.", 1.0, 5.68, 10.9, 0.38, { size: 17, color: C.dark, bold: true, margin: 0 });
  footer(s, 10);
  addNotes(s, "Introduire le reseau sans jargon. Ce n'est pas la premiere chose a vendre : c'est l'effet de duplication d'une methode claire.");
}

function slide11() {
  const s = pptx.addSlide(); addBg(s); logo(s); title(s, "Simulation", "Un exemple prudent montre comment les revenus peuvent se construire.");
  const assumptions = [
    ["Commission moyenne", "100 EUR"],
    ["Recommandations validees", "3 / mois"],
    ["Parrain direct", "60%"],
    ["Reseau", "3% / niveau"],
  ];
  assumptions.forEach((a, i) => {
    card(s, 0.78 + i * 3.05, 2.02, 2.55, 1.18, "FFFFFF");
    body(s, a[0], 1.02 + i * 3.05, 2.26, 2.0, 0.2, { size: 10, color: C.gray, bold: true, margin: 0 });
    body(s, a[1], 1.02 + i * 3.05, 2.6, 1.95, 0.3, { size: 18, color: i === 0 ? C.orange : C.dark, bold: true, margin: 0 });
  });
  card(s, 1.05, 4.1, 4.6, 0.95, "FFF5F0", "FFD3C2");
  body(s, "180 EUR", 1.35, 4.36, 1.35, 0.28, { size: 23, color: C.orange, bold: true, margin: 0 });
  body(s, "exemple : 3 affaires directes validees dans le mois", 2.85, 4.42, 2.35, 0.22, { size: 11.5, color: C.dark, bold: true, margin: 0 });
  card(s, 6.35, 4.1, 4.6, 0.95, "FFFFFF", C.line);
  body(s, "+ variable", 6.65, 4.36, 1.55, 0.28, { size: 22, color: C.amber, bold: true, margin: 0 });
  body(s, "si le reseau est actif et qualifie", 8.4, 4.42, 1.95, 0.22, { size: 11.5, color: C.dark, bold: true, margin: 0 });
  body(s, "Le simulateur sert a tester des hypotheses, pas a promettre un resultat.", 2.4, 5.75, 8.4, 0.26, { size: 14, color: C.gray, bold: true, margin: 0 });
  footer(s, 11);
  addNotes(s, "Exemple volontairement raisonnable. Ne jamais promettre un revenu fixe : parler d'hypotheses, d'activite et de qualite.");
}

function slide12() {
  const s = pptx.addSlide(); addBg(s, true); logo(s, true); title(s, "Demo live", "Ouvrir le simulateur de gains et changer les valeurs en direct.", { dark: true, w: 7.1 });
  card(s, 0.9, 2.35, 5.2, 2.15, "FFFFFF", "FFFFFF");
  body(s, "A montrer a l'ecran", 1.25, 2.65, 2.2, 0.22, { size: 12, color: C.orange, bold: true, margin: 0 });
  body(s, "Simulateur de gains", 1.25, 3.05, 3.8, 0.35, { size: 24, color: C.dark, bold: true, margin: 0 });
  body(s, "Valeurs modifiables : affaires/mois, commission moyenne, activite du reseau, niveaux actifs.", 1.25, 3.62, 4.15, 0.48, { size: 14, color: C.gray });
  s.addText("Ouvrir la page", {
    x: 7.45, y: 3.0, w: 2.55, h: 0.48, margin: 0.05,
    fontFace: "Aptos", fontSize: 18, bold: true, align: "center", color: C.white,
    fill: { color: C.orange }, hyperlink: { url: "https://dev2.winelio.app/simulateur-gains" },
    fit: "shrink",
  });
  body(s, "Lien prevu : dev2.winelio.app/simulateur-gains", 7.15, 3.72, 3.35, 0.28, { size: 11, color: "CED6DA", margin: 0 });
  footer(s, 12, true);
  addNotes(s, "Cliquer vers la page de simulation si elle est disponible. Sinon expliquer que la page peut etre ajoutee comme outil d'animation.");
}

function slide13() {
  const s = pptx.addSlide(); addBg(s); logo(s); title(s, "Ce qui compte", "Les meilleurs resultats viennent de recommandations qualifiees.");
  const qualities = [
    ["Besoin reel", "La personne a un projet concret."],
    ["Pro fiable", "Le professionnel est serieux et disponible."],
    ["Suivi", "Le dossier avance dans les etapes."],
    ["Confiance", "Le parrain reste dans une relation propre."],
  ];
  qualities.forEach((q, i) => {
    const x = 0.85 + (i % 2) * 5.6, y = 2.1 + Math.floor(i / 2) * 1.45;
    s.addShape(pptx.ShapeType.rect, { x, y, w: 0.12, h: 0.82, fill: { color: [C.orange, C.amber, C.green, C.blue][i] }, line: { color: [C.orange, C.amber, C.green, C.blue][i] } });
    body(s, q[0], x + 0.32, y + 0.04, 3.0, 0.25, { size: 18, color: C.dark, bold: true, margin: 0 });
    body(s, q[1], x + 0.32, y + 0.43, 3.85, 0.28, { size: 13.5, color: C.gray, margin: 0 });
  });
  footer(s, 13);
  addNotes(s, "Ramener l'audience sur la qualite. Winelio n'est pas un spam de liens, c'est une recommandation utile.");
}

function slide14() {
  const s = pptx.addSlide(); addBg(s); logo(s); title(s, "Cote professionnel", "Le pro ne paie pas une promesse : il remunere une opportunite qui avance.");
  const flow = [["Besoin qualifie", C.orange], ["Contact", C.amber], ["Devis", C.blue], ["Affaire", C.green]];
  flow.forEach((f, i) => {
    const x = 1.0 + i * 2.85;
    card(s, x, 2.65, 2.15, 1.05, "FFFFFF");
    body(s, f[0], x + 0.18, 3.02, 1.75, 0.2, { size: 15, color: C.dark, bold: true, margin: 0 });
    s.addShape(pptx.ShapeType.rect, { x, y: 3.72, w: 2.15, h: 0.08, fill: { color: f[1] }, line: { color: f[1] } });
    if (i < 3) arrow(s, x + 2.22, 3.16, x + 2.65, 3.16, C.line, 1.2);
  });
  body(s, "Pour un professionnel, Winelio est interessant quand il veut des recommandations mieux qualifiees que de simples contacts froids.", 1.2, 5.25, 10.6, 0.46, { size: 18, color: C.dark, bold: true, margin: 0 });
  footer(s, 14);
  addNotes(s, "S'adresser aux pros presents : on ne leur vend pas une charge, mais un canal d'affaires qualifie.");
}

function slide15() {
  const s = pptx.addSlide(); addBg(s); logo(s); title(s, "Cote parrain", "Le parrain garde une vision simple de son activite.");
  const cols = [
    ["Tableau de bord", "3", "recommandations en cours", C.orange],
    ["Mes dossiers", "8 etapes", "du contact a l'affaire terminee", C.blue],
    ["Mon reseau", "5 niv.", "vision progressive", C.amber],
  ];
  cols.forEach((c, i) => {
    const x = 0.85 + i * 3.9;
    card(s, x, 2.08, 3.1, 2.72, "FFFFFF");
    body(s, c[0], x + 0.28, 2.42, 2.25, 0.24, { size: 15, color: C.dark, bold: true, margin: 0 });
    body(s, c[1], x + 0.28, 3.08, 2.0, 0.38, { size: 28, color: c[3], bold: true, margin: 0 });
    body(s, c[2], x + 0.3, 3.82, 2.3, 0.36, { size: 12.5, color: C.gray, bold: true, margin: 0 });
  });
  footer(s, 15);
  addNotes(s, "C'est une maquette de lecture : le parrain comprend ou regarder sans entrer dans tous les details de l'app.");
}

function slide16() {
  const s = pptx.addSlide(); addBg(s); logo(s); title(s, "Demarrage", "Pour commencer, il faut un parrain et un code valide.");
  const steps = [["Demander le QR code", "au parrain present"], ["S'inscrire", "avec le lien de parrainage"], ["Comprendre", "les premieres recommandations"], ["Agir", "sur son cercle naturel"]];
  steps.forEach((st, i) => {
    const x = 0.85 + i * 3.05;
    s.addShape(pptx.ShapeType.ellipse, { x: x + 0.55, y: 2.3, w: 0.72, h: 0.72, fill: { color: i === 0 ? C.orange : C.amber }, line: { color: C.white } });
    body(s, String(i + 1), x + 0.82, 2.48, 0.15, 0.1, { size: 12, color: C.white, bold: true, margin: 0 });
    body(s, st[0], x, 3.3, 2.05, 0.28, { size: 16, color: C.dark, bold: true, margin: 0, valign: "mid" });
    body(s, st[1], x, 3.77, 2.05, 0.28, { size: 12.5, color: C.gray, margin: 0, valign: "mid" });
  });
  body(s, "Important : le QR code d'un affilie ne doit pas etre projete a toute la salle.", 2.25, 5.45, 8.4, 0.38, { size: 17, color: C.orange, bold: true, margin: 0 });
  footer(s, 16);
  addNotes(s, "Cette slide respecte la regle : chacun demande le QR au parrain, on ne diffuse pas un QR unique sur l'ecran.");
}

function slide17() {
  const s = pptx.addSlide(); addBg(s); logo(s); title(s, "A retenir", "Winelio est une methode simple pour transformer la confiance en opportunite suivie.");
  const takeaways = [
    ["1", "Je recommande mieux"],
    ["2", "Je suis le dossier"],
    ["3", "Je peux etre recompense"],
    ["4", "Je peux transmettre la methode"],
  ];
  takeaways.forEach((t, i) => {
    const y = 2.05 + i * 0.82;
    s.addShape(pptx.ShapeType.ellipse, { x: 1.05, y, w: 0.42, h: 0.42, fill: { color: C.orange }, line: { color: C.orange } });
    body(s, t[0], 1.2, y + 0.115, 0.12, 0.1, { size: 9.5, color: C.white, bold: true, margin: 0 });
    body(s, t[1], 1.72, y + 0.06, 4.7, 0.22, { size: 17, color: C.dark, bold: true, margin: 0 });
  });
  card(s, 7.4, 2.15, 3.8, 2.6, "FFF5F0", "FFD3C2");
  body(s, "Le bon reflexe", 7.75, 2.55, 2.6, 0.28, { size: 14, color: C.orange, bold: true, margin: 0 });
  body(s, "Commencer par 2 ou 3 recommandations de qualite, puis apprendre a expliquer le systeme.", 7.75, 3.05, 2.9, 0.72, { size: 17, color: C.dark, bold: true });
  footer(s, 17);
  addNotes(s, "Reboucler la presentation avant l'appel a l'action. Simple, propre, concret.");
}

function slide18() {
  const s = pptx.addSlide(); addBg(s, true); logo(s, true);
  s.addText("Inscrivez-vous des maintenant", { x: 0.78, y: 1.68, w: 8.2, h: 0.68, margin: 0, fontFace: "Aptos Display", fontSize: 39, bold: true, color: C.white, fit: "shrink" });
  s.addText("Demandez le QR code de parrainage a la personne qui vous invite.", { x: 0.82, y: 2.62, w: 7.6, h: 0.52, margin: 0, fontFace: "Aptos", fontSize: 21, color: "F2F4F5", fit: "shrink" });
  s.addShape(pptx.ShapeType.roundRect, { x: 0.86, y: 3.65, w: 4.25, h: 0.7, rectRadius: 0.08, fill: { color: C.orange }, line: { color: C.orange } });
  body(s, "Pas de QR code projete a l'ecran", 1.22, 3.91, 3.55, 0.14, { size: 14, color: C.white, bold: true, margin: 0 });
  s.addShape(pptx.ShapeType.chevron, { x: 9.15, y: 1.82, w: 1.25, h: 1.65, fill: { color: C.orange }, line: { color: C.orange } });
  s.addShape(pptx.ShapeType.chevron, { x: 10.03, y: 2.54, w: 1.25, h: 1.65, fill: { color: C.amber }, line: { color: C.amber } });
  s.addShape(pptx.ShapeType.chevron, { x: 10.88, y: 3.26, w: 1.25, h: 1.65, fill: { color: "FFFFFF", transparency: 20 }, line: { color: "FFFFFF", transparency: 100 } });
  footer(s, 18, true);
  addNotes(s, "Appel a l'action final. Thierry peut inviter les personnes interessees a venir le voir individuellement pour scanner son QR code.");
}

[
  slide1, slide2, slide3, slide4, slide5, slide6,
  slide7, slide8, slide9, slide10, slide11, slide12,
  slide13, slide14, slide15, slide16, slide17, slide18,
].forEach((fn) => fn());

await pptx.writeFile({ fileName: OUT });
console.log(OUT);
