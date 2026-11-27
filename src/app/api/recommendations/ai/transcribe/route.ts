import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/get-user";
import { isAiAssistantAllowed } from "@/lib/ai-assistant-access";

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

const WHISPER_PROMPT =
  "Discussion vocale en français sur Winelio. Villes comme Hautmont, Maubeuge, Lille, Valenciennes, Lyon, Paris. Métiers : plombier, électricien, immobilier, DJ animateur, mariage, chauffage, couverture, serrurerie, menuiserie, peinture.";

const HALLUCINATION_PATTERNS = [
  /sous-titr(es?|age)/i,
  /radio-canada/i,
  /t[ée]l[ée]-qu[ée]bec/i,
  /^merci d'avoir regard[ée]/i,
  /^abonnez-vous/i,
  /amara\.org/i,
  /^merci\.?$/i,
];

function extFromMime(mime: string): { ext: string; mime: string } {
  const lower = mime.toLowerCase();
  if (lower.includes("mp4") || lower.includes("m4a") || lower.includes("aac")) {
    return { ext: "m4a", mime: "audio/mp4" };
  }
  if (lower.includes("ogg")) return { ext: "ogg", mime: "audio/ogg" };
  if (lower.includes("wav")) return { ext: "wav", mime: "audio/wav" };
  if (lower.includes("mpeg") || lower.includes("mp3")) return { ext: "mp3", mime: "audio/mpeg" };
  return { ext: "webm", mime: "audio/webm" };
}

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  if (!isAiAssistantAllowed(user)) {
    return NextResponse.json({ error: "Fonctionnalité réservée aux comptes pilotes." }, { status: 403 });
  }

  const groqKey = process.env.GROQ_API_KEY?.trim();
  if (!groqKey) {
    return NextResponse.json(
      { error: "Transcription vocale non configurée côté serveur (GROQ_API_KEY)." },
      { status: 503 },
    );
  }

  const form = await req.formData().catch(() => null);
  const rawAudio = form?.get("audio");
  if (!(rawAudio instanceof Blob) || rawAudio.size === 0) {
    return NextResponse.json({ error: "Fichier audio manquant." }, { status: 400 });
  }
  if (rawAudio.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "Enregistrement trop volumineux (max 10 Mo)." }, { status: 413 });
  }

  const { ext, mime } = extFromMime(rawAudio.type || "audio/webm");
  const bytes = await rawAudio.arrayBuffer();
  const file = new File([bytes], `vocal.${ext}`, { type: mime });

  const upstream = new FormData();
  upstream.append("file", file);
  upstream.append("model", "whisper-large-v3-turbo");
  upstream.append("language", "fr");
  upstream.append("temperature", "0");
  upstream.append("prompt", WHISPER_PROMPT);

  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${groqKey}` },
    body: upstream,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error("[ai/transcribe] Groq error:", res.status, errText.slice(0, 300));
    return NextResponse.json(
      { error: "La transcription vocale a échoué. Réessayez ou saisissez votre message au clavier." },
      { status: 502 },
    );
  }

  const data = (await res.json()) as { text?: string };
  const text = (data.text ?? "").trim();
  const alphaNum = text.replace(/[\s.,!?…\-:;'"«»()[\]]+/g, "");

  if (alphaNum.length < 2 || HALLUCINATION_PATTERNS.some((re) => re.test(text))) {
    return NextResponse.json({ text: "" }, { headers: { "Cache-Control": "no-store" } });
  }

  return NextResponse.json({ text }, { headers: { "Cache-Control": "no-store" } });
}
