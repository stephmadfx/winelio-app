"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { FlowAnnotationDialog, type FlowAnnotation } from "./FlowAnnotationDialog";
import { EmailPreviewDialog } from "./EmailPreviewDialog";

type ClickHandler = (id: string, label: string) => void;

function Badge({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={11} fill="#FF6B35" />
      <text x={x} y={y + 4} textAnchor="middle" fontSize={11} fill="white">💬</text>
    </g>
  );
}

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

function DiamondNode({ id, cx, cy, r, stroke, label, line2, onClick, hasBadge }: {
  id: string; cx: number; cy: number; r: number; stroke: string;
  label: string; line2?: string; onClick: ClickHandler; hasBadge: boolean;
}) {
  const pts = `${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`;
  return (
    <g style={{ cursor: "pointer" }} onClick={() => onClick(id, label)}>
      <polygon points={pts} fill="white" stroke={stroke} strokeWidth={2} filter="url(#sh)" />
      <text x={cx} y={line2 ? cy - 2 : cy + 5} textAnchor="middle" fontSize={11} fontWeight="700" fill="#2D3436">{label}</text>
      {line2 && <text x={cx} y={cy + 14} textAnchor="middle" fontSize={11} fontWeight="700" fill="#2D3436">{line2}</text>}
      {hasBadge && <Badge x={cx + r - 4} y={cy - r + 4} />}
    </g>
  );
}

const LEGEND_ITEMS = [
  { color: "#FF6B35", label: "Départ / Étape clé", pill: true },
  { color: "#fff", stroke: "#2D3436", label: "Étape utilisateur" },
  { color: "#F7931E", label: "Email automatique" },
  { color: "#F59E0B", label: "Relance / cron" },
  { color: "#EBF5FB", stroke: "#2980B9", dashed: true, label: "Suivi auto" },
  { color: "#EBF5FB", stroke: "#2980B9", label: "Décision" },
];

const SVG_W = 1200;
const SVG_H = 1320;
const MIN_SCALE = 0.15;
const MAX_SCALE = 3;
const DRAG_THRESHOLD = 4;

const EMAIL_NODE_TYPES: Record<string, string> = {
  "email-otp":           "auth-otp",
  "email-welcome":       "welcome",
  "email-new-referral":  "new-referral",
  "email-new-pro":       "new-pro-in-network",
  "email-pro-onboarding":"pro-onboarding",
  "email-siret-reminder":"siret-reminder",
  "email-cgu-signed":    "cgu-signed",
};

export function ProLifecycleFlowchart({ annotations: initialAnnotations }: { annotations: FlowAnnotation[] }) {
  const [annotations, setAnnotations] = useState<FlowAnnotation[]>(initialAnnotations);
  const [dialog, setDialog] = useState<{ nodeId: string; label: string } | null>(null);
  const [emailPreview, setEmailPreview] = useState<string | null>(null);
  const ann = new Set(annotations.map((a) => a.node_id));

  const containerRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 20, y: 20 });
  const [scale, setScale] = useState(0.65);
  const scaleRef = useRef(0.65);
  const panRef = useRef({ x: 20, y: 20 });
  const dragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const moved = useRef(false);

  useEffect(() => { scaleRef.current = scale; }, [scale]);
  useEffect(() => { panRef.current = pan; }, [pan]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const s = Math.min(width / SVG_W, height / SVG_H, 0.7);
    setPan({ x: (width - SVG_W * s) / 2, y: (height - SVG_H * s) / 2 });
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
    if (moved.current) setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }));
    lastPos.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onMouseUp = useCallback(() => { dragging.current = false; }, []);

  const click: ClickHandler = (id, label) => {
    if (moved.current) return;
    const emailType = EMAIL_NODE_TYPES[id];
    if (emailType) setEmailPreview(emailType);
    else setDialog({ nodeId: id, label });
  };

  function handleAnnotationAdded(a: FlowAnnotation) { setAnnotations((p) => [a, ...p]); }
  function handleAnnotationDeleted(id: string)      { setAnnotations((p) => p.filter((a) => a.id !== id)); }

  const reset = () => {
    const el = containerRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const s = Math.min(width / SVG_W, height / SVG_H, 0.7);
    setPan({ x: (width - SVG_W * s) / 2, y: (height - SVG_H * s) / 2 });
    setScale(s);
  };

  return (
    <div className="flex flex-col h-full">
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
        <div className="absolute bottom-4 left-4 z-10 flex flex-col gap-1">
          <button onMouseDown={e => e.stopPropagation()} onClick={() => { const r = containerRef.current?.getBoundingClientRect(); if (r) applyZoom(1.2, r.width / 2, r.height / 2); }} className="w-8 h-8 bg-white border border-gray-200 rounded-md text-gray-600 hover:bg-gray-50 text-lg font-bold shadow-sm flex items-center justify-center">+</button>
          <button onMouseDown={e => e.stopPropagation()} onClick={() => { const r = containerRef.current?.getBoundingClientRect(); if (r) applyZoom(1 / 1.2, r.width / 2, r.height / 2); }} className="w-8 h-8 bg-white border border-gray-200 rounded-md text-gray-600 hover:bg-gray-50 text-lg font-bold shadow-sm flex items-center justify-center">−</button>
          <button onMouseDown={e => e.stopPropagation()} onClick={reset} className="w-8 h-8 bg-white border border-gray-200 rounded-md text-gray-500 hover:bg-gray-50 text-xs shadow-sm flex items-center justify-center">⊙</button>
        </div>

        <svg
          style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", overflow: "visible" }}
          xmlns="http://www.w3.org/2000/svg"
          fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        >
          <g transform={`translate(${pan.x} ${pan.y}) scale(${scale})`}>
            <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} style={{ width: 1100, display: "block" }} xmlns="http://www.w3.org/2000/svg">
              <defs>
                <marker id="arrp" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                  <polygon points="0 0, 10 3.5, 0 7" fill="#636E72" />
                </marker>
                <marker id="arrp-orange" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                  <polygon points="0 0, 10 3.5, 0 7" fill="#F59E0B" />
                </marker>
                <filter id="sh"><feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.08" /></filter>
              </defs>

              {/* ══ FLÈCHES ══ */}

              {/* Départ → OTP */}
              <line x1="500" y1="58" x2="500" y2="86" stroke="#636E72" strokeWidth={1.5} markerEnd="url(#arrp)" />
              {/* OTP → email OTP envoyé */}
              <line x1="500" y1="148" x2="500" y2="170" stroke="#636E72" strokeWidth={1.5} markerEnd="url(#arrp)" />
              {/* Email OTP → entrée code */}
              <line x1="500" y1="226" x2="500" y2="248" stroke="#636E72" strokeWidth={1.5} markerEnd="url(#arrp)" />
              {/* Entrée code → décision sponsor */}
              <line x1="500" y1="304" x2="500" y2="334" stroke="#636E72" strokeWidth={1.5} markerEnd="url(#arrp)" />

              {/* Décision sponsor → assignation founder (gauche) */}
              <line x1="438" y1="396" x2="200" y2="396" stroke="#636E72" strokeWidth={1.5} />
              <line x1="200" y1="396" x2="200" y2="430" stroke="#636E72" strokeWidth={1.5} markerEnd="url(#arrp)" />
              <text x="320" y="388" textAnchor="middle" fontSize={11} fontWeight="700" fill="#E74C3C">❌ Pas de code</text>

              {/* Décision sponsor → sponsor du code (droite) */}
              <line x1="562" y1="396" x2="800" y2="396" stroke="#636E72" strokeWidth={1.5} />
              <line x1="800" y1="396" x2="800" y2="430" stroke="#636E72" strokeWidth={1.5} markerEnd="url(#arrp)" />
              <text x="680" y="388" textAnchor="middle" fontSize={11} fontWeight="700" fill="#27AE60">✅ Code parrain</text>

              {/* Founder rotation → profil créé */}
              <line x1="200" y1="474" x2="200" y2="506" stroke="#636E72" strokeWidth={1.5} />
              <line x1="200" y1="506" x2="500" y2="506" stroke="#636E72" strokeWidth={1.5} />
              {/* Sponsor du code → profil créé */}
              <line x1="800" y1="474" x2="800" y2="506" stroke="#636E72" strokeWidth={1.5} />
              <line x1="800" y1="506" x2="500" y2="506" stroke="#636E72" strokeWidth={1.5} />
              {/* Convergence → profil créé */}
              <line x1="500" y1="506" x2="500" y2="538" stroke="#636E72" strokeWidth={1.5} markerEnd="url(#arrp)" />

              {/* Profil créé → email welcome + email parrain */}
              <line x1="500" y1="594" x2="500" y2="624" stroke="#636E72" strokeWidth={1.5} markerEnd="url(#arrp)" />
              {/* Email welcome (gauche) */}
              <line x1="500" y1="624" x2="200" y2="624" stroke="#F7931E" strokeWidth={1.5} strokeDasharray="4,3" />
              <line x1="200" y1="624" x2="200" y2="650" stroke="#F7931E" strokeWidth={1.5} strokeDasharray="4,3" markerEnd="url(#arrp)" />
              {/* Email parrain (droite) */}
              <line x1="500" y1="624" x2="800" y2="624" stroke="#F7931E" strokeWidth={1.5} strokeDasharray="4,3" />
              <line x1="800" y1="624" x2="800" y2="650" stroke="#F7931E" strokeWidth={1.5} strokeDasharray="4,3" markerEnd="url(#arrp)" />

              {/* Profil créé → décision pro */}
              <line x1="500" y1="594" x2="500" y2="744" stroke="#636E72" strokeWidth={1.5} markerEnd="url(#arrp)" />

              {/* Décision pro → fin (NON, particulier) */}
              <line x1="438" y1="806" x2="80" y2="806" stroke="#636E72" strokeWidth={1.5} />
              <line x1="80" y1="806" x2="80" y2="1240" stroke="#636E72" strokeWidth={1.5} markerEnd="url(#arrp)" />
              <text x="260" y="798" textAnchor="middle" fontSize={11} fontWeight="700" fill="#636E72">Particulier</text>

              {/* Décision pro → wizard SIRET (OUI) */}
              <line x1="500" y1="868" x2="500" y2="894" stroke="#636E72" strokeWidth={1.5} markerEnd="url(#arrp)" />
              <text x="510" y="884" fontSize={11} fontWeight="700" fill="#27AE60">✅ Pro</text>

              {/* SIRET → CGU sign */}
              <line x1="500" y1="950" x2="500" y2="976" stroke="#636E72" strokeWidth={1.5} markerEnd="url(#arrp)" />

              {/* SIRET → cron relance (à droite) */}
              <line x1="700" y1="922" x2="900" y2="922" stroke="#F59E0B" strokeWidth={1.5} strokeDasharray="4,3" markerEnd="url(#arrp-orange)" />

              {/* CGU sign → email cgu signed */}
              <line x1="500" y1="1032" x2="500" y2="1058" stroke="#636E72" strokeWidth={1.5} markerEnd="url(#arrp)" />

              {/* Email cgu → Stripe SetupIntent */}
              <line x1="500" y1="1102" x2="500" y2="1128" stroke="#636E72" strokeWidth={1.5} markerEnd="url(#arrp)" />

              {/* Stripe SetupIntent → carte enregistrée */}
              <line x1="500" y1="1184" x2="500" y2="1210" stroke="#636E72" strokeWidth={1.5} markerEnd="url(#arrp)" />

              {/* Carte → fin pro */}
              <line x1="500" y1="1252" x2="500" y2="1280" stroke="#636E72" strokeWidth={1.5} markerEnd="url(#arrp)" />

              {/* ══ NŒUDS ══ */}

              {/* Départ */}
              <PillNode id="depart-pro" x={300} y={18} w={400} h={40} fill="#FF6B35"
                label="✨ Inscription via /auth/login (OTP)" onClick={click} hasBadge={ann.has("depart-pro")} />

              {/* OTP demande */}
              <RectNode id="otp-request" x={350} y={86} w={300} h={62} fill="white" stroke="#2D3436"
                label="POST /api/auth/send-code"
                sublabel="Insert otp_codes · 5/h/IP rate-limit"
                onClick={click} hasBadge={ann.has("otp-request")} />

              {/* Email OTP envoyé */}
              <RectNode id="email-otp" x={340} y={170} w={320} h={56} fill="#F7931E" stroke="#F7931E"
                label='📧 Code OTP — 6 chiffres'
                sublabel="Valable 24h · usage unique · 5 tentatives"
                labelColor="white" onClick={click} hasBadge={ann.has("email-otp")} />

              {/* Saisie code */}
              <RectNode id="otp-verify" x={350} y={248} w={300} h={56} fill="white" stroke="#2D3436"
                label="POST /api/auth/verify-code"
                sublabel="Crée auth.users · session HttpOnly · TTL 6j"
                onClick={click} hasBadge={ann.has("otp-verify")} />

              {/* Décision sponsor */}
              <DiamondNode id="decision-sponsor" cx={500} cy={396} r={62}
                stroke="#2980B9" label="Code parrain" line2="fourni ?"
                onClick={click} hasBadge={ann.has("decision-sponsor")} />

              {/* Founder rotation */}
              <RectNode id="founder-rotation" x={70} y={430} w={260} h={44} fill="#EBF5FB" stroke="#2980B9" dashed
                label="🎰 Rotation founder"
                sublabel="winelio.founder_rotation · round-robin"
                labelColor="#2980B9" onClick={click} hasBadge={ann.has("founder-rotation")} />

              {/* Sponsor du code */}
              <RectNode id="sponsor-resolved" x={670} y={430} w={260} h={44} fill="white" stroke="#2D3436"
                label="🔗 Sponsor identifié"
                sublabel="profiles.sponsor_id ← code parrain"
                onClick={click} hasBadge={ann.has("sponsor-resolved")} />

              {/* Profil créé (handle_new_user trigger) */}
              <RectNode id="profil-created" x={300} y={538} w={400} h={56} fill="#FFF5F0" stroke="#FF6B35"
                label="✅ Profil créé (trigger handle_new_user)"
                sublabel="winelio.profiles + user_wallet_summaries · sponsor_code généré"
                labelColor="#FF6B35" onClick={click} hasBadge={ann.has("profil-created")} />

              {/* Email welcome */}
              <RectNode id="email-welcome" x={70} y={650} w={260} h={48} fill="#F7931E" stroke="#F7931E"
                label='📧 Bienvenue chez Winelio'
                sublabel="Découverte plateforme + tour guidé"
                labelColor="white" onClick={click} hasBadge={ann.has("email-welcome")} />

              {/* Email new-referral */}
              <RectNode id="email-new-referral" x={670} y={650} w={260} h={48} fill="#F7931E" stroke="#F7931E"
                label='📧 "Nouveau filleul" → Parrain'
                sublabel="notify-new-referral.ts"
                labelColor="white" onClick={click} hasBadge={ann.has("email-new-referral")} />

              {/* Décision : pro ou particulier */}
              <DiamondNode id="decision-pro" cx={500} cy={806} r={62}
                stroke="#2980B9" label="Profil" line2="professionnel ?"
                onClick={click} hasBadge={ann.has("decision-pro")} />

              {/* Wizard SIRET */}
              <RectNode id="wizard-siret" x={300} y={894} w={400} h={56} fill="white" stroke="#2D3436"
                label="📋 Wizard onboarding pro — étape SIRET"
                sublabel="API SIRENE · profile.is_professional=true · pro_onboarding_events"
                onClick={click} hasBadge={ann.has("wizard-siret")} />

              {/* Cron relance SIRET */}
              <RectNode id="email-siret-reminder" x={900} y={894} w={260} h={56} fill="#F59E0B" stroke="#F59E0B"
                label='⏱ Relance "Complétez SIRET"'
                sublabel="cron · J+3 puis J+7 si SIRET vide"
                labelColor="white" onClick={click} hasBadge={ann.has("email-siret-reminder")} />

              {/* Wizard CGU */}
              <RectNode id="wizard-cgu" x={300} y={976} w={400} h={56} fill="white" stroke="#2D3436"
                label="✍ Wizard onboarding pro — signature CGU"
                sublabel="canvas SignaturePad · PDF puppeteer · bucket privé legal-signatures"
                onClick={click} hasBadge={ann.has("wizard-cgu")} />

              {/* Email CGU signée */}
              <RectNode id="email-cgu-signed" x={300} y={1058} w={400} h={44} fill="#F7931E" stroke="#F7931E"
                label='📧 Confirmation signature CGU'
                sublabel="PDF en pièce jointe · transporter direct (hors queue)"
                labelColor="white" onClick={click} hasBadge={ann.has("email-cgu-signed")} />

              {/* Stripe SetupIntent */}
              <RectNode id="stripe-setup" x={300} y={1128} w={400} h={56} fill="white" stroke="#2D3436"
                label="💳 Stripe SetupIntent (Elements)"
                sublabel="POST /api/stripe/setup-intent → confirmation client"
                onClick={click} hasBadge={ann.has("stripe-setup")} />

              {/* Carte enregistrée */}
              <RectNode id="payment-method-saved" x={300} y={1210} w={400} h={42} fill="#FFF5F0" stroke="#FF6B35"
                label="✅ Moyen de paiement sauvegardé"
                sublabel="profiles.stripe_payment_method_id · brand · last4"
                labelColor="#FF6B35" onClick={click} hasBadge={ann.has("payment-method-saved")} />

              {/* Email new-pro-in-network → sponsor & autres */}
              <RectNode id="email-new-pro" x={900} y={1058} w={260} h={56} fill="#F7931E" stroke="#F7931E"
                label='📧 "Nouveau pro réseau"'
                sublabel="→ sponsor + filleuls + admin"
                labelColor="white" onClick={click} hasBadge={ann.has("email-new-pro")} />

              {/* Email pro onboarding admin */}
              <RectNode id="email-pro-onboarding" x={900} y={1210} w={260} h={42} fill="#F7931E" stroke="#F7931E"
                label='📧 "Onboarding pro complet"'
                sublabel="→ admin (audit + suivi)"
                labelColor="white" onClick={click} hasBadge={ann.has("email-pro-onboarding")} />

              {/* Connecteurs notify pro onboarding */}
              <line x1="700" y1="1080" x2="900" y2="1080" stroke="#F7931E" strokeWidth={1.5} strokeDasharray="4,3" markerEnd="url(#arrp)" />
              <line x1="700" y1="1230" x2="900" y2="1230" stroke="#F7931E" strokeWidth={1.5} strokeDasharray="4,3" markerEnd="url(#arrp)" />

              {/* Fin */}
              <PillNode id="fin-pro" x={300} y={1280} w={400} h={42} fill="#27AE60"
                label="✅ Pro opérationnel — peut recevoir des recos" onClick={click} hasBadge={ann.has("fin-pro")} />
            </svg>
          </g>
        </svg>
      </div>

      <div className="flex flex-wrap gap-4 px-6 py-3 border-t border-gray-100 bg-white shrink-0">
        {LEGEND_ITEMS.map((item) => (
          <div key={item.label} className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className="w-3.5 h-3.5 flex-shrink-0"
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

      {emailPreview && (
        <EmailPreviewDialog emailType={emailPreview} onClose={() => setEmailPreview(null)} />
      )}
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
