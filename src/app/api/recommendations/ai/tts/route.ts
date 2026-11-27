import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/get-user";
import { isAiAssistantAllowed } from "@/lib/ai-assistant-access";

const GRADIUM_DEFAULT_BASE_URL = "https://api.gradium.ai";
const DEFAULT_GRADIUM_VOICE_ID = "6oIkS98REoVZ1dEw"; // Apolline (fr)
const GEMINI_TTS_MODELS = [
  "gemini-3.8-flash-lite-tts",
  "gemini-3.8-flash-tts",
  "gemini-3.1-flash-tts-preview",
  "gemini-2.5-flash-preview-tts",
];
const GEMINI_VOICE_NAME = "Aoede";
const MISTRAL_TTS_MODEL = "voxtral-mini-tts-2603";
const DEFAULT_MISTRAL_VOICE_ID = "a3e41ea8-020b-44c0-8d8b-f6cc03524e31";
const MAX_TTS_CHARS = 600;

let cachedGradiumVoiceId: string | null = null;
let gradiumCooldownUntil = 0;
let googleCloudTtsCooldownUntil = 0;
let mistralBillingInactive = false;
let geminiModelCursor = 0;
const geminiCooldownUntil = new Map<string, number>();

type GradiumVoiceItem = {
  uid: string;
  name?: string;
  language?: string | null;
  rank?: number | null;
  tags?: { category?: string | null; value: string }[];
};

async function resolveGradiumFrenchVoiceId(baseUrl: string, apiKey: string): Promise<string | null> {
  const envVoice = process.env.GRADIUM_VOICE_ID?.trim() || DEFAULT_GRADIUM_VOICE_ID;
  if (envVoice) return envVoice;
  if (cachedGradiumVoiceId) return cachedGradiumVoiceId;

  const res = await fetch(
    `${baseUrl}/api/voices/?include_catalog=true&language=fr&gender=female`,
    { headers: { "x-api-key": apiKey } },
  ).catch(() => null);

  if (!res || !res.ok) {
    if (res && (res.status === 401 || res.status === 402 || res.status === 403)) {
      gradiumCooldownUntil = Date.now() + 15 * 60_000;
    }
    return null;
  }
  const list = (await res.json().catch(() => null)) as GradiumVoiceItem[] | null;
  if (!Array.isArray(list) || list.length === 0) return null;

  const frList = list
    .filter((v) => v.uid && (!v.language || v.language.toLowerCase().startsWith("fr")))
    .sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999));

  const conversational = frList.find((v) =>
    v.tags?.some((t) => /conversational|customer service/i.test(t.value)),
  );
  const picked = conversational ?? frList[0] ?? list[0];
  if (picked?.uid) {
    cachedGradiumVoiceId = picked.uid;
    return picked.uid;
  }
  return null;
}

function normalizeForSpeech(raw: string): string {
  return raw
    .replace(/[*_`#>]/g, "")
    .replace(/1️⃣/g, "Premier choix :")
    .replace(/2️⃣/g, "Deuxième choix :")
    .replace(/3️⃣/g, "Troisième choix :")
    .replace(/winelio\.app/gi, "winelio point app")
    .replace(
      /(?<![a-zàâäéèêëîïôùûüçœæ])[A-ZÀÂÄÉÈÊËÎÏÔÙÛÜÇŒÆ]{2,}(?![a-zàâäéèêëîïôùûüçœæ])/gu,
      (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
    )
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, MAX_TTS_CHARS);
}

function buildCleanWavFromGeminiAudio(raw: Buffer): ArrayBuffer {
  let sampleRate = 24000;
  let numChannels = 1;
  let bitsPerSample = 16;
  let pcm: Buffer = raw;

  // Gemini 3.8 TTS renvoie déjà un conteneur RIFF/WAVE suivi d'un chunk binaire C2PA (~7,6 Ko) :
  // lire tout le buffer comme du PCM brut provoquait un "crach" de bruit numérique en fin de phrase.
  if (
    raw.length > 44 &&
    raw.subarray(0, 4).toString("ascii") === "RIFF" &&
    raw.subarray(8, 12).toString("ascii") === "WAVE"
  ) {
    let offset = 12;
    while (offset + 8 <= raw.length) {
      const chunkId = raw.subarray(offset, offset + 4).toString("ascii");
      const chunkSize = raw.readUInt32LE(offset + 4);
      const dataStart = offset + 8;
      if (dataStart + chunkSize > raw.length) break;

      if (chunkId === "fmt " && chunkSize >= 16) {
        numChannels = raw.readUInt16LE(dataStart + 2);
        sampleRate = raw.readUInt32LE(dataStart + 4);
        bitsPerSample = raw.readUInt16LE(dataStart + 14);
      } else if (chunkId === "data") {
        pcm = Buffer.from(raw.subarray(dataStart, dataStart + chunkSize));
        break;
      }
      offset = dataStart + chunkSize + (chunkSize % 2);
    }
  } else {
    pcm = Buffer.from(raw);
  }

  // Longueur paire obligatoire + micro-fondu de sortie de 15 ms pour éliminer tout clic/pop de fin
  const evenLen = pcm.length & ~1;
  pcm = pcm.subarray(0, evenLen);
  if (bitsPerSample === 16 && pcm.length >= 4) {
    const totalSamples = pcm.length / 2;
    const fadeSamples = Math.min(totalSamples, Math.floor(sampleRate * 0.015 * numChannels));
    const startSample = totalSamples - fadeSamples;
    for (let i = 0; i < fadeSamples; i++) {
      const idx = (startSample + i) * 2;
      const gain = (fadeSamples - 1 - i) / fadeSamples;
      const val = Math.round(pcm.readInt16LE(idx) * gain);
      pcm.writeInt16LE(val, idx);
    }
  }

  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const wav = Buffer.alloc(44 + pcm.length);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + pcm.length, 4);
  wav.write("WAVE", 8);
  wav.write("fmt ", 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(numChannels, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(byteRate, 28);
  wav.writeUInt16LE(blockAlign, 32);
  wav.writeUInt16LE(bitsPerSample, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(pcm.length, 40);
  pcm.copy(wav, 44);
  return wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength);
}

async function handleTtsRequest(rawText: string): Promise<Response> {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  if (!isAiAssistantAllowed(user)) {
    return NextResponse.json({ error: "Fonctionnalité réservée aux comptes pilotes." }, { status: 403 });
  }

  const input = normalizeForSpeech(rawText);
  if (!input) {
    return NextResponse.json({ error: "Texte vide." }, { status: 400 });
  }

  const gradiumKey = process.env.GRADIUM_API_KEY?.trim();
  const googleTtsKey = (process.env.GOOGLE_TTS_API_KEY || process.env.GEMINI_API_KEY)?.trim();
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  const mistralKey = process.env.MISTRAL_API_KEY?.trim();

  // 1. Priorité n°1 : Gradium AI en flux direct (~60-150 ms TTFB, voix française Apolline)
  // Bascule automatiquement sur Google TTS dès que les crédits Gradium sont épuisés (402/403/quota)
  if (gradiumKey && Date.now() >= gradiumCooldownUntil) {
    const gradiumBase = (process.env.GRADIUM_BASE_URL?.trim() || GRADIUM_DEFAULT_BASE_URL).replace(
      /\/+$/,
      "",
    );
    const gradiumVoiceId = await resolveGradiumFrenchVoiceId(gradiumBase, gradiumKey);
    if (gradiumVoiceId) {
      const gradRes = await fetch(`${gradiumBase}/api/speech/tts`, {
        method: "POST",
        headers: {
          "x-api-key": gradiumKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: input,
          voice_id: gradiumVoiceId,
          output_format: "wav",
          only_audio: true,
          json_config: {
            temp: 0.5,
            rewrite_rules: "fr",
          },
        }),
      }).catch(() => null);

      if (gradRes && gradRes.ok && gradRes.body) {
        return new Response(gradRes.body, {
          status: 200,
          headers: {
            "Content-Type": "audio/wav",
            "Cache-Control": "no-store",
            "X-TTS-Provider": "gradium",
          },
        });
      } else if (gradRes) {
        const errBody = await gradRes.text().catch(() => "");
        if (
          gradRes.status === 401 ||
          gradRes.status === 402 ||
          gradRes.status === 403 ||
          /credit|quota|balance|insufficient|limit/i.test(errBody)
        ) {
          gradiumCooldownUntil = Date.now() + 15 * 60_000;
        } else if (gradRes.status === 429) {
          gradiumCooldownUntil = Date.now() + 5_000;
        }
        console.warn("[ai/tts] Bascule secours depuis Gradium:", gradRes.status);
      }
    }
  }

  // 2. Priorité n°2 : Google TTS (Cloud Text-to-Speech Neural2 ultra-rapide si activé, sinon Gemini TTS Aoede)
  if (googleTtsKey && Date.now() >= googleCloudTtsCooldownUntil) {
    const cloudRes = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${googleTtsKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: { text: input },
          voice: { languageCode: "fr-FR", name: "fr-FR-Neural2-A" },
          audioConfig: { audioEncoding: "MP3", speakingRate: 1.03 },
        }),
      },
    ).catch(() => null);

    if (cloudRes && cloudRes.ok) {
      const cloudJson = (await cloudRes.json().catch(() => null)) as { audioContent?: string } | null;
      if (cloudJson?.audioContent) {
        const mp3 = Buffer.from(cloudJson.audioContent, "base64");
        return new Response(mp3.buffer.slice(mp3.byteOffset, mp3.byteOffset + mp3.byteLength), {
          status: 200,
          headers: {
            "Content-Type": "audio/mpeg",
            "Cache-Control": "no-store",
            "X-TTS-Provider": "google-cloud-tts",
          },
        });
      }
    } else if (cloudRes && (cloudRes.status === 401 || cloudRes.status === 403 || cloudRes.status === 429)) {
      googleCloudTtsCooldownUntil = Date.now() + 15 * 60_000;
    }
  }

  // 2bis. Google Gemini TTS (voix française Aoede déjà active sur GEMINI_API_KEY)
  if (geminiKey) {
    const now = Date.now();
    const startIdx = geminiModelCursor++ % GEMINI_TTS_MODELS.length;
    const ordered = [
      ...GEMINI_TTS_MODELS.slice(startIdx),
      ...GEMINI_TTS_MODELS.slice(0, startIdx),
    ].sort((a, b) => {
      const aCooling = (geminiCooldownUntil.get(a) ?? 0) > now ? 1 : 0;
      const bCooling = (geminiCooldownUntil.get(b) ?? 0) > now ? 1 : 0;
      return aCooling - bCooling;
    });

    for (const model of ordered) {
      const gemRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: input }] }],
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: GEMINI_VOICE_NAME },
                },
              },
            },
          }),
        },
      ).catch(() => null);

      if (gemRes?.status === 429) {
        geminiCooldownUntil.set(model, Date.now() + 55_000);
        continue;
      }

      if (gemRes && gemRes.ok) {
        const gemJson = await gemRes.json().catch(() => null);
        const b64 = gemJson?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (typeof b64 === "string" && b64.length > 0) {
          const rawAudio = Buffer.from(b64, "base64");
          return new Response(buildCleanWavFromGeminiAudio(rawAudio), {
            status: 200,
            headers: {
              "Content-Type": "audio/wav",
              "Cache-Control": "no-store",
            },
          });
        }
      }
    }
  }

  // 2. Secours Mistral Voxtral TTS si budget actif
  if (mistralKey && !mistralBillingInactive) {
    const voiceId = process.env.MISTRAL_TTS_VOICE_ID?.trim() || DEFAULT_MISTRAL_VOICE_ID;
    const res = await fetch("https://api.mistral.ai/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${mistralKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MISTRAL_TTS_MODEL,
        input,
        voice_id: voiceId,
        response_format: "mp3",
      }),
    }).catch(() => null);

    if (res?.status === 402) {
      mistralBillingInactive = true;
    } else if (res && res.ok) {
      const contentType = res.headers.get("content-type") || "";
      let audioBuffer: ArrayBuffer;
      if (contentType.includes("application/json")) {
        const json = (await res.json()) as { audio_data?: string; data?: string };
        const b64 = json.audio_data || json.data;
        if (!b64) return NextResponse.json({ error: "Réponse audio invalide." }, { status: 502 });
        const decoded = Buffer.from(b64, "base64");
        audioBuffer = decoded.buffer.slice(decoded.byteOffset, decoded.byteOffset + decoded.byteLength);
      } else {
        audioBuffer = await res.arrayBuffer();
      }
      return new Response(audioBuffer, {
        status: 200,
        headers: {
          "Content-Type": "audio/mpeg",
          "Cache-Control": "no-store",
        },
      });
    }
  }

  return NextResponse.json({ error: "Synthèse vocale indisponible." }, { status: 502 });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  return handleTtsRequest(searchParams.get("text") ?? "");
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { text?: string } | null;
  return handleTtsRequest(typeof body?.text === "string" ? body.text : "");
}
