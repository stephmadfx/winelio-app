"use client";

import { useState } from "react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { FlowAnnotationDialog, type FlowAnnotation } from "./FlowAnnotationDialog";

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
  { color: "#EBF5FB", stroke: "#2980B9", dashed: true, label: "Suivi automatique" },
  { color: "#EBF5FB", stroke: "#2980B9", label: "Décision (losange)" },
  { color: "#2D3436", label: "Commissions" },
  { color: "#FDECEA", stroke: "#E74C3C", label: "Fin négative" },
];

// ── Composant principal ───────────────────────────────────────────────────────

export function RecoFlowchart({ annotations: initialAnnotations }: { annotations: FlowAnnotation[] }) {
  const [annotations, setAnnotations] = useState<FlowAnnotation[]>(initialAnnotations);
  const [dialog, setDialog] = useState<{ nodeId: string; label: string } | null>(null);
  const ann = new Set(annotations.map((a) => a.node_id));
  const click: ClickHandler = (id, label) => setDialog({ nodeId: id, label });

  function handleAnnotationAdded(annotation: FlowAnnotation) {
    setAnnotations((prev) => [annotation, ...prev]);
  }

  function handleAnnotationDeleted(annotationId: string) {
    setAnnotations((prev) => prev.filter((a) => a.id !== annotationId));
  }

  return (
    <div className="flex flex-col h-full">
      {/* Canvas avec zoom/pan */}
      <div className="flex-1 overflow-hidden bg-[#FAFBFC] relative" style={{ minHeight: 500 }}>
        <TransformWrapper
          initialScale={0.75}
          minScale={0.2}
          maxScale={2}
          wheel={{ step: 0.08 }}
          centerOnInit
        >
          {({ zoomIn, zoomOut, resetTransform }) => (
            <>
              {/* Boutons de contrôle */}
              <div className="absolute bottom-4 left-4 z-10 flex flex-col gap-1">
                <button onClick={() => zoomIn()} className="w-8 h-8 bg-white border border-gray-200 rounded-md text-gray-600 hover:bg-gray-50 text-lg font-bold shadow-sm flex items-center justify-center">+</button>
                <button onClick={() => zoomOut()} className="w-8 h-8 bg-white border border-gray-200 rounded-md text-gray-600 hover:bg-gray-50 text-lg font-bold shadow-sm flex items-center justify-center">−</button>
                <button onClick={() => resetTransform()} title="Réinitialiser" className="w-8 h-8 bg-white border border-gray-200 rounded-md text-gray-500 hover:bg-gray-50 text-xs shadow-sm flex items-center justify-center">⊙</button>
              </div>

              <TransformComponent wrapperStyle={{ width: "100%", height: "100%" }}>
                <div className="p-8">
                  <svg
          viewBox="0 0 1060 1310"
          style={{ width: 980, display: "block" }}
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

          {/* Email non inscrit → suivi ouverture droite */}
          <line x1="780" y1="262" x2="780" y2="304" stroke="#636E72" strokeWidth={1.5} markerEnd="url(#arr)" />

          {/* Suivi ouverture gauche → suivi clic gauche */}
          <line x1="180" y1="344" x2="180" y2="386" stroke="#636E72" strokeWidth={1.5} markerEnd="url(#arr)" />

          {/* Suivi ouverture droite → revendication */}
          <line x1="780" y1="344" x2="780" y2="386" stroke="#636E72" strokeWidth={1.5} markerEnd="url(#arr)" />

          {/* Revendication → suivi clic droite */}
          <line x1="780" y1="430" x2="780" y2="472" stroke="#636E72" strokeWidth={1.5} markerEnd="url(#arr)" />

          {/* Suivi clic gauche → losange acceptation (via bord gauche) */}
          <line x1="180" y1="426" x2="180" y2="510" stroke="#636E72" strokeWidth={1.5} />
          <line x1="180" y1="510" x2="436" y2="510" stroke="#636E72" strokeWidth={1.5} markerEnd="url(#arr)" />

          {/* Suivi clic droite → losange acceptation (via bord droit) */}
          <line x1="820" y1="512" x2="820" y2="510" stroke="#636E72" strokeWidth={1.5} />
          <line x1="820" y1="510" x2="564" y2="510" stroke="#636E72" strokeWidth={1.5} markerEnd="url(#arr)" />

          {/* Losange acceptation → étape 2 (OUI) */}
          <line x1="500" y1="572" x2="500" y2="592" stroke="#636E72" strokeWidth={1.5} markerEnd="url(#arr)" />
          <text x="516" y="586" fontSize={11} fontWeight="700" fill="#27AE60">✅ OUI</text>

          {/* Losange acceptation → rejetée (NON) — vers la droite */}
          <line x1="562" y1="510" x2="808" y2="510" stroke="#E74C3C" strokeWidth={1.5} markerEnd="url(#arr-red)" />
          <text x="698" y="502" textAnchor="middle" fontSize={11} fontWeight="700" fill="#E74C3C">❌ NON</text>

          {/* Rejetée → email refus */}
          <line x1="883" y1="530" x2="883" y2="558" stroke="#E74C3C" strokeWidth={1.5} markerEnd="url(#arr-red)" />

          {/* Email refus → nouvelle reco possible */}
          <line x1="883" y1="602" x2="883" y2="626" stroke="#636E72" strokeWidth={1.5} markerEnd="url(#arr)" />

          {/* Étapes 2 → 3 → 4 → 5 */}
          <line x1="500" y1="636" x2="500" y2="666" stroke="#636E72" strokeWidth={1.5} markerEnd="url(#arr)" />
          <line x1="500" y1="710" x2="500" y2="740" stroke="#636E72" strokeWidth={1.5} markerEnd="url(#arr)" />
          <line x1="500" y1="784" x2="500" y2="814" stroke="#636E72" strokeWidth={1.5} markerEnd="url(#arr)" />

          {/* Étape 5 → losange devis */}
          <line x1="500" y1="858" x2="500" y2="866" stroke="#636E72" strokeWidth={1.5} markerEnd="url(#arr)" />

          {/* Losange devis → étape 6 (OUI) */}
          <line x1="500" y1="992" x2="500" y2="1018" stroke="#636E72" strokeWidth={1.5} markerEnd="url(#arr)" />
          <text x="516" y="1008" fontSize={11} fontWeight="700" fill="#27AE60">✅ OUI</text>

          {/* Losange devis → annulée (NON) */}
          <line x1="562" y1="930" x2="808" y2="930" stroke="#E74C3C" strokeWidth={1.5} markerEnd="url(#arr-red)" />
          <text x="698" y="922" textAnchor="middle" fontSize={11} fontWeight="700" fill="#E74C3C">❌ NON</text>

          {/* Étape 6 → commissions */}
          <line x1="500" y1="1066" x2="500" y2="1090" stroke="#636E72" strokeWidth={1.5} markerEnd="url(#arr)" />

          {/* Commissions → email commission */}
          <line x1="500" y1="1126" x2="500" y2="1144" stroke="#636E72" strokeWidth={1.5} markerEnd="url(#arr)" />

          {/* Email commission → étape 7 */}
          <line x1="500" y1="1178" x2="500" y2="1198" stroke="#636E72" strokeWidth={1.5} markerEnd="url(#arr)" />

          {/* Étape 7 → fin */}
          <line x1="500" y1="1240" x2="500" y2="1260" stroke="#636E72" strokeWidth={1.5} markerEnd="url(#arr)" />

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

          {/* Losange : acceptation */}
          <DiamondNode id="acceptation" cx={500} cy={510} r={62}
            stroke="#2980B9" label="Le professionnel" line2="accepte ?" onClick={click} hasBadge={ann.has("acceptation")} />

          {/* Rejetée (pro a refusé) */}
          <NegNode id="rejetee" x={808} y={490} w={150} h={40} label="❌ Rejetée" onClick={click} hasBadge={ann.has("rejetee")} />

          {/* Email refus → referrer */}
          <RectNode id="email-refus" x={763} y={558} w={240} h={44} fill="#F7931E" stroke="#F7931E"
            label='📧 "Reco déclinée" → Referrer'
            sublabel='CTA "Recommander un autre pro"'
            labelColor="white" onClick={click} hasBadge={ann.has("email-refus")} />

          {/* Nouvelle reco possible */}
          <PillNode id="nouvelle-reco" x={763} y={626} w={240} h={36} fill="#FF6B35"
            label="↩ Nouvelle recommandation possible" onClick={click} hasBadge={ann.has("nouvelle-reco")} />

          {/* Étape 2 */}
          <RectNode id="etape-2" x={300} y={592} w={400} h={44} fill="white" stroke="#2D3436"
            label="Étape 2 — Recommandation acceptée"
            sublabel="Identité du professionnel dévoilée au recommandeur"
            onClick={click} hasBadge={ann.has("etape-2")} />

          {/* Étape 3 */}
          <RectNode id="etape-3" x={300} y={666} w={400} h={44} fill="white" stroke="#2D3436"
            label="Étape 3 — Contact établi"
            sublabel="Le professionnel contacte le client"
            onClick={click} hasBadge={ann.has("etape-3")} />

          {/* Étape 4 */}
          <RectNode id="etape-4" x={300} y={740} w={400} h={44} fill="white" stroke="#2D3436"
            label="Étape 4 — Rendez-vous fixé"
            sublabel="Le professionnel fixe un rendez-vous avec le client"
            onClick={click} hasBadge={ann.has("etape-4")} />

          {/* Étape 5 */}
          <RectNode id="etape-5" x={300} y={814} w={400} h={44} fill="white" stroke="#FF6B35"
            label="Étape 5 — Devis soumis"
            sublabel="Le professionnel renseigne le montant du devis"
            labelColor="#FF6B35" onClick={click} hasBadge={ann.has("etape-5")} />

          {/* Losange : devis validé */}
          <DiamondNode id="devis" cx={500} cy={930} r={62}
            stroke="#FF6B35" label="Le recommandeur" line2="valide le devis ?"
            labelColor="#FF6B35" onClick={click} hasBadge={ann.has("devis")} />

          {/* Annulée */}
          <NegNode id="annulee" x={808} y={910} w={150} h={40} label="⏸ Annulée" onClick={click} hasBadge={ann.has("annulee")} />

          {/* Étape 6 */}
          <RectNode id="etape-6" x={300} y={1018} w={400} h={48} fill="#F0FFF4" stroke="#27AE60"
            label="Étape 6 — Devis validé"
            sublabel="Le recommandeur confirme · commissions PENDING → EARNED"
            labelColor="#27AE60" onClick={click} hasBadge={ann.has("etape-6")} />

          {/* Commissions */}
          <g style={{ cursor: "pointer" }} onClick={() => click("commissions", "💰 Commissions créées automatiquement — 5 niveaux MLM")}>
            <rect x={80} y={1090} width={840} height={36} rx={8} fill="#2D3436" filter="url(#sh)" />
            <text x={500} y={1104} textAnchor="middle" fontSize={11} fontWeight="700" fill="white">
              💰 Commissions déclenchées automatiquement — 5 niveaux MLM
            </text>
            <text x={500} y={1119} textAnchor="middle" fontSize={10} fill="rgba(255,255,255,0.65)">
              Recommandeur 60% · Niveaux 1–5 : 4% chacun (20%) · Affiliation 1% · Cashback pro 1% (Gains) · Winelio 14%
            </text>
            {ann.has("commissions") && <Badge x={914} y={1096} />}
          </g>

          {/* Email commission */}
          <g style={{ cursor: "pointer" }} onClick={() => click("email-commission", '📧 Email "Commission à régler" → Professionnel')}>
            <rect x={170} y={1144} width={660} height={34} rx={8} fill="#F7931E" filter="url(#sh)" />
            <text x={500} y={1158} textAnchor="middle" fontSize={11} fontWeight="700" fill="white">
              📧 Email &quot;Commission à régler&quot; → Professionnel (J+0 · Relance J+2 · Alerte J+4)
            </text>
            {ann.has("email-commission") && <Badge x={824} y={1150} />}
          </g>

          {/* Étape 7 */}
          <RectNode id="etape-7" x={300} y={1198} w={400} h={42} fill="white" stroke="#2D3436"
            label="Étape 7 — Paiement reçu"
            sublabel="Le client règle le professionnel pour la prestation"
            onClick={click} hasBadge={ann.has("etape-7")} />

          {/* Fin */}
          <PillNode id="fin" x={300} y={1260} w={400} h={42} fill="#27AE60"
            label="✅ Étape 8 — Affaire terminée" onClick={click} hasBadge={ann.has("fin")} />

        </svg>
                </div>
              </TransformComponent>
            </>
          )}
        </TransformWrapper>
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
