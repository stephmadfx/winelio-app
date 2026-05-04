"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { FlowAnnotationDialog, type FlowAnnotation } from "./FlowAnnotationDialog";
import { EmailPreviewDialog } from "./EmailPreviewDialog";

export type { FlowAnnotation };

type ClickHandler = (id: string, label: string) => void;

// ── Badge annotation ─────────────────────────────────────────────────────────

function Badge({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={11} fill="#FF6B35" />
      <text x={x} y={y + 4} textAnchor="middle" fontSize={11} fill="white">💬</text>
    </g>
  );
}

// ── Helpers nœuds SVG ─────────────────────────────────────────────────────────

function PillNode({ id, x, y, w, h, fill, label, onClick, hasBadge }: {
  id: string; x: number; y: number; w: number; h: number; fill: string;
  label: string; onClick: ClickHandler; hasBadge: boolean;
}) {
  return (
    <g style={{ cursor: "pointer" }} onClick={() => onClick(id, label)}>
      <rect x={x} y={y} width={w} height={h} rx={h / 2} fill={fill} filter="url(#sh)" />
      <text x={x + w / 2} y={y + h / 2 + 5} textAnchor="middle" fontSize={13} fontWeight="700" fill="white">{label}</text>
      {hasBadge && <Badge x={x + w - 6} y={y + 6} />}
    </g>
  );
}

function RectNode({ id, x, y, w, h, fill, stroke, dashed, label, sublabel, labelColor, onClick, hasBadge }: {
  id: string; x: number; y: number; w: number; h: number; fill: string; stroke: string;
  dashed?: boolean; label: string; sublabel?: string; labelColor?: string; onClick: ClickHandler; hasBadge: boolean;
}) {
  const cy = sublabel ? y + h / 2 - 5 : y + h / 2 + 5;
  return (
    <g style={{ cursor: "pointer" }} onClick={() => onClick(id, label)}>
      <rect x={x} y={y} width={w} height={h} rx={8} fill={fill} stroke={stroke} strokeWidth={1.5}
        strokeDasharray={dashed ? "5,3" : undefined} filter="url(#sh)" />
      <text x={x + w / 2} y={cy} textAnchor="middle" fontSize={12} fontWeight="700" fill={labelColor ?? "#2D3436"}>{label}</text>
      {sublabel && <text x={x + w / 2} y={y + h / 2 + 11} textAnchor="middle" fontSize={10} fill="#636E72">{sublabel}</text>}
      {hasBadge && <Badge x={x + w - 6} y={y + 6} />}
    </g>
  );
}

function DiamondNode({ id, cx, cy, r, stroke, label, line2, labelColor, onClick, hasBadge }: {
  id: string; cx: number; cy: number; r: number; stroke: string;
  label: string; line2?: string; labelColor?: string; onClick: ClickHandler; hasBadge: boolean;
}) {
  const pts = `${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`;
  return (
    <g style={{ cursor: "pointer" }} onClick={() => onClick(id, label)}>
      <polygon points={pts} fill="white" stroke={stroke} strokeWidth={2} filter="url(#sh)" />
      <text x={cx} y={line2 ? cy - 2 : cy + 5} textAnchor="middle" fontSize={11} fontWeight="700" fill={labelColor ?? "#2D3436"}>{label}</text>
      {line2 && <text x={cx} y={cy + 14} textAnchor="middle" fontSize={11} fontWeight="700" fill={labelColor ?? "#2D3436"}>{line2}</text>}
      {hasBadge && <Badge x={cx + r - 4} y={cy - r + 4} />}
    </g>
  );
}

function NegNode({ id, x, y, w, h, label, onClick, hasBadge }: {
  id: string; x: number; y: number; w: number; h: number;
  label: string; onClick: ClickHandler; hasBadge: boolean;
}) {
  return (
    <g style={{ cursor: "pointer" }} onClick={() => onClick(id, label)}>
      <rect x={x} y={y} width={w} height={h} rx={8} fill="#FDECEA" stroke="#E74C3C" strokeWidth={1.5} />
      <text x={x + w / 2} y={y + h / 2 + 5} textAnchor="middle" fontSize={12} fontWeight="700" fill="#C0392B">{label}</text>
      {hasBadge && <Badge x={x + w - 6} y={y + 6} />}
    </g>
  );
}

// ── Légende ───────────────────────────────────────────────────────────────────

const LEGEND_ITEMS = [
  { color: "#FF6B35", label: "Départ / Fin", pill: true },
  { color: "#fff", stroke: "#2D3436", label: "Étape / Action" },
  { color: "#F7931E", label: "Email automatique" },
  { color: "#F59E0B", label: "Relance automatique (cron)" },
  { color: "#EBF5FB", stroke: "#2980B9", dashed: true, label: "Suivi automatique" },
  { color: "#EBF5FB", stroke: "#2980B9", label: "Décision (losange)" },
  { color: "#2D3436", label: "Commissions" },
  { color: "#FDECEA", stroke: "#E74C3C", label: "Fin négative" },
];

// ── Composant principal ───────────────────────────────────────────────────────

const SVG_W = 1200;
const SVG_H = 1240;

// Nœuds email → type de preview
const EMAIL_NODE_TYPES: Record<string, string> = {
  "email-inscrit":    "new-reco-inscrit",
  "email-non-inscrit":"new-reco-scraped",
  "cron-relance":     "relance-scraped",
  "cron-alerte":      "alerte-recommandeur",
  "email-refus":      "reco-refusee",
  "email-commission": "commission",
  "pro-followup":     "pro-followup",
  "pro-abandoned":    "pro-abandoned",
  "etape-2":          "step-2",
  "etape-3":          "step-3",
  "etape-4":          "step-4",
  "etape-5":          "step-5",
  "etape-6":          "step-6",
};
const MIN_SCALE = 0.15;
const MAX_SCALE = 3;
const DRAG_THRESHOLD = 4;

export function RecoFlowchart({ annotations: initialAnnotations }: { annotations: FlowAnnotation[] }) {
  const [annotations, setAnnotations] = useState<FlowAnnotation[]>(initialAnnotations);
  const [dialog, setDialog] = useState<{ nodeId: string; label: string } | null>(null);
  const [emailPreview, setEmailPreview] = useState<string | null>(null);
  const ann = new Set(annotations.map((a) => a.node_id));

  // Pan/zoom state
  const containerRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 20, y: 20 });
  const [scale, setScale] = useState(0.65);
  const scaleRef = useRef(0.65);
  const panRef = useRef({ x: 20, y: 20 });
  const dragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const moved = useRef(false);

  // Sync refs with state (for use in event callbacks)
  useEffect(() => { scaleRef.current = scale; }, [scale]);
  useEffect(() => { panRef.current = pan; }, [pan]);

  // Centre automatiquement au premier rendu
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const s = Math.min(width / SVG_W, height / SVG_H, 0.75);
    const x = (width - SVG_W * s) / 2;
    const y = (height - SVG_H * s) / 2;
    setPan({ x, y });
    setScale(s);
  }, []);

  const applyZoom = useCallback((factor: number, cx: number, cy: number) => {
    const s = scaleRef.current;
    const p = panRef.current;
    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, s * factor));
    const ratio = newScale / s;
    setPan({ x: cx - (cx - p.x) * ratio, y: cy - (cy - p.y) * ratio });
    setScale(newScale);
  }, []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    // deltaY négatif = scroll vers le haut = zoom avant
    const factor = e.deltaY < 0 ? 1.06 : 1 / 1.06;
    applyZoom(factor, e.clientX - rect.left, e.clientY - rect.top);
  }, [applyZoom]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    dragging.current = true;
    moved.current = false;
    lastPos.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    if (!moved.current && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
      moved.current = true;
    }
    if (moved.current) {
      setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }));
    }
    lastPos.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onMouseUp = useCallback(() => { dragging.current = false; }, []);

  // Clic sur un nœud : email → preview, sinon → annotation
  const click: ClickHandler = (id, label) => {
    if (moved.current) return;
    const emailType = EMAIL_NODE_TYPES[id];
    if (emailType) {
      setEmailPreview(emailType);
    } else {
      setDialog({ nodeId: id, label });
    }
  };

  function handleAnnotationAdded(annotation: FlowAnnotation) {
    setAnnotations((prev) => [annotation, ...prev]);
  }

  function handleAnnotationDeleted(annotationId: string) {
    setAnnotations((prev) => prev.filter((a) => a.id !== annotationId));
  }

  const reset = () => {
    const el = containerRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const s = Math.min(width / SVG_W, height / SVG_H, 0.75);
    setPan({ x: (width - SVG_W * s) / 2, y: (height - SVG_H * s) / 2 });
    setScale(s);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Canvas avec zoom/pan */}
      <div
        ref={containerRef}
        className="flex-1 bg-[#FAFBFC] relative overflow-hidden select-none"
        style={{ minHeight: 500, cursor: dragging.current ? "grabbing" : "grab", touchAction: "none" }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onWheel={onWheel}
      >
        {/* Boutons de contrôle */}
        <div className="absolute bottom-4 left-4 z-10 flex flex-col gap-1">
          <button onMouseDown={e => e.stopPropagation()} onClick={() => { const rect = containerRef.current?.getBoundingClientRect(); if (rect) applyZoom(1.2, rect.width / 2, rect.height / 2); }} className="w-8 h-8 bg-white border border-gray-200 rounded-md text-gray-600 hover:bg-gray-50 text-lg font-bold shadow-sm flex items-center justify-center">+</button>
          <button onMouseDown={e => e.stopPropagation()} onClick={() => { const rect = containerRef.current?.getBoundingClientRect(); if (rect) applyZoom(1 / 1.2, rect.width / 2, rect.height / 2); }} className="w-8 h-8 bg-white border border-gray-200 rounded-md text-gray-600 hover:bg-gray-50 text-lg font-bold shadow-sm flex items-center justify-center">−</button>
          <button onMouseDown={e => e.stopPropagation()} onClick={reset} title="Réinitialiser" className="w-8 h-8 bg-white border border-gray-200 rounded-md text-gray-500 hover:bg-gray-50 text-xs shadow-sm flex items-center justify-center">⊙</button>
        </div>

        <svg
          style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", overflow: "visible" }}
          xmlns="http://www.w3.org/2000/svg"
          fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        >
          <g transform={`translate(${pan.x} ${pan.y}) scale(${scale})`}>
          <svg
          viewBox="0 0 1200 1240"
          style={{ width: 1100, display: "block" }}
          xmlns="http://www.w3.org/2000/svg"
          fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        >
          <defs>
            <marker id="arr" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="#636E72" />
            </marker>
            <marker id="arr-red" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="#E74C3C" />
            </marker>
            <filter id="sh">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.08" />
            </filter>
          </defs>

          {/* ══ FLÈCHES ══ */}

          {/* Départ → losange inscrit */}
          <line x1="500" y1="58" x2="500" y2="86" stroke="#636E72" strokeWidth={1.5} markerEnd="url(#arr)" />

          {/* Losange inscrit → email inscrit (gauche) */}
          <line x1="438" y1="148" x2="180" y2="148" stroke="#636E72" strokeWidth={1.5} />
          <line x1="180" y1="148" x2="180" y2="218" stroke="#636E72" strokeWidth={1.5} markerEnd="url(#arr)" />
          <text x="305" y="140" textAnchor="middle" fontSize={11} fontWeight="700" fill="#27AE60">✅ Déjà inscrit</text>

          {/* Losange inscrit → email non inscrit (droite) */}
          <line x1="562" y1="148" x2="780" y2="148" stroke="#636E72" strokeWidth={1.5} />
          <line x1="780" y1="148" x2="780" y2="218" stroke="#636E72" strokeWidth={1.5} markerEnd="url(#arr)" />
          <text x="674" y="140" textAnchor="middle" fontSize={11} fontWeight="700" fill="#E74C3C">❌ Non inscrit</text>

          {/* Email inscrit → suivi ouverture gauche */}
          <line x1="180" y1="262" x2="180" y2="304" stroke="#636E72" strokeWidth={1.5} markerEnd="url(#arr)" />

          {/* Email non inscrit → suivi ouverture (flux principal linéaire) */}
          <line x1="780" y1="262" x2="780" y2="304" stroke="#636E72" strokeWidth={1.5} markerEnd="url(#arr)" />

          {/* Note cron → email non inscrit (trait pointillé) */}
          <line x1="950" y1="250" x2="962" y2="250" stroke="#F59E0B" strokeWidth={1.5} strokeDasharray="4,3" />

          {/* Suivi ouverture droite → revendication */}
          <line x1="780" y1="344" x2="780" y2="386" stroke="#636E72" strokeWidth={1.5} markerEnd="url(#arr)" />

          {/* Suivi ouverture gauche → suivi clic gauche */}
          <line x1="180" y1="344" x2="180" y2="386" stroke="#636E72" strokeWidth={1.5} markerEnd="url(#arr)" />

          {/* Revendication → suivi clic droite */}
          <line x1="780" y1="430" x2="780" y2="472" stroke="#636E72" strokeWidth={1.5} markerEnd="url(#arr)" />

          {/* Inscrit (clic-inscrit) → losange — descente directe (losange sous la colonne gauche) */}
          <line x1="180" y1="426" x2="180" y2="450" stroke="#636E72" strokeWidth={1.5} markerEnd="url(#arr)" />

          {/* Non-inscrit (clic-non-inscrit) → Étape 2 — descend puis rejoint le centre par le haut */}
          <line x1="820" y1="512" x2="820" y2="574" stroke="#636E72" strokeWidth={1.5} />
          <line x1="820" y1="574" x2="500" y2="574" stroke="#636E72" strokeWidth={1.5} />
          <line x1="500" y1="574" x2="500" y2="638" stroke="#636E72" strokeWidth={1.5} markerEnd="url(#arr)" />
          <text x="660" y="566" textAnchor="middle" fontSize={10} fontWeight="700" fill="#27AE60">✅ Revendication = Acceptation</text>

          {/* Losange acceptation → étape 2 (OUI) — va à droite puis descend au bord gauche d'Étape 2 */}
          <line x1="242" y1="512" x2="300" y2="512" stroke="#636E72" strokeWidth={1.5} />
          <line x1="300" y1="512" x2="300" y2="638" stroke="#636E72" strokeWidth={1.5} markerEnd="url(#arr)" />
          <text x="258" y="504" fontSize={11} fontWeight="700" fill="#27AE60">✅ OUI</text>

          {/* Losange acceptation → rejetée (NON) — descend dans la colonne gauche */}
          <line x1="180" y1="574" x2="180" y2="644" stroke="#E74C3C" strokeWidth={1.5} markerEnd="url(#arr-red)" />
          <text x="196" y="614" fontSize={11} fontWeight="700" fill="#E74C3C">❌ NON</text>

          {/* Rejetée → email refus */}
          <line x1="110" y1="684" x2="110" y2="706" stroke="#E74C3C" strokeWidth={1.5} markerEnd="url(#arr-red)" />

          {/* Email refus → nouvelle reco possible */}
          <line x1="110" y1="750" x2="110" y2="772" stroke="#636E72" strokeWidth={1.5} markerEnd="url(#arr)" />

          {/* Étapes 2 → 3 → 4 → 5 */}
          <line x1="500" y1="682" x2="500" y2="712" stroke="#636E72" strokeWidth={1.5} markerEnd="url(#arr)" />
          <line x1="500" y1="756" x2="500" y2="786" stroke="#636E72" strokeWidth={1.5} markerEnd="url(#arr)" />
          <line x1="500" y1="830" x2="500" y2="860" stroke="#636E72" strokeWidth={1.5} markerEnd="url(#arr)" />

          {/* Étape 5 → étape 6 (direct, plus de losange) */}
          <line x1="500" y1="904" x2="500" y2="930" stroke="#636E72" strokeWidth={1.5} markerEnd="url(#arr)" />

          {/* Étape 6 → commissions */}
          <line x1="500" y1="978" x2="500" y2="1002" stroke="#636E72" strokeWidth={1.5} markerEnd="url(#arr)" />

          {/* Étape 6 → email "Commission à régler" (déclenché en parallèle des commissions MLM) */}
          <line x1="700" y1="954" x2="830" y2="954" stroke="#F7931E" strokeWidth={1.5} strokeDasharray="4,3" markerEnd="url(#arr)" />

          {/* Commissions → étape 7 (flux principal direct) */}
          <line x1="500" y1="1038" x2="500" y2="1056" stroke="#636E72" strokeWidth={1.5} markerEnd="url(#arr)" />

          {/* Étape 7 → fin */}
          <line x1="500" y1="1100" x2="500" y2="1172" stroke="#636E72" strokeWidth={1.5} markerEnd="url(#arr)" />

          {/* ══ NŒUDS ══ */}

          {/* Départ */}
          <PillNode id="depart" x={270} y={18} w={460} h={40} fill="#FF6B35"
            label="✨ Le recommandeur crée une recommandation" onClick={click} hasBadge={ann.has("depart")} />

          {/* Losange : professionnel inscrit ? */}
          <DiamondNode id="pro-inscrit" cx={500} cy={148} r={62}
            stroke="#2980B9" label="Professionnel" line2="déjà inscrit ?" onClick={click} hasBadge={ann.has("pro-inscrit")} />

          {/* Email inscrit */}
          <RectNode id="email-inscrit" x={50} y={218} w={260} h={44} fill="#F7931E" stroke="#F7931E"
            label='📧 "Nouvelle recommandation"' sublabel='Email connexion + email pro (si renseigné)'
            labelColor="white" onClick={click} hasBadge={ann.has("email-inscrit")} />

          {/* Email non inscrit */}
          <RectNode id="email-non-inscrit" x={690} y={218} w={260} h={44} fill="#F7931E" stroke="#F7931E"
            label='📧 "Un client vous recommande"' sublabel='Bouton "Revendiquer ma fiche"'
            labelColor="white" onClick={click} hasBadge={ann.has("email-non-inscrit")} />

          {/* Suivi ouverture inscrit */}
          <RectNode id="ouverture-inscrit" x={50} y={304} w={260} h={40} fill="#EBF5FB" stroke="#2980B9" dashed
            label="👁 Email ouvert" sublabel="email_opened_at enregistré (1ère fois)"
            labelColor="#2980B9" onClick={click} hasBadge={ann.has("ouverture-inscrit")} />

          {/* ── Chaîne cron automatique (à droite de la colonne non-inscrit) ── */}

          {/* Connecteur depuis l'email non-inscrit */}
          <line x1="950" y1="240" x2="962" y2="240" stroke="#F59E0B" strokeWidth={1.5} strokeDasharray="4,3" />

          {/* Étape cron 1 : condition timing H+12 */}
          <RectNode id="cron-condition-1" x={962} y={218} w={210} h={32} fill="#FFFBEB" stroke="#F59E0B" dashed
            label="⏱ H+12 · si email non ouvert"
            labelColor="#92400E" onClick={click} hasBadge={ann.has("cron-condition-1")} />

          {/* Flèche → relance */}
          <line x1="1067" y1="250" x2="1067" y2="268" stroke="#F59E0B" strokeWidth={1.5} markerEnd="url(#arr)" />

          {/* Étape cron 2 : email de relance → pro */}
          <RectNode id="cron-relance" x={962} y={268} w={210} h={42} fill="#F59E0B" stroke="#F59E0B"
            label="📧 Relance → pro scrappé"
            sublabel="1 envoi max · scraped_reminder_sent_at"
            labelColor="white" onClick={click} hasBadge={ann.has("cron-relance")} />

          {/* Flèche → condition H+36 */}
          <line x1="1067" y1="310" x2="1067" y2="328" stroke="#F59E0B" strokeWidth={1.5} markerEnd="url(#arr)" />

          {/* Étape cron 3 : condition timing H+36 */}
          <RectNode id="cron-condition-2" x={962} y={328} w={210} h={32} fill="#FFFBEB" stroke="#F59E0B" dashed
            label="⏱ H+36 · si toujours non ouvert"
            labelColor="#92400E" onClick={click} hasBadge={ann.has("cron-condition-2")} />

          {/* Flèche → alerte recommandeur */}
          <line x1="1067" y1="360" x2="1067" y2="378" stroke="#E74C3C" strokeWidth={1.5} markerEnd="url(#arr-red)" />

          {/* Étape cron 4 : alerte recommandeur */}
          <RectNode id="cron-alerte" x={962} y={378} w={210} h={44} fill="#F7931E" stroke="#F7931E"
            label="📭 Alerte → recommandeur"
            sublabel='CTA "Recommander un autre pro"'
            labelColor="white" onClick={click} hasBadge={ann.has("cron-alerte")} />

          {/* Suivi ouverture non inscrit */}
          <RectNode id="ouverture-non-inscrit" x={690} y={304} w={260} h={40} fill="#EBF5FB" stroke="#2980B9" dashed
            label="👁 Email ouvert" sublabel="email_opened_at enregistré (1ère fois)"
            labelColor="#2980B9" onClick={click} hasBadge={ann.has("ouverture-non-inscrit")} />

          {/* Suivi clic inscrit */}
          <RectNode id="clic-inscrit" x={50} y={386} w={260} h={40} fill="#EBF5FB" stroke="#2980B9" dashed
            label="👆 Bouton cliqué dans l'email" sublabel="email_clicked_at · redirection vers la reco"
            labelColor="#2980B9" onClick={click} hasBadge={ann.has("clic-inscrit")} />

          {/* Revendication de fiche */}
          <RectNode id="revendication" x={690} y={386} w={260} h={44} fill="white" stroke="#2D3436"
            label="🔗 Revendication de fiche" sublabel="Le professionnel s'inscrit et valide sa fiche"
            onClick={click} hasBadge={ann.has("revendication")} />

          {/* Suivi clic non inscrit */}
          <RectNode id="clic-non-inscrit" x={690} y={472} w={260} h={40} fill="#EBF5FB" stroke="#2980B9" dashed
            label="👆 Bouton cliqué dans l'email" sublabel="email_clicked_at · déclenche la revendication"
            labelColor="#2980B9" onClick={click} hasBadge={ann.has("clic-non-inscrit")} />

          {/* Losange : acceptation — dans la colonne gauche, sous clic-inscrit */}
          <DiamondNode id="acceptation" cx={180} cy={512} r={62}
            stroke="#2980B9" label="Le pro" line2="accepte ?" onClick={click} hasBadge={ann.has("acceptation")} />

          {/* Rejetée — descend sous le losange, colonne gauche */}
          <NegNode id="rejetee" x={10} y={644} w={200} h={40} label="❌ Rejetée" onClick={click} hasBadge={ann.has("rejetee")} />

          {/* Email refus → recommandeur */}
          <RectNode id="email-refus" x={10} y={706} w={200} h={44} fill="#F7931E" stroke="#F7931E"
            label='📧 Reco déclinée → Recommandeur'
            sublabel='CTA "Recommander un autre pro"'
            labelColor="white" onClick={click} hasBadge={ann.has("email-refus")} />

          {/* Nouvelle reco possible */}
          <PillNode id="nouvelle-reco" x={10} y={772} w={200} h={36} fill="#FF6B35"
            label="↩ Nouvelle reco possible" onClick={click} hasBadge={ann.has("nouvelle-reco")} />

          {/* Étape 2 */}
          <RectNode id="etape-2" x={300} y={638} w={400} h={44} fill="white" stroke="#2D3436"
            label="Étape 2 — Recommandation acceptée"
            sublabel="Identité du pro dévoilée · ✉️ email recommandeur"
            onClick={click} hasBadge={ann.has("etape-2")} />

          {/* Étape 3 */}
          <RectNode id="etape-3" x={300} y={712} w={400} h={44} fill="white" stroke="#2D3436"
            label="Étape 3 — Contact établi"
            sublabel="Le pro contacte le client · ✉️ email recommandeur"
            onClick={click} hasBadge={ann.has("etape-3")} />

          {/* Étape 4 */}
          <RectNode id="etape-4" x={300} y={786} w={400} h={44} fill="white" stroke="#2D3436"
            label="Étape 4 — Rendez-vous fixé"
            sublabel="Le pro fixe un rendez-vous · ✉️ email recommandeur"
            onClick={click} hasBadge={ann.has("etape-4")} />

          {/* Étape 5 */}
          <RectNode id="etape-5" x={300} y={860} w={400} h={44} fill="white" stroke="#2D3436"
            label="Étape 5 — Devis soumis"
            sublabel="Le pro renseigne le montant · ✉️ email recommandeur"
            onClick={click} hasBadge={ann.has("etape-5")} />

          {/* ── Branche relances pro automatiques (à droite des étapes 2/4/5) ── */}

          {/* Connecteurs pointillés étapes 2/4/5 → pro-followup */}
          <line x1="700" y1="660" x2="780" y2="660" stroke="#F59E0B" strokeWidth={1.5} strokeDasharray="4,3" />
          <line x1="700" y1="808" x2="780" y2="808" stroke="#F59E0B" strokeWidth={1.5} strokeDasharray="4,3" />
          <line x1="700" y1="882" x2="780" y2="882" stroke="#F59E0B" strokeWidth={1.5} strokeDasharray="4,3" />
          <line x1="780" y1="660" x2="780" y2="882" stroke="#F59E0B" strokeWidth={1.5} strokeDasharray="4,3" />

          {/* Flèche pointillée → bloc relance */}
          <line x1="780" y1="770" x2="800" y2="770" stroke="#F59E0B" strokeWidth={1.5} strokeDasharray="4,3" markerEnd="url(#arr)" />

          {/* Bloc Relances pro auto */}
          <RectNode id="pro-followup" x={800} y={745} w={300} h={50} fill="#F59E0B" stroke="#F59E0B"
            label="📧 Relances pro automatiques (3 cycles)"
            sublabel="Étape 2/4/5 · T+24h / +48h / +5j · max 5 reports"
            labelColor="white" onClick={click} hasBadge={ann.has("pro-followup")} />

          {/* Flèche → abandoned */}
          <line x1="950" y1="795" x2="950" y2="850" stroke="#E74C3C" strokeWidth={1.5} markerEnd="url(#arr-red)" />
          <text x="965" y="828" fontSize={10} fontWeight="700" fill="#E74C3C">3× sans réponse</text>

          {/* Bloc Pro abandoned → email recommandeur */}
          <RectNode id="pro-abandoned" x={800} y={850} w={300} h={50} fill="#FDECEA" stroke="#E74C3C"
            label="📭 Abandonné par le pro"
            sublabel="abandoned_by_pro_at posé · email soft → recommandeur"
            labelColor="#E74C3C" onClick={click} hasBadge={ann.has("pro-abandoned")} />

          {/* Email "Commission à régler" → Pro (déclenché PAR la complétion étape 6) */}
          <g style={{ cursor: "pointer" }} onClick={() => click("email-commission", '📧 Email "Commission à régler" → Professionnel')}>
            <rect x={830} y={930} width={340} height={48} rx={8} fill="#F7931E" filter="url(#sh)" />
            <text x={1000} y={952} textAnchor="middle" fontSize={11} fontWeight="700" fill="white">
              📧 &quot;Commission à régler&quot; → Pro
            </text>
            <text x={1000} y={968} textAnchor="middle" fontSize={9} fill="rgba(255,255,255,0.85)">
              J+0 · Relance J+2 · Alerte J+4 · Stripe Checkout
            </text>
            {ann.has("email-commission") && <Badge x={1164} y={936} />}
          </g>

          {/* Étape 6 — Travaux terminés + Paiement reçu (déclenche commissions MLM + facture Stripe au pro) */}
          <RectNode id="etape-6" x={300} y={930} w={400} h={48} fill="#FFF5F0" stroke="#FF6B35"
            label="Étape 6 — Travaux terminés + Paiement reçu"
            sublabel="Commissions MLM + facture Stripe au pro · recommandeur notifié"
            labelColor="#FF6B35" onClick={click} hasBadge={ann.has("etape-6")} />

          {/* Commissions */}
          <g style={{ cursor: "pointer" }} onClick={() => click("commissions", "💰 Commissions créées automatiquement — 5 niveaux MLM")}>
            <rect x={80} y={1002} width={840} height={36} rx={8} fill="#2D3436" filter="url(#sh)" />
            <text x={500} y={1016} textAnchor="middle" fontSize={11} fontWeight="700" fill="white">
              💰 Commissions déclenchées automatiquement — 5 niveaux MLM
            </text>
            <text x={500} y={1031} textAnchor="middle" fontSize={10} fill="rgba(255,255,255,0.65)">
              Recommandeur 60% · Niveaux 1–5 : 4% chacun (20%) · Affiliation 1% · Cashback pro 1% (Gains) · Winelio 14%
            </text>
            {ann.has("commissions") && <Badge x={914} y={1008} />}
          </g>

          {/* Étape 7 — Affaire terminée (clôture administrative, sans effet financier) */}
          <RectNode id="etape-7" x={300} y={1056} w={400} h={42} fill="white" stroke="#2D3436"
            label="Étape 7 — Affaire terminée"
            sublabel="Clôture administrative (sans effet financier)"
            onClick={click} hasBadge={ann.has("etape-7")} />

          {/* Fin */}
          <PillNode id="fin" x={300} y={1172} w={400} h={42} fill="#27AE60"
            label="✅ Recommandation complétée" onClick={click} hasBadge={ann.has("fin")} />

          </svg>
          </g>
        </svg>
      </div>

      {/* Légende */}
      <div className="flex flex-wrap gap-4 px-6 py-3 border-t border-gray-100 bg-white shrink-0">
        {LEGEND_ITEMS.map((item) => (
          <div key={item.label} className="flex items-center gap-1.5 text-xs text-gray-500">
            <span
              className="w-3.5 h-3.5 flex-shrink-0"
              style={{
                background: item.color,
                border: item.stroke ? `2px ${item.dashed ? "dashed" : "solid"} ${item.stroke}` : undefined,
                borderRadius: item.pill ? "50%" : 3,
              }}
            />
            {item.label}
          </div>
        ))}
        <div className="ml-auto">
          <span className="text-xs bg-[#FFF5F0] border border-[#FF6B35] text-[#FF6B35] font-bold rounded-full px-2 py-0.5">
            💬 = note administrateur
          </span>
        </div>
      </div>

      {/* Dialog preview email */}
      {emailPreview && (
        <EmailPreviewDialog
          emailType={emailPreview}
          onClose={() => setEmailPreview(null)}
        />
      )}

      {/* Dialog annotations */}
      {dialog && (
        <FlowAnnotationDialog
          open
          onClose={() => setDialog(null)}
          nodeId={dialog.nodeId}
          nodeLabel={dialog.label}
          annotations={annotations}
          onAnnotationAdded={handleAnnotationAdded}
          onAnnotationDeleted={handleAnnotationDeleted}
        />
      )}
    </div>
  );
}
