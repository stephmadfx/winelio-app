"use client";

import { useEffect, useRef, useState } from "react";
import { computeConversationStage } from "@/lib/ai-recommendation-guardrails";
import {
  type ImportedPhoneContact,
  canOpenWinelioAppSettings,
  canSearchDeviceContacts,
  enrichContactMunicipality,
  getNativeAndroidBuild,
  getWinelioNativePlatform,
  isAndroidNativeWithoutMicManifest,
  mergePhoneContactIntoForm,
  openWinelioAppSettingsAndVerify,
  parseVcardText,
  pickPhoneContactInteractive,
  prepareAssistantNativePermissions,
  searchDeviceContactsByName,
} from "./phone-contacts";
import { Contact, ContactFormData, Professional, SelfProfile, Urgency, inputCls } from "./types";

interface AiRecommendationAssistantProps {
  contacts: Contact[];
  selfProfile: SelfProfile | null;
  selectedProId: string | null;
  selectedProMeta: Professional | null;
  onSelectPro: (id: string | null, pro?: Professional | null) => void;
  description: string;
  onDescriptionChange: (v: string) => void;
  urgency: Urgency;
  onUrgencyChange: (v: Urgency) => void;
  selectedContactId: string | null;
  setSelectedContactId: (id: string | null) => void;
  createContact: boolean;
  setCreateContact: (v: boolean) => void;
  contactForm: ContactFormData;
  setContactForm: (form: ContactFormData) => void;
  contactErrors: Record<string, string>;
  setContactErrors: (e: Record<string, string>) => void;
  thirdPartyConsent: boolean;
  setThirdPartyConsent: (v: boolean) => void;
  canSubmit: boolean;
  submitting: boolean;
  onSubmit: () => void;
  onSwitchToClassicStep: (step: number) => void;
}

type UiMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  professionals?: Professional[];
  matchedContacts?: Contact[];
  deviceContacts?: ImportedPhoneContact[];
};

const INITIAL_GREETING =
  "Bonjour ! Touchez « Parler » et dites-moi simplement quel professionnel vous cherchez et autour de quelle ville.";

const QUICK_PROMPTS = [
  "Mon voisin cherche un plombier rapidement",
  "Un ami veut vendre sa maison",
  "Ma sœur cherche un DJ pour son mariage",
];

const MIC_ANIM_CSS = `
  @keyframes winelio-mic-halo {
    0% { transform: scale(0.95); opacity: 0.7; }
    75%, 100% { transform: scale(1.34); opacity: 0; }
  }
  @keyframes winelio-eq-bar {
    0%, 100% { transform: scaleY(0.28); }
    50% { transform: scaleY(1); }
  }
  @keyframes winelio-mic-capsule {
    0%, 100% { transform: translateY(0) scale(1) rotate(0deg); }
    30% { transform: translateY(-2px) scale(1.12) rotate(-6deg); }
    65% { transform: translateY(-1.5px) scale(1.1) rotate(6deg); }
  }
  @keyframes winelio-mic-bar-pulse {
    0%, 100% { opacity: 0.25; transform: scaleY(0.28); }
    50% { opacity: 1; transform: scaleY(1.22); }
  }
  .mic-capsule-anim {
    transform-box: fill-box;
    transform-origin: center;
    animation: winelio-mic-capsule 2s ease-in-out infinite;
  }
  .mic-bar-inner {
    transform-box: fill-box;
    transform-origin: center;
    animation: winelio-mic-bar-pulse 0.95s ease-in-out infinite;
  }
  .mic-bar-outer {
    transform-box: fill-box;
    transform-origin: center;
    animation: winelio-mic-bar-pulse 0.95s ease-in-out 0.32s infinite;
  }
  .mic-invite-ring {
    animation: winelio-mic-halo 1.7s ease-out infinite;
  }
  .mic-eq-bar {
    transform-origin: bottom;
    animation: winelio-eq-bar 0.8s ease-in-out infinite;
  }
  .mic-eq-bar-live {
    transform-origin: bottom;
    animation: winelio-eq-bar 0.5s ease-in-out infinite;
  }
  @keyframes winelio-beam-rotate {
    from { transform: translate(-50%, -50%) rotate(0deg); }
    to   { transform: translate(-50%, -50%) rotate(360deg); }
  }
  .ai-beam-spin {
    animation: winelio-beam-rotate 6.5s linear infinite;
  }
  .ai-beam-spin-fast {
    animation: winelio-beam-rotate 3s linear infinite;
  }
  @media (prefers-reduced-motion: reduce) {
    .mic-capsule-anim, .mic-bar-inner, .mic-bar-outer, .mic-invite-ring, .mic-eq-bar, .mic-eq-bar-live {
      animation-duration: 4s;
    }
    .ai-beam-spin, .ai-beam-spin-fast {
      animation-duration: 16s;
    }
  }
`;

function pickSupportedAudioMime(): string {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  return candidates.find((c) => MediaRecorder.isTypeSupported(c)) ?? "";
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export function AiRecommendationAssistant({
  contacts,
  selfProfile,
  selectedProId,
  selectedProMeta,
  onSelectPro,
  description,
  onDescriptionChange,
  urgency,
  onUrgencyChange,
  selectedContactId,
  setSelectedContactId,
  createContact,
  setCreateContact,
  contactForm,
  setContactForm,
  contactErrors,
  setContactErrors,
  thirdPartyConsent,
  setThirdPartyConsent,
  canSubmit,
  submitting,
  onSubmit,
  onSwitchToClassicStep,
}: AiRecommendationAssistantProps) {
  const [messages, setMessages] = useState<UiMessage[]>([
    { id: "welcome", role: "assistant", content: INITIAL_GREETING },
  ]);
  const [inputText, setInputText] = useState("");
  const [recording, setRecording] = useState(false);
  const [recordingSec, setRecordingSec] = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [assistantError, setAssistantError] = useState<string | null>(null);
  const [showSettingsCta, setShowSettingsCta] = useState(false);
  const [micCanRePrompt, setMicCanRePrompt] = useState(false);
  const [openingSettings, setOpeningSettings] = useState(false);
  const [showManualAndroidGuide, setShowManualAndroidGuide] = useState(false);
  const [needsPlayStoreUpdate, setNeedsPlayStoreUpdate] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [geoShared, setGeoShared] = useState(false);
  const [editingContactDetails, setEditingContactDetails] = useState(false);
  const [contactFromDirectory, setContactFromDirectory] = useState(false);
  const [expandedProMsgIds, setExpandedProMsgIds] = useState<Record<string, boolean>>({});

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const discardRecordingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const ttsAbortRef = useRef<AbortController | null>(null);
  const playbackSeqRef = useRef(0);
  const assistantCardRef = useRef<HTMLDivElement | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const summaryCardRef = useRef<HTMLDivElement | null>(null);
  const vcardInputRef = useRef<HTMLInputElement | null>(null);
  const lastCompositionEndRef = useRef<number | null>(null);

  // Refs frais pour éviter les fermetures obsolètes après transcription asynchrone
  const stateSnapRef = useRef({
    messages,
    selectedProId,
    selectedProMeta,
    description,
    urgency,
    selectedContactId,
    contacts,
    createContact,
    contactForm,
    userLocation,
    voiceEnabled,
  });
  stateSnapRef.current = {
    messages,
    selectedProId,
    selectedProMeta,
    description,
    urgency,
    selectedContactId,
    contacts,
    createContact,
    contactForm,
    userLocation,
    voiceEnabled,
  };

  useEffect(() => {
    const el = chatScrollRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [messages, transcribing, thinking]);

  const unlockAudioContext = (forRecording = false) => {
    if (typeof window === "undefined") return null;
    try {
      const nav = navigator as Navigator & { audioSession?: { type?: string } };
      if (nav.audioSession) {
        const desired = forRecording ? "play-and-record" : "playback";
        if (nav.audioSession.type !== desired) {
          nav.audioSession.type = desired;
        }
      }
    } catch {
      // Ignoré sur les navigateurs sans navigator.audioSession
    }
    if (forRecording) return audioCtxRef.current;
    const Ctx =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new Ctx();
    }
    if (audioCtxRef.current.state === "suspended") {
      void audioCtxRef.current.resume().catch(() => undefined);
    }
    return audioCtxRef.current;
  };

  const stopAudioPlayback = () => {
    playbackSeqRef.current += 1;
    if (ttsAbortRef.current) {
      ttsAbortRef.current.abort();
      ttsAbortRef.current = null;
    }
    for (const src of activeSourcesRef.current) {
      try {
        src.onended = null;
        src.stop();
        src.disconnect();
      } catch {
        // Déjà arrêté
      }
    }
    activeSourcesRef.current.clear();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setSpeaking(false);
  };

  const cleanupMediaStream = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    mediaRecorderRef.current = null;
  };

  useEffect(() => {
    const requestInitialNativePermissions = () => {
      // Sur iOS uniquement : sur Android, un appel au montage peut écraser mPermissionListener lors du clic micro
      if (getWinelioNativePlatform() !== "ios") return;
      void prepareAssistantNativePermissions({
        includeContacts: true,
        promptSettings: false,
      });
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        setShowManualAndroidGuide(false);
      }
    };
    requestInitialNativePermissions();
    window.addEventListener("winelio:native-ready", requestInitialNativePermissions);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("winelio:native-ready", requestInitialNativePermissions);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      stopAudioPlayback();
      cleanupMediaStream();
      if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
        void audioCtxRef.current.close().catch(() => undefined);
      }
    };
  }, []);

  const speakText = async (text: string) => {
    const trimmed = text.trim();
    if (!stateSnapRef.current.voiceEnabled || !trimmed) return;
    stopAudioPlayback();
    const mySeq = playbackSeqRef.current;
    const abortCtrl = new AbortController();
    ttsAbortRef.current = abortCtrl;

    const patchWavSizes = (bytes: Uint8Array): Uint8Array<ArrayBuffer> => {
      const out = new Uint8Array(new ArrayBuffer(bytes.byteLength));
      out.set(bytes);
      if (
        out.byteLength >= 44 &&
        out[0] === 0x52 &&
        out[1] === 0x49 &&
        out[2] === 0x46 &&
        out[3] === 0x46
      ) {
        const view = new DataView(out.buffer);
        view.setUint32(4, out.byteLength - 8, true);
        if (out[36] === 0x64 && out[37] === 0x61 && out[38] === 0x74 && out[39] === 0x61) {
          view.setUint32(40, out.byteLength - 44, true);
        }
      }
      return out;
    };

    const playBlobFallback = async (bytes: Uint8Array, mime: string) => {
      if (playbackSeqRef.current !== mySeq) return;
      const normalized = mime.includes("wav") ? patchWavSizes(bytes) : new Uint8Array(bytes);
      const blob = new Blob([normalized], { type: mime || "audio/wav" });
      const url = URL.createObjectURL(blob);
      audioUrlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        if (playbackSeqRef.current === mySeq) stopAudioPlayback();
      };
      audio.onerror = () => {
        if (playbackSeqRef.current === mySeq) stopAudioPlayback();
      };
      await audio.play().catch(() => {
        if (playbackSeqRef.current === mySeq) stopAudioPlayback();
      });
    };

    try {
      setSpeaking(true);
      const res = await fetch("/api/recommendations/ai/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
        signal: abortCtrl.signal,
      });
      if (!res.ok || playbackSeqRef.current !== mySeq) {
        if (playbackSeqRef.current === mySeq) stopAudioPlayback();
        return;
      }

      const contentType = (res.headers.get("content-type") || "").toLowerCase();
      const ctx = unlockAudioContext();

      // Lecture PCM temps réel via Web Audio API (compatible iOS WKWebView/Safari + Android WebView dès ~120 ms TTFB)
      if (contentType.includes("wav") && res.body && ctx) {
        if (ctx.state === "suspended") {
          await ctx.resume().catch(() => undefined);
        }
        const reader = res.body.getReader();
        let pending: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
        let headerParsed = false;
        let channels = 1;
        let sampleRate = 48000;
        let bitsPerSample = 16;
        let audioFormat = 1;
        let nextTime = 0;
        let streamDone = false;
        const collectedFallback: Uint8Array[] = [];

        const appendBytes = (a: Uint8Array, b: Uint8Array): Uint8Array => {
          if (a.byteLength === 0) return b;
          const merged = new Uint8Array(a.byteLength + b.byteLength);
          merged.set(a, 0);
          merged.set(b, a.byteLength);
          return merged;
        };

        const schedulePcmChunk = (pcmBytes: Uint8Array, isFinalChunk: boolean) => {
          const frameBytes = channels * 2;
          const usableBytes = pcmBytes.byteLength - (pcmBytes.byteLength % frameBytes);
          if (usableBytes <= 0) return;
          const frameCount = usableBytes / frameBytes;
          const audioBuf = ctx.createBuffer(channels, frameCount, sampleRate);
          const view = new DataView(pcmBytes.buffer, pcmBytes.byteOffset, usableBytes);
          const fadeFrames = isFinalChunk ? Math.min(frameCount, Math.floor(sampleRate * 0.01)) : 0;
          const fadeStart = frameCount - fadeFrames;

          for (let ch = 0; ch < channels; ch++) {
            const chData = audioBuf.getChannelData(ch);
            for (let i = 0; i < frameCount; i++) {
              const sample = view.getInt16((i * channels + ch) * 2, true) / 32768;
              const gain = fadeFrames > 0 && i >= fadeStart ? (frameCount - 1 - i) / fadeFrames : 1;
              chData[i] = sample * gain;
            }
          }

          const src = ctx.createBufferSource();
          src.buffer = audioBuf;
          src.connect(ctx.destination);
          const startAt = Math.max(ctx.currentTime + 0.025, nextTime);
          nextTime = startAt + audioBuf.duration;
          activeSourcesRef.current.add(src);
          src.onended = () => {
            activeSourcesRef.current.delete(src);
            if (streamDone && activeSourcesRef.current.size === 0 && playbackSeqRef.current === mySeq) {
              stopAudioPlayback();
            }
          };
          src.start(startAt);
        };

        while (true) {
          const { done, value } = await reader.read();
          if (playbackSeqRef.current !== mySeq) {
            await reader.cancel().catch(() => undefined);
            return;
          }
          if (value && value.byteLength > 0) {
            if (!headerParsed) collectedFallback.push(value);
            pending = appendBytes(pending, value);
          }

          if (!headerParsed && pending.byteLength >= 44) {
            const view = new DataView(pending.buffer, pending.byteOffset, pending.byteLength);
            const isRiff =
              pending[0] === 0x52 && pending[1] === 0x49 && pending[2] === 0x46 && pending[3] === 0x46;
            let dataStart = 44;
            if (isRiff) {
              let off = 12;
              while (off + 8 <= pending.byteLength) {
                const tag = String.fromCharCode(
                  pending[off],
                  pending[off + 1],
                  pending[off + 2],
                  pending[off + 3],
                );
                const sz = view.getUint32(off + 4, true);
                if (tag === "fmt " && off + 8 + 16 <= pending.byteLength) {
                  audioFormat = view.getUint16(off + 8, true);
                  channels = Math.max(1, view.getUint16(off + 10, true));
                  sampleRate = view.getUint32(off + 12, true) || 48000;
                  bitsPerSample = view.getUint16(off + 22, true) || 16;
                } else if (tag === "data") {
                  dataStart = off + 8;
                  break;
                }
                if (sz === 0xffffffff || off + 8 + sz > pending.byteLength) break;
                off += 8 + sz + (sz % 2);
              }
            }
            if (audioFormat !== 1 || bitsPerSample !== 16 || ctx.state !== "running") {
              // Secours universel via Blob si le format WAV n'est pas PCM 16 bits ou si AudioContext est verrouillé
              const rest: Uint8Array[] = [...collectedFallback];
              while (true) {
                const r = await reader.read();
                if (r.done) break;
                if (r.value) rest.push(r.value);
              }
              const totalLen = rest.reduce((acc, c) => acc + c.byteLength, 0);
              const full = new Uint8Array(totalLen);
              let pos = 0;
              for (const c of rest) {
                full.set(c, pos);
                pos += c.byteLength;
              }
              await playBlobFallback(full, "audio/wav");
              return;
            }
            headerParsed = true;
            collectedFallback.length = 0;
            pending = pending.subarray(dataStart);
          }

          if (headerParsed) {
            const minBatchBytes = done ? 2 : Math.max(4096, Math.floor(sampleRate * channels * 2 * 0.1));
            if (pending.byteLength >= minBatchBytes) {
              const frameBytes = channels * 2;
              const emitLen = pending.byteLength - (pending.byteLength % frameBytes);
              if (emitLen > 0) {
                schedulePcmChunk(pending.subarray(0, emitLen), done);
                pending = pending.subarray(emitLen);
              }
            }
          }

          if (done) {
            streamDone = true;
            if (activeSourcesRef.current.size === 0 && playbackSeqRef.current === mySeq) {
              stopAudioPlayback();
            }
            break;
          }
        }
        return;
      }

      const rawBuf = new Uint8Array(await res.arrayBuffer());
      await playBlobFallback(rawBuf, contentType || "audio/mpeg");
    } catch {
      if (playbackSeqRef.current === mySeq) stopAudioPlayback();
    }
  };

  const sendUserMessage = async (rawContent: string) => {
    const content = rawContent.trim();
    if (!content || thinking) return;

    unlockAudioContext();
    stopAudioPlayback();
    setAssistantError(null);

    const snap = stateSnapRef.current;
    const userMsg: UiMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content,
    };
    const nextHistory = [...snap.messages, userMsg];
    setMessages(nextHistory);
    setInputText("");
    setThinking(true);

    const selectedContactObj = snap.selectedContactId
      ? snap.contacts.find((c) => c.id === snap.selectedContactId)
      : null;

    const latestProsMsg = [...snap.messages]
      .reverse()
      .find((m) => m.professionals && m.professionals.length > 0);
    const recentProfessionals = (latestProsMsg?.professionals ?? []).slice(0, 6).map((p, idx) => ({
      rank: idx + 1,
      id: p.id,
      name: p.company_name ?? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim(),
      category_name: p.category_name,
      city: p.city,
    }));

    try {
      const res = await fetch("/api/recommendations/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextHistory
            .filter((m) => m.id !== "welcome")
            .map((m) => ({ role: m.role, content: m.content })),
          userLocation: snap.userLocation,
                  draft: {
            selectedProId: snap.selectedProId,
            selectedProLabel: snap.selectedProMeta
              ? snap.selectedProMeta.company_name ??
                `${snap.selectedProMeta.first_name ?? ""} ${snap.selectedProMeta.last_name ?? ""}`.trim()
              : null,
            selectedProCategory: snap.selectedProMeta?.category_name ?? null,
            recentProfessionals,
            description: snap.description,
            urgency: snap.urgency,
            selectedContactId: snap.selectedContactId,
            selectedContactLabel: selectedContactObj
              ? `${selectedContactObj.first_name} ${selectedContactObj.last_name}`
              : null,
            createContact: snap.createContact,
            contactForm: snap.contactForm,
          },
        }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || "Erreur de communication avec l'assistant.");
      }

      let nextProId = snap.selectedProId;
      let nextDescription = snap.description;
      let nextSelectedContactId = snap.selectedContactId;
      let nextContactForm: ContactFormData = { ...stateSnapRef.current.contactForm };

      if (body.patch) {
        const p = body.patch;
        if (p.selectedProId !== undefined) {
          nextProId = p.selectedProId;
          onSelectPro(p.selectedProId, p.selectedPro ?? snap.selectedProMeta);
        }
        if (typeof p.description === "string") {
          nextDescription = p.description;
          onDescriptionChange(p.description);
        }
        if (p.urgency === "urgent" || p.urgency === "normal" || p.urgency === "flexible") {
          onUrgencyChange(p.urgency);
        }
        if (p.selectedContactId) {
          nextSelectedContactId = p.selectedContactId;
          setSelectedContactId(p.selectedContactId);
          setCreateContact(false);
          setThirdPartyConsent(false);
        } else if (p.contactForm) {
          nextContactForm = {
            ...nextContactForm,
            ...p.contactForm,
          };
          setContactForm(nextContactForm);
          setCreateContact(true);
          setSelectedContactId(null);
          setContactFromDirectory(false);
          nextSelectedContactId = null;
        }
      }

      let finalReply: string = body.reply || "C'est bien noté !";
      let matchedDeviceContacts: ImportedPhoneContact[] | undefined;

      // Recherche automatique dans le répertoire du téléphone (application mobile Winelio 1.0.6+)
      if (
        typeof body.deviceContactSearchQuery === "string" &&
        body.deviceContactSearchQuery.trim().length >= 2 &&
        !nextSelectedContactId &&
        canSearchDeviceContacts()
      ) {
        const selfMail = selfProfile?.email?.trim().toLowerCase() ?? "";
        const rawMatches = await searchDeviceContactsByName(body.deviceContactSearchQuery);
        const validMatches = rawMatches.filter(
          (c) => !selfMail || !c.email || c.email.toLowerCase() !== selfMail,
        );

        if (validMatches.length === 1) {
          const enriched = await enrichContactMunicipality(validMatches[0]);
          nextContactForm = mergePhoneContactIntoForm(nextContactForm, enriched);
          setContactForm(nextContactForm);
          setCreateContact(true);
          setSelectedContactId(null);
          setContactFromDirectory(true);

          const stillMissing: string[] = [];
          if (!nextContactForm.first_name.trim()) stillMissing.push("son prénom");
          if (!nextContactForm.last_name.trim()) stillMissing.push("son nom");
          if (!nextContactForm.phone.trim()) stillMissing.push("son numéro de téléphone");
          if (!nextContactForm.email.trim()) stillMissing.push("son adresse e-mail");
          if (!nextContactForm.address.trim()) stillMissing.push("son numéro et nom de rue");
          if (!nextContactForm.city.trim() || !nextContactForm.postal_code.trim()) {
            stillMissing.push("sa ville et son code postal");
          }

          if (stillMissing.length === 0) {
            if (nextProId && nextDescription.trim()) {
              finalReply = `J'ai retrouvé ${enriched.full_name} dans le répertoire de votre téléphone et rempli ses coordonnées ! Il ne vous reste plus qu'à cocher le consentement RGPD et envoyer.`;
            } else if (!nextProId) {
              finalReply = `J'ai retrouvé ${enriched.full_name} dans le répertoire de votre téléphone et pré-rempli ses coordonnées ! Quel professionnel ou métier recherchez-vous pour cette recommandation ?`;
            } else {
              finalReply = `J'ai retrouvé ${enriched.full_name} dans le répertoire de votre téléphone et pré-rempli ses coordonnées ! Pouvez-vous décrire brièvement le besoin et son urgence ?`;
            }
          } else {
            finalReply = `J'ai retrouvé ${enriched.full_name} dans votre répertoire ! Pour compléter sa fiche, pouvez-vous me préciser ${stillMissing.slice(0, 2).join(" et ")} ?`;
          }
        } else if (validMatches.length > 1) {
          matchedDeviceContacts = validMatches;
          finalReply = `J'ai trouvé ${validMatches.length} contacts correspondants dans le répertoire de votre téléphone. Lequel souhaitez-vous choisir ?`;
        }
      }

      const assistantMsg: UiMessage = {
        id: `a-${Date.now()}`,
        role: "assistant",
        content: finalReply,
        professionals: Array.isArray(body.professionals) ? body.professionals : undefined,
        matchedContacts: Array.isArray(body.matchedContacts) ? body.matchedContacts : undefined,
        deviceContacts: matchedDeviceContacts,
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setThinking(false);

      if (stateSnapRef.current.voiceEnabled && assistantMsg.content) {
        void speakText(assistantMsg.content);
      }
    } catch (err) {
      setThinking(false);
      setAssistantError(err instanceof Error ? err.message : "Une erreur est survenue.");
    }
  };

  const startRecording = async () => {
    if (recording || transcribing || thinking) return;
    stopAudioPlayback();
    unlockAudioContext(true);
    setAssistantError(null);
    setShowSettingsCta(false);
    setMicCanRePrompt(false);
    setShowManualAndroidGuide(false);
    setNeedsPlayStoreUpdate(false);

    if (isAndroidNativeWithoutMicManifest()) {
      setNeedsPlayStoreUpdate(true);
      setAssistantError(
        "Mettez à jour l'application Winelio sur Google Play pour activer le microphone, ou écrivez votre message ci-dessous.",
      );
      return;
    }

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setAssistantError("Votre appareil ne permet pas l'accès au microphone sur cette page.");
      return;
    }

    const platform = getWinelioNativePlatform();
    const androidBuild = getNativeAndroidBuild();

    try {
      // Android natif (build >= 20) : demande groupée Micro + Contacts en un seul appel système avant getUserMedia
      if (platform === "android" && androidBuild >= 20) {
        const perm = await prepareAssistantNativePermissions({
          includeContacts: true,
          promptSettings: false,
        });
        if (!perm || perm.microphone !== "granted") {
          const canRePrompt = Boolean(perm && perm.blockedInSettings === false);
          setMicCanRePrompt(canRePrompt);
          setShowSettingsCta(true);
          setAssistantError(
            canRePrompt
              ? "Accès au microphone non accordé. Touchez « Autoriser le micro » ou écrivez votre message ci-dessous."
              : "Autorisez l'accès au microphone et au répertoire dans les réglages de Winelio, ou écrivez votre message ci-dessous.",
          );
          return;
        }
      }

      // Sur iOS : appel direct dans le geste utilisateur (sans await intermédiaire)
      // Sur Android builds < 20 : garde-fou de 2,8 s si RNCWebChromeClient ne rejette pas un refus micro
      const rawMediaPromise = navigator.mediaDevices.getUserMedia({ audio: true });
      const stream =
        platform === "android" && androidBuild < 20
          ? await new Promise<MediaStream>((resolve, reject) => {
              let done = false;
              const checkHang = setTimeout(() => {
                if (!done && document.visibilityState === "visible" && document.hasFocus()) {
                  done = true;
                  reject(new Error("mic-denied"));
                }
              }, 2800);
              rawMediaPromise.then(
                (s) => {
                  if (done) {
                    s.getTracks().forEach((t) => t.stop());
                    return;
                  }
                  done = true;
                  clearTimeout(checkHang);
                  resolve(s);
                },
                (err) => {
                  if (done) return;
                  done = true;
                  clearTimeout(checkHang);
                  reject(err);
                },
              );
            })
          : await rawMediaPromise;

      if (platform === "ios") {
        void prepareAssistantNativePermissions({ includeContacts: true, promptSettings: false });
      }
      mediaStreamRef.current = stream;
      chunksRef.current = [];
      discardRecordingRef.current = false;

      const mimeType = pickSupportedAudioMime();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const actualMime = recorder.mimeType || mimeType || "audio/webm";
        const recordedChunks = [...chunksRef.current];
        const discarded = discardRecordingRef.current;
        cleanupMediaStream();
        setRecording(false);
        setRecordingSec(0);

        if (discarded || recordedChunks.length === 0) return;

        const audioBlob = new Blob(recordedChunks, { type: actualMime });
        if (audioBlob.size < 400) return;

        setTranscribing(true);
        try {
          const fd = new FormData();
          fd.append("audio", audioBlob);
          const res = await fetch("/api/recommendations/ai/transcribe", {
            method: "POST",
            body: fd,
          });
          const data = await res.json().catch(() => ({}));
          setTranscribing(false);
          if (!res.ok) {
            setAssistantError(data.error || "Impossible de transcrire l'audio.");
            return;
          }
          const transcript = typeof data.text === "string" ? data.text.trim() : "";
          if (!transcript) {
            setAssistantError("Je n'ai pas entendu de voix distincte. Réessayez en parlant près du micro.");
            return;
          }
          await sendUserMessage(transcript);
        } catch {
          setTranscribing(false);
          setAssistantError("Erreur réseau pendant la transcription vocale.");
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setRecordingSec(0);
      timerRef.current = setInterval(() => {
        setRecordingSec((s) => s + 1);
      }, 1000);
    } catch {
      cleanupMediaStream();
      if (canOpenWinelioAppSettings()) {
        if (platform === "ios") {
          void prepareAssistantNativePermissions({ includeContacts: true, promptSettings: true });
        }
        setShowSettingsCta(true);
        setAssistantError(
          "Autorisez l'accès au microphone et au répertoire dans les réglages de Winelio, ou écrivez votre message ci-dessous.",
        );
      } else {
        setAssistantError(
          "Accès au microphone refusé. Autorisez le micro dans votre navigateur ou écrivez votre message ci-dessous.",
        );
      }
    }
  };

  const handleAuthorizeMicOrOpenSettings = async () => {
    if (openingSettings) return;
    if (micCanRePrompt) {
      await startRecording();
      return;
    }
    setOpeningSettings(true);
    try {
      const opened = await openWinelioAppSettingsAndVerify(750);
      setOpeningSettings(false);
      if (!opened) {
        setShowManualAndroidGuide(true);
        if (getWinelioNativePlatform() === "android") {
          setNeedsPlayStoreUpdate(true);
        }
      }
    } catch {
      setOpeningSettings(false);
      setShowManualAndroidGuide(true);
    }
  };

  const finishRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      discardRecordingRef.current = false;
      mediaRecorderRef.current.stop();
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      discardRecordingRef.current = true;
      mediaRecorderRef.current.stop();
    } else {
      cleanupMediaStream();
      setRecording(false);
    }
  };

  const shareGeo = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoShared(true);
      },
      () => setAssistantError("Géolocalisation refusée : indiquez simplement la ville à l'assistant."),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
    );
  };

  const handleSelectProFromChat = (pro: Professional) => {
    stopAudioPlayback();
    setAssistantError(null);
    onSelectPro(pro.id, pro);
    setExpandedProMsgIds({});
    const snap = stateSnapRef.current;
    stateSnapRef.current = {
      ...snap,
      selectedProId: pro.id,
      selectedProMeta: pro,
    };

    const proLabel =
      pro.company_name ?? (`${pro.first_name ?? ""} ${pro.last_name ?? ""}`.trim() || "ce professionnel");
    const nextStage = computeConversationStage({
      selectedProId: pro.id,
      selectedProCategory: pro.category_name,
      description: snap.description,
      urgency: snap.urgency,
      selectedContactId: snap.selectedContactId,
      contactForm: snap.contactForm,
    });

    const cleanFollowUp = nextStage.suggestedQuestion.replace(/^C'est (?:bien )?noté\s*!\s*/i, "");
    const nextReply = `C'est noté pour ${proLabel} ! ${cleanFollowUp}`;

    const now = Date.now();
    setMessages((prev) => [
      ...prev,
      { id: `u-${now}`, role: "user", content: `Je choisis ${proLabel}.` },
      { id: `a-${now + 1}`, role: "assistant", content: nextReply },
    ]);
    if (snap.voiceEnabled) {
      void speakText(nextReply);
    }
  };

  const handleSelectContactFromChat = (c: Contact) => {
    stopAudioPlayback();
    setAssistantError(null);
    setSelectedContactId(c.id);
    setCreateContact(false);
    setThirdPartyConsent(false);
    const snap = stateSnapRef.current;
    stateSnapRef.current = {
      ...snap,
      selectedContactId: c.id,
      createContact: false,
    };

    const nextStage = computeConversationStage({
      selectedProId: snap.selectedProId,
      description: snap.description,
      urgency: snap.urgency,
      selectedContactId: c.id,
      contactForm: snap.contactForm,
    });

    const nextReply = `C'est bien noté pour ${c.first_name} ${c.last_name} ! ${nextStage.suggestedQuestion}`;
    const now = Date.now();
    setMessages((prev) => [
      ...prev,
      { id: `u-${now}`, role: "user", content: `C'est bien pour ${c.first_name} ${c.last_name}.` },
      { id: `a-${now + 1}`, role: "assistant", content: nextReply },
    ]);
    if (snap.voiceEnabled) {
      void speakText(nextReply);
    }
  };

  const applyImportedPhoneContact = async (raw: ImportedPhoneContact, announceInChat: boolean) => {
    const selfMail = selfProfile?.email?.trim().toLowerCase() ?? "";
    if (selfMail && raw.email && raw.email.toLowerCase() === selfMail) {
      setAssistantError("Vous ne pouvez pas utiliser votre propre fiche comme personne recommandée.");
      return;
    }
    const enriched = await enrichContactMunicipality(raw);
    const merged = mergePhoneContactIntoForm(stateSnapRef.current.contactForm, enriched);
    setContactForm(merged);
    setContactErrors({});
    setCreateContact(true);
    setSelectedContactId(null);
    setContactFromDirectory(true);
    setThirdPartyConsent(false);
    setAssistantError(null);

    const hasMissing =
      !merged.first_name.trim() ||
      !merged.last_name.trim() ||
      !merged.email.trim() ||
      !merged.phone.trim() ||
      !merged.address.trim() ||
      !merged.city.trim() ||
      !merged.postal_code.trim();
    if (hasMissing) setEditingContactDetails(true);

    if (announceInChat) {
      setMessages((prev) => [
        ...prev,
        {
          id: `sys-${Date.now()}`,
          role: "assistant",
          content: hasMissing
            ? `J'ai pré-rempli la fiche de ${enriched.full_name} depuis votre répertoire. Complétez simplement les champs restants ci-dessous ou au micro.`
            : `Coordonnées de ${enriched.full_name} importées depuis votre répertoire !`,
        },
      ]);
    }
  };

  const handleImportFromPhone = async () => {
    setAssistantError(null);
    const res = await pickPhoneContactInteractive();
    if (res.status === "selected") {
      await applyImportedPhoneContact(res.contact, true);
    } else if (res.status === "needs-vcard") {
      vcardInputRef.current?.click();
    } else if (res.status === "denied") {
      setShowSettingsCta(canOpenWinelioAppSettings());
      setAssistantError("Accès au répertoire refusé dans les réglages du téléphone.");
    } else if (res.status === "error") {
      setAssistantError(res.message);
    }
  };

  const handleVcardFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const text = await file.text().catch(() => "");
    const parsed = parseVcardText(text);
    if (!parsed) {
      setAssistantError("Ce fichier ne semble pas être une fiche contact (.vcf) valide.");
      return;
    }
    await applyImportedPhoneContact(parsed, true);
  };

  const setField = (field: keyof ContactFormData, value: string) => {
    setCreateContact(true);
    setSelectedContactId(null);
    setContactForm({ ...contactForm, [field]: value });
    if (contactErrors[field]) setContactErrors({ ...contactErrors, [field]: "" });
  };

  const selectedContactObj = selectedContactId
    ? contacts.find((c) => c.id === selectedContactId) ?? null
    : null;

  const referrerEmail = selfProfile?.email?.trim().toLowerCase() ?? "";
  const selfEmailConflict =
    createContact &&
    Boolean(referrerEmail) &&
    contactForm.email.trim().toLowerCase() === referrerEmail;

  const missingContactFields: string[] = [];
  if (!selectedContactObj) {
    if (!contactForm.first_name.trim()) missingContactFields.push("Prénom");
    if (!contactForm.last_name.trim()) missingContactFields.push("Nom");
    if (!contactForm.email.trim()) missingContactFields.push("E-mail");
    if (!contactForm.phone.trim()) missingContactFields.push("Téléphone");
    if (!contactForm.address.trim()) missingContactFields.push("Adresse");
    if (!contactForm.city.trim()) missingContactFields.push("Ville");
    if (!contactForm.postal_code.trim()) missingContactFields.push("Code postal");
  }

  const proLabel = selectedProMeta
    ? selectedProMeta.company_name ??
      (`${selectedProMeta.first_name ?? ""} ${selectedProMeta.last_name ?? ""}`.trim() || "Professionnel sélectionné")
    : selectedProId
      ? "Professionnel sélectionné"
      : null;

  const completedSectionsCount =
    (proLabel ? 1 : 0) +
    (description.trim() ? 1 : 0) +
    (selectedContactObj || missingContactFields.length === 0 ? 1 : 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-start">
      <style>{MIC_ANIM_CSS}</style>
      <input
        ref={vcardInputRef}
        type="file"
        accept=".vcf,text/vcard,text/x-vcard"
        onChange={(e) => void handleVcardFileChange(e)}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />
      {/* Colonne Dialogue Vocal & Écrit avec liseré lumineux tournant tout autour du bloc */}
      <div
        ref={assistantCardRef}
        className="lg:col-span-7 relative scroll-mt-16"
        style={{
          borderRadius: "18px",
          padding: "2px",
          overflow: "hidden",
          background: "rgba(99, 110, 114, 0.14)",
          boxShadow: "0 8px 28px -12px rgba(255, 107, 53, 0.24)",
        }}
      >
        <div
          aria-hidden="true"
          className={
            recording || transcribing || thinking || speaking ? "ai-beam-spin-fast" : "ai-beam-spin"
          }
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: "1400px",
            height: "1400px",
            pointerEvents: "none",
            background:
              "conic-gradient(from 0deg, transparent 0deg, transparent 225deg, rgba(255,107,53,0.22) 270deg, #F7931E 318deg, #FF6B35 346deg, rgba(255,220,190,0.85) 355deg, transparent 360deg)",
          }}
        />
        <div
          className="relative z-10 bg-white flex flex-col"
          style={{ borderRadius: "16px", overflow: "hidden" }}
        >
        {/* Barre supérieure compacte sur une seule ligne pour préserver la hauteur mobile */}
        <div className="flex items-center justify-between gap-2 border-b border-winelio-gray/10 bg-winelio-light/70 px-3 sm:px-4 py-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-winelio-orange to-winelio-amber text-white shadow-sm">
              <svg aria-hidden="true" className="w-4 h-4 sm:w-5 sm:h-5 overflow-visible" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <line x1="4.5" y1="8.5" x2="4.5" y2="14.5" strokeLinecap="round" className="mic-bar-inner" />
                <line x1="19.5" y1="8.5" x2="19.5" y2="14.5" strokeLinecap="round" className="mic-bar-inner" />
                <g className="mic-capsule-anim">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 17.5a4.5 4.5 0 004.5-4.5v-1.5M12 17.5a4.5 4.5 0 01-4.5-4.5v-1.5m4.5 6v3m-2.75 0h5.5M12 14.75a2.25 2.25 0 01-2.25-2.25v-6a2.25 2.25 0 114.5 0v6a2.25 2.25 0 01-2.25 2.25z" />
                </g>
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-xs sm:text-sm font-bold text-winelio-dark truncate">Assistant vocal</p>
              <p className="text-[11px] text-winelio-gray truncate">
                {speaking ? "Vous répond…" : "Étape par étape"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={shareGeo}
              disabled={geoShared}
              className={`inline-flex items-center justify-center gap-1 rounded-xl border px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer min-h-8 ${
                geoShared
                  ? "border-green-200 bg-green-50 text-green-700"
                  : "border-winelio-gray/20 bg-white text-winelio-gray hover:border-winelio-orange/40 hover:text-winelio-dark"
              }`}
            >
              <svg aria-hidden="true" className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
              </svg>
              <span className="hidden sm:inline">{geoShared ? "Position active" : "Autour de moi"}</span>
              <span className="sm:hidden">{geoShared ? "GPS ✓" : "GPS"}</span>
            </button>

            <button
              type="button"
              aria-pressed={voiceEnabled}
              onClick={() => {
                const next = !voiceEnabled;
                setVoiceEnabled(next);
                if (!next) stopAudioPlayback();
              }}
              className={`inline-flex items-center justify-center gap-1 rounded-xl border px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer min-h-8 ${
                voiceEnabled
                  ? "border-winelio-orange/30 bg-winelio-orange/10 text-winelio-orange"
                  : "border-winelio-gray/20 bg-white text-winelio-gray"
              }`}
            >
              {voiceEnabled ? (
                <svg aria-hidden="true" className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
                </svg>
              ) : (
                <svg aria-hidden="true" className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75L19.5 12m0 0l2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6l4.72-4.72a.75.75 0 011.28.531V19.94a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.506-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.395C2.806 8.757 3.63 8.25 4.51 8.25H6.75z" />
                </svg>
              )}
              <span className="hidden sm:inline">{voiceEnabled ? "Voix IA active" : "Voix coupée"}</span>
              <span className="sm:hidden">{voiceEnabled ? "Voix" : "Muet"}</span>
            </button>
          </div>
        </div>

        {/* Fil de discussion (scroll interne confiné pour ne jamais pousser le bouton micro hors écran) */}
        <div
          ref={chatScrollRef}
          className="p-3 sm:p-4 space-y-3 min-h-[120px] max-h-[35dvh] sm:min-h-[260px] sm:max-h-[420px] overflow-y-auto overscroll-contain"
        >
          {messages.map((m) => {
            const pros = m.professionals ?? [];
            const pickedInMsg = pros.find((p) => p.id === selectedProId) ?? null;
            const isExpanded = Boolean(expandedProMsgIds[m.id]);
            const visiblePros = isExpanded ? pros : pros.slice(0, 3);
            const hiddenCount = pros.length - visiblePros.length;

            return (
            <div key={m.id} className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
              <div
                className={`max-w-[92%] sm:max-w-[88%] rounded-2xl px-3.5 sm:px-4 py-2.5 text-sm leading-relaxed break-words ${
                  m.role === "user"
                    ? "bg-gradient-to-br from-winelio-orange to-winelio-amber text-white rounded-br-sm"
                    : "bg-winelio-light text-winelio-dark border border-winelio-gray/10 rounded-bl-sm"
                }`}
              >
                {m.content}
              </div>

              {/* Cartes de professionnels cliquables : repliées automatiquement une fois le pro choisi */}
              {pros.length > 0 && (
                <div className="mt-2 w-full sm:max-w-[95%] space-y-1.5">
                  {pickedInMsg && !isExpanded ? (
                    <div className="flex items-center justify-between gap-2 rounded-xl border border-winelio-orange/35 bg-winelio-orange/8 px-3 py-2">
                      <span className="text-xs font-semibold text-winelio-dark truncate">
                        ✓{" "}
                        {pickedInMsg.company_name ??
                          `${pickedInMsg.first_name ?? ""} ${pickedInMsg.last_name ?? ""}`.trim()}{" "}
                        sélectionné
                      </span>
                      {pros.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedProMsgIds((prev) => ({ ...prev, [m.id]: true }))
                          }
                          className="shrink-0 text-xs font-semibold text-winelio-orange hover:underline cursor-pointer"
                        >
                          Changer ({pros.length})
                        </button>
                      )}
                    </div>
                  ) : (
                    <>
                      {visiblePros.map((p) => {
                        const label =
                          p.company_name ?? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
                        const isPicked = selectedProId === p.id;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => handleSelectProFromChat(p)}
                            className={`w-full flex items-center justify-between gap-2 rounded-xl border-2 px-3 py-2 text-left transition-all cursor-pointer ${
                              isPicked
                                ? "border-winelio-orange bg-winelio-orange/8"
                                : "border-winelio-gray/15 bg-white hover:border-winelio-orange/40"
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs sm:text-sm font-semibold text-winelio-dark line-clamp-1">
                                  {label}
                                </span>
                                {p.is_claimed && (
                                  <span className="shrink-0 rounded-full bg-green-50 px-1.5 py-0.5 text-[10px] font-semibold text-green-700 ring-1 ring-green-200">
                                    Vérifié
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-winelio-gray mt-0.5 truncate">
                                {[
                                  p.category_name,
                                  p.city,
                                  p.avg_rating != null ? `★ ${p.avg_rating.toFixed(1)}` : null,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </p>
                            </div>
                            <span
                              className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold ${
                                isPicked
                                  ? "bg-winelio-orange text-white"
                                  : "bg-winelio-orange/10 text-winelio-orange"
                              }`}
                            >
                              {isPicked ? "Choisi ✓" : "Choisir"}
                            </span>
                          </button>
                        );
                      })}
                      {hiddenCount > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedProMsgIds((prev) => ({ ...prev, [m.id]: true }))
                          }
                          className="w-full rounded-lg border border-winelio-gray/20 bg-winelio-light/60 py-1.5 text-xs font-semibold text-winelio-gray hover:text-winelio-dark cursor-pointer"
                        >
                          Voir {hiddenCount} autre{hiddenCount > 1 ? "s" : ""} professionnel
                          {hiddenCount > 1 ? "s" : ""}
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Contacts existants retrouvés */}
              {m.matchedContacts && m.matchedContacts.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {m.matchedContacts.map((c) => {
                    const isPicked = selectedContactId === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => handleSelectContactFromChat(c)}
                        className={`inline-flex items-center gap-2 rounded-xl border-2 px-3 py-2 text-xs font-semibold transition-all cursor-pointer ${
                          isPicked
                            ? "border-winelio-orange bg-winelio-orange text-white"
                            : "border-winelio-orange/30 bg-winelio-orange/5 text-winelio-dark hover:border-winelio-orange"
                        }`}
                      >
                        <span>
                          Utiliser {c.first_name} {c.last_name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Contacts retrouvés dans le répertoire du téléphone */}
              {m.deviceContacts && m.deviceContacts.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {m.deviceContacts.map((dc, idx) => (
                    <button
                      key={`${dc.full_name}-${dc.phone}-${idx}`}
                      type="button"
                      onClick={() => void applyImportedPhoneContact(dc, true)}
                      className="inline-flex items-center gap-2 rounded-xl border-2 border-winelio-orange/30 bg-winelio-orange/5 px-3 py-2 text-xs font-semibold text-winelio-dark hover:border-winelio-orange transition-all cursor-pointer"
                    >
                      <span>
                        Choisir {dc.full_name}
                        {dc.city ? ` (${dc.city})` : dc.phone ? ` (${dc.phone})` : ""}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            );
          })}

          {messages.length === 1 && !recording && !transcribing && !thinking && (
            <div className="pt-0.5 flex sm:flex-wrap gap-2 overflow-x-auto pb-1 scrollbar-none">
              {QUICK_PROMPTS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => void sendUserMessage(q)}
                  className="shrink-0 rounded-full border border-winelio-orange/25 bg-winelio-orange/5 px-3 py-1.5 text-xs font-medium text-winelio-dark hover:border-winelio-orange hover:bg-winelio-orange/10 transition-colors cursor-pointer"
                >
                  « {q} »
                </button>
              ))}
            </div>
          )}

          {(transcribing || thinking) && (
            <div className="flex items-center gap-2 text-xs font-medium text-winelio-gray px-1">
              <span className="h-3.5 w-3.5 rounded-full border-2 border-winelio-orange border-t-transparent animate-spin" />
              <span>{transcribing ? "Transcription de votre voix…" : "L'assistant réfléchit…"}</span>
            </div>
          )}
        </div>

        {/* Message d'erreur éventuel */}
        {assistantError && (
          <div
            role="alert"
            className="mx-4 mb-3 space-y-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>{assistantError}</span>
              <div className="flex flex-wrap items-center gap-2">
                {showSettingsCta && canOpenWinelioAppSettings() && (
                  <button
                    type="button"
                    disabled={openingSettings}
                    onClick={() => void handleAuthorizeMicOrOpenSettings()}
                    className="shrink-0 rounded-lg bg-winelio-orange px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-winelio-amber disabled:opacity-60 transition-colors cursor-pointer"
                  >
                    {openingSettings
                      ? "Ouverture…"
                      : micCanRePrompt
                        ? "Autoriser le micro"
                        : "Ouvrir les réglages"}
                  </button>
                )}
                {needsPlayStoreUpdate && (
                  <a
                    href="https://play.google.com/store/apps/details?id=app.winelio.mobile"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 rounded-lg border border-winelio-orange bg-white px-3 py-1.5 text-xs font-bold text-winelio-orange hover:bg-winelio-orange/5 transition-colors"
                  >
                    Mettre à jour sur Play Store
                  </a>
                )}
              </div>
            </div>
            {showManualAndroidGuide && (
              <div className="rounded-lg border border-red-200/80 bg-white px-3 py-2 text-[11px] leading-relaxed text-winelio-dark">
                <p className="font-semibold text-winelio-dark">
                  Activation manuelle sur Android (3 étapes) :
                </p>
                <ol className="mt-1 list-decimal pl-4 space-y-0.5 text-winelio-gray">
                  <li>Ouvrez l&apos;application <strong>Paramètres</strong> de votre téléphone</li>
                  <li>Allez dans <strong>Applications → Winelio → Autorisations</strong></li>
                  <li>Activez <strong>Microphone</strong> et <strong>Contacts</strong>, puis revenez ici</li>
                </ol>
              </div>
            )}
          </div>
        )}

        {/* Zone de capture vocale + saisie texte */}
        <div className="border-t border-winelio-gray/10 bg-winelio-light/50 p-3 sm:p-3.5">
          {recording ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 rounded-2xl border-2 border-winelio-orange bg-winelio-orange/8 px-3.5 py-3">
              <div className="flex items-center justify-center sm:justify-start gap-2.5">
                <span className="relative flex h-3 w-3 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-winelio-orange opacity-75" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-winelio-orange" />
                </span>
                <span className="text-sm font-bold text-winelio-dark whitespace-nowrap">
                  Écoute en cours · {formatDuration(recordingSec)}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={cancelRecording}
                  className="inline-flex items-center justify-center rounded-xl border border-winelio-gray/25 bg-white px-3 py-2 text-xs font-semibold text-winelio-gray hover:text-winelio-dark cursor-pointer min-h-10"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={finishRecording}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-winelio-orange px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-winelio-amber whitespace-nowrap cursor-pointer min-h-10"
                >
                  Envoyer
                </button>
              </div>
            </div>
          ) : (
            <div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void sendUserMessage(inputText);
                }}
                className="flex items-center gap-2 sm:gap-2.5"
              >
                <div className="group relative shrink-0">
                  {!transcribing && !thinking && (
                    <span
                      aria-hidden="true"
                      className="mic-invite-ring pointer-events-none absolute inset-0 rounded-2xl border-2 border-winelio-orange bg-winelio-orange/25"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => void startRecording()}
                    disabled={transcribing || thinking}
                    aria-label="Parler au microphone"
                    className="relative inline-flex h-12 items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-br from-winelio-orange to-winelio-amber px-3.5 sm:px-4 text-xs sm:text-sm font-bold text-white shadow-md shadow-winelio-orange/25 hover:opacity-95 active:scale-95 disabled:opacity-50 transition-transform cursor-pointer"
                  >
                    <svg
                      aria-hidden="true"
                      className="w-5 h-5 shrink-0 overflow-visible"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      {/* Barres d'onde vocale animées de part et d'autre du micro */}
                      <line
                        x1="4.5"
                        y1="8.5"
                        x2="4.5"
                        y2="14.5"
                        strokeLinecap="round"
                        className={transcribing || thinking ? "" : "mic-bar-inner"}
                      />
                      <line
                        x1="1.8"
                        y1="10"
                        x2="1.8"
                        y2="13"
                        strokeLinecap="round"
                        className={transcribing || thinking ? "" : "mic-bar-outer"}
                      />
                      <line
                        x1="19.5"
                        y1="8.5"
                        x2="19.5"
                        y2="14.5"
                        strokeLinecap="round"
                        className={transcribing || thinking ? "" : "mic-bar-inner"}
                      />
                      <line
                        x1="22.2"
                        y1="10"
                        x2="22.2"
                        y2="13"
                        strokeLinecap="round"
                        className={transcribing || thinking ? "" : "mic-bar-outer"}
                      />
                      {/* Capsule et pied du micro avec léger mouvement vivant */}
                      <g className={transcribing || thinking ? "" : "mic-capsule-anim"}>
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 17.5a4.5 4.5 0 004.5-4.5v-1.5M12 17.5a4.5 4.5 0 01-4.5-4.5v-1.5m4.5 6v3m-2.75 0h5.5M12 14.75a2.25 2.25 0 01-2.25-2.25v-6a2.25 2.25 0 114.5 0v6a2.25 2.25 0 01-2.25 2.25z"
                        />
                      </g>
                    </svg>
                    <span>Parler</span>
                  </button>
                </div>

                <div className="flex-1 min-w-0">
                  <label htmlFor="ai-chat-input" className="sr-only">
                    Écrire un message à l&apos;assistant Winelio
                  </label>
                  <input
                    id="ai-chat-input"
                    type="text"
                    name="message"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="Écrire un message…"
                    enterKeyHint="send"
                    className="h-12 w-full rounded-2xl border border-winelio-gray/20 bg-white px-4 text-sm text-winelio-dark focus:border-winelio-orange focus:outline-none focus:ring-2 focus:ring-winelio-orange/15"
                  />
                </div>

                <button
                  type="submit"
                  disabled={!inputText.trim() || thinking || transcribing}
                  aria-label="Envoyer le message"
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-winelio-gray/20 bg-white text-winelio-orange hover:border-winelio-orange disabled:opacity-40 transition-colors cursor-pointer"
                >
                  <svg aria-hidden="true" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                  </svg>
                </button>
              </form>

              {/* Micro-indicateur animé léger juste sous le bouton micro */}
              {(speaking || (messages.length === 1 && !transcribing && !thinking)) && (
                <div className="mt-2 flex items-center gap-2 pl-1 text-[11px] font-medium text-winelio-gray">
                  <span aria-hidden="true" className="inline-flex items-end gap-0.5 h-3 w-4 justify-center">
                    <span
                      className={`w-0.5 h-2.5 rounded-full bg-winelio-orange ${
                        speaking ? "mic-eq-bar-live" : "mic-eq-bar"
                      }`}
                    />
                    <span
                      style={{ animationDelay: "150ms" }}
                      className={`w-0.5 h-3 rounded-full bg-winelio-orange ${
                        speaking ? "mic-eq-bar-live" : "mic-eq-bar"
                      }`}
                    />
                    <span
                      style={{ animationDelay: "300ms" }}
                      className={`w-0.5 h-2 rounded-full bg-winelio-amber ${
                        speaking ? "mic-eq-bar-live" : "mic-eq-bar"
                      }`}
                    />
                  </span>
                  <span>
                    {speaking
                      ? "L'assistant vous répond à voix haute…"
                      : "Touchez le micro pour parler naturellement"}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Raccourci mobile vers la fiche récapitulative située en dessous */}
          {completedSectionsCount > 0 && (
            <button
              type="button"
              onClick={() => summaryCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
              className="mt-2.5 lg:hidden w-full flex items-center justify-between rounded-xl bg-winelio-orange/10 border border-winelio-orange/25 px-3 py-2 text-xs font-semibold text-winelio-orange cursor-pointer"
            >
              <span>
                Fiche pré-remplie : {completedSectionsCount}/3 étape{completedSectionsCount > 1 ? "s" : ""}
              </span>
              <span className="inline-flex items-center gap-1">
                {completedSectionsCount === 3 ? "Valider et envoyer" : "Voir la fiche"}
                <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </span>
            </button>
          )}
        </div>
        </div>
      </div>

      {/* Colonne Fiche Récapitulative en direct + Validation finale */}
      <div
        ref={summaryCardRef}
        className="lg:col-span-5 rounded-2xl border border-winelio-gray/15 bg-white p-4 sm:p-5 shadow-sm space-y-3.5 sm:space-y-4 scroll-mt-20"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold text-winelio-dark">Fiche remplie en direct</h2>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() =>
                assistantCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
              className="lg:hidden inline-flex items-center gap-1 rounded-lg bg-winelio-orange/10 px-2.5 py-1 text-xs font-semibold text-winelio-orange cursor-pointer"
            >
              <span>↑ Micro</span>
            </button>
            <span className="text-xs text-winelio-gray">Modifiable à tout moment</span>
          </div>
        </div>

        {/* 1. Professionnel */}
        <div className="rounded-xl border border-winelio-gray/15 p-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-winelio-gray">
              1. Professionnel
            </span>
            <button
              type="button"
              onClick={() => onSwitchToClassicStep(1)}
              className="text-xs font-medium text-winelio-orange hover:underline cursor-pointer"
            >
              Chercher manuellement
            </button>
          </div>
          {proLabel ? (
            <div className="mt-1.5">
              <p className="text-sm font-semibold text-winelio-dark">{proLabel}</p>
              {selectedProMeta && (
                <p className="text-xs text-winelio-gray">
                  {[selectedProMeta.category_name, selectedProMeta.city].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
          ) : (
            <p className="mt-1.5 text-xs text-winelio-gray italic">
              Dites par exemple : « Je cherche un plombier à Maubeuge »
            </p>
          )}
        </div>

        {/* 2. Besoin & Urgence */}
        <div className="rounded-xl border border-winelio-gray/15 p-3.5 space-y-2.5">
          <label htmlFor="ai-summary-description" className="block text-xs font-semibold uppercase tracking-wider text-winelio-gray">
            2. Besoin &amp; urgence
          </label>
          <textarea
            id="ai-summary-description"
            rows={2}
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            placeholder="Le résumé du besoin s'écrira ici…"
            className="w-full rounded-xl border border-winelio-gray/20 px-3 py-2 text-sm text-winelio-dark focus:border-winelio-orange focus:outline-none focus:ring-2 focus:ring-winelio-orange/15"
          />
          <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Niveau d'urgence">
            {(
              [
                ["urgent", "Urgent"],
                ["normal", "Normal"],
                ["flexible", "Flexible"],
              ] as const
            ).map(([val, label]) => (
              <button
                key={val}
                type="button"
                role="radio"
                aria-checked={urgency === val}
                onClick={() => onUrgencyChange(val)}
                className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                  urgency === val
                    ? "border-winelio-orange bg-winelio-orange/10 text-winelio-orange"
                    : "border-winelio-gray/15 bg-white text-winelio-gray hover:border-winelio-gray/30"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* 3. Recommandé */}
        <div className="rounded-xl border border-winelio-gray/15 p-3.5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-winelio-gray">
              3. Personne recommandée
            </span>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => void handleImportFromPhone()}
                className="inline-flex items-center gap-1 rounded-lg border border-winelio-orange/30 bg-winelio-orange/5 px-2.5 py-1 text-xs font-semibold text-winelio-orange hover:border-winelio-orange transition-colors cursor-pointer"
              >
                <svg aria-hidden="true" className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                </svg>
                <span>Répertoire</span>
              </button>
              {!selectedContactObj && (
                <button
                  type="button"
                  onClick={() => setEditingContactDetails((v) => !v)}
                  className="text-xs font-medium text-winelio-orange hover:underline cursor-pointer"
                >
                  {editingContactDetails ? "Réduire" : "Clavier"}
                </button>
              )}
            </div>
          </div>

          {selectedContactObj ? (
            <div className="flex items-center justify-between gap-2 rounded-lg bg-winelio-orange/5 border border-winelio-orange/20 px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-winelio-dark">
                  {selectedContactObj.first_name} {selectedContactObj.last_name}
                </p>
                <p className="text-xs text-winelio-gray truncate">{selectedContactObj.email}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedContactId(null)}
                className="text-xs font-medium text-winelio-gray hover:text-winelio-dark cursor-pointer"
              >
                Changer
              </button>
            </div>
          ) : (
            <>
              <div className="text-xs text-winelio-dark space-y-1">
                {(contactForm.first_name || contactForm.last_name) && (
                  <p className="font-semibold text-sm">
                    {contactForm.first_name} {contactForm.last_name}
                  </p>
                )}
                {contactForm.email && <p className="text-winelio-gray">{contactForm.email}</p>}
                {contactForm.phone && <p className="text-winelio-gray">{contactForm.phone}</p>}
                {(contactForm.address || contactForm.postal_code || contactForm.city) && (
                  <p className="text-winelio-gray">
                    {[contactForm.address, `${contactForm.postal_code} ${contactForm.city}`.trim()]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                )}
                {missingContactFields.length > 0 && (
                  <p className="text-winelio-gray italic">
                    À préciser : {missingContactFields.join(", ")}
                  </p>
                )}
                {selfEmailConflict && (
                  <p className="text-red-600 font-medium">
                    Le recommandé ne peut pas utiliser votre propre adresse e-mail.
                  </p>
                )}
                {!contactFromDirectory && (contactForm.email || contactForm.first_name || contactForm.last_name) && (
                  <div className="mt-2 rounded-lg border border-amber-300/80 bg-amber-50/90 px-3 py-2 text-[11px] leading-relaxed text-amber-900 flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <strong>Vérification importante :</strong> contrôlez l&apos;orthographe exacte du nom et surtout de l&apos;adresse e-mail{contactForm.email ? ` (${contactForm.email})` : ""} avant l&apos;envoi, sinon la recommandation ne sera pas valable.
                    </span>
                    {!editingContactDetails && (
                      <button
                        type="button"
                        onClick={() => setEditingContactDetails(true)}
                        className="shrink-0 rounded-md border border-amber-400 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100 transition-colors cursor-pointer"
                      >
                        Vérifier / Corriger
                      </button>
                    )}
                  </div>
                )}
              </div>

              {(editingContactDetails || Object.keys(contactErrors).length > 0) && (
                <div className="pt-2 border-t border-winelio-gray/10 space-y-2.5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label htmlFor="ai-cf-first" className="block text-xs font-medium text-winelio-dark mb-1">
                        Prénom
                      </label>
                      <input
                        id="ai-cf-first"
                        name="first_name"
                        autoComplete="given-name"
                        type="text"
                        value={contactForm.first_name}
                        onChange={(e) => setField("first_name", e.target.value)}
                        className={inputCls(!!contactErrors.first_name)}
                      />
                    </div>
                    <div>
                      <label htmlFor="ai-cf-last" className="block text-xs font-medium text-winelio-dark mb-1">
                        Nom
                      </label>
                      <input
                        id="ai-cf-last"
                        name="last_name"
                        autoComplete="family-name"
                        type="text"
                        value={contactForm.last_name}
                        onChange={(e) => setField("last_name", e.target.value)}
                        className={inputCls(!!contactErrors.last_name)}
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="ai-cf-email" className="block text-xs font-medium text-winelio-dark mb-1">
                      E-mail
                    </label>
                    <input
                      id="ai-cf-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      autoCorrect="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      value={contactForm.email}
                      onChange={(e) => setField("email", e.target.value)}
                      className={inputCls(!!contactErrors.email || selfEmailConflict)}
                    />
                  </div>
                  <div>
                    <label htmlFor="ai-cf-phone" className="block text-xs font-medium text-winelio-dark mb-1">
                      Téléphone
                    </label>
                    <input
                      id="ai-cf-phone"
                      name="phone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel-national"
                      value={contactForm.phone}
                      onChange={(e) => setField("phone", e.target.value)}
                      className={inputCls(!!contactErrors.phone)}
                    />
                  </div>
                  <div>
                    <label htmlFor="ai-cf-address" className="block text-xs font-medium text-winelio-dark mb-1">
                      Adresse
                    </label>
                    <input
                      id="ai-cf-address"
                      name="address"
                      type="text"
                      autoComplete="street-address"
                      value={contactForm.address}
                      onChange={(e) => setField("address", e.target.value)}
                      className={inputCls(!!contactErrors.address)}
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label htmlFor="ai-cf-zip" className="block text-xs font-medium text-winelio-dark mb-1">
                        Code postal
                      </label>
                      <input
                        id="ai-cf-zip"
                        name="postal_code"
                        type="text"
                        inputMode="numeric"
                        autoComplete="postal-code"
                        value={contactForm.postal_code}
                        onChange={(e) => setField("postal_code", e.target.value)}
                        className={inputCls(!!contactErrors.postal_code)}
                      />
                    </div>
                    <div>
                      <label htmlFor="ai-cf-city" className="block text-xs font-medium text-winelio-dark mb-1">
                        Ville
                      </label>
                      <input
                        id="ai-cf-city"
                        name="city"
                        type="text"
                        autoComplete="address-level2"
                        value={contactForm.city}
                        onChange={(e) => setField("city", e.target.value)}
                        className={inputCls(!!contactErrors.city)}
                      />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Consentement RGPD obligatoire + bouton d'envoi */}
        <div className="flex items-start gap-3 rounded-xl border border-winelio-orange/25 bg-winelio-orange/5 p-3.5">
          <input
            id="ai-third-party-consent"
            type="checkbox"
            checked={thirdPartyConsent}
            onChange={(e) => setThirdPartyConsent(e.target.checked)}
            className="mt-1 h-4 w-4 shrink-0 accent-winelio-orange cursor-pointer"
          />
          <label htmlFor="ai-third-party-consent" className="text-xs leading-relaxed text-winelio-dark cursor-pointer">
            Je confirme avoir obtenu le consentement explicite de cette personne pour transmettre ses coordonnées à Winelio et au professionnel recommandé.{" "}
            <span className="font-semibold text-winelio-orange">Obligatoire</span>
          </label>
        </div>

        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit || submitting}
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-winelio-orange px-5 py-3.5 text-sm font-bold text-white shadow-md shadow-winelio-orange/25 transition-all hover:bg-winelio-amber disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none cursor-pointer"
        >
          {submitting ? (
            <>
              <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
              Envoi en cours…
            </>
          ) : (
            "Envoyer la recommandation"
          )}
        </button>
      </div>
    </div>
  );
}
