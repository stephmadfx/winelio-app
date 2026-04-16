/**
 * Génère les fichiers audio MP3 pour chaque slide via Mistral Voxtral TTS.
 * Met à jour slides.json avec les durées synchronisées (frames = durée audio × 30fps).
 *
 * Usage : node scripts/generate-audio.mjs [--voice <voice_id>] [--dry-run]
 */

import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.join(__dirname, "..");
const SLIDES_JSON  = path.join(ROOT, "editor", "slides.json");
const AUDIO_DIR    = path.join(ROOT, "public", "assets", "audio");
const CONFIG_TS    = path.join(ROOT, "src", "config.ts");
const FPS          = 30;

// Marie - Excited : voix française féminine native (fr_fr), ton commercial/dynamique
const DEFAULT_VOICE_ID = "2f62b1af-aea3-4079-9d10-7ca665ee7243";
const MISTRAL_API_KEY  = process.env.MISTRAL_API_KEY || "";
const MODEL            = "voxtral-mini-tts-2603";

// ── Helpers ────────────────────────────────────────────────────────────────────

function log(msg) { console.log(`[audio] ${msg}`); }

function getAudioDurationSeconds(filePath) {
  try {
    const out = execFileSync("ffprobe", [
      "-v", "quiet",
      "-print_format", "json",
      "-show_format",
      filePath
    ], { encoding: "utf-8" });
    const data = JSON.parse(out);
    return parseFloat(data.format.duration);
  } catch {
    return null;
  }
}

function generateConfigTs(slides) {
  const slidesTs = slides.map(s => {
    const textsTs = s.texts
      .map(t => `      "${t.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)
      .join(",\n");
    return `  {\n    id: "${s.id}",\n    label: "${s.label}",\n    frames: ${s.frames},\n    texts: [\n${textsTs}\n    ]\n  }`;
  }).join(",\n");

  return `// ── Source de vérité unique — éditée via http://localhost:4001 ───────────────
export interface Slide {
  id: string;
  label: string;
  frames: number;
  texts: string[];
}

export const SLIDES: Slide[] = [
${slidesTs}
];

export const FPS = 30;
export const TOTAL_FRAMES = SLIDES.reduce((s, sl) => s + sl.frames, 0);
`;
}

async function callVoxtralTTS(text, voiceId, refAudioBase64, outputPath) {
  const body = {
    model: MODEL,
    input: text,
    response_format: "mp3",
  };

  if (refAudioBase64) {
    // Voice cloning avec audio de référence (prioritaire sur voice_id)
    body.ref_audio = refAudioBase64;
  } else {
    body.voice_id = voiceId;
  }

  const res = await fetch("https://api.mistral.ai/v1/audio/speech", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${MISTRAL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API Mistral TTS error ${res.status}: ${err}`);
  }

  const json = await res.json();

  if (json.audio_data) {
    const audioBytes = Buffer.from(json.audio_data, "base64");
    fs.writeFileSync(outputPath, audioBytes);
    return audioBytes.length;
  } else if (json.data) {
    const audioBytes = Buffer.from(json.data, "base64");
    fs.writeFileSync(outputPath, audioBytes);
    return audioBytes.length;
  } else {
    throw new Error(`Format de réponse inconnu: ${JSON.stringify(json).slice(0, 200)}`);
  }
}

function normalizeForTTS(text) {
  // Convertir les séquences tout en MAJUSCULES en forme lisible
  // pour que le TTS prononce "PAIE" comme un mot et non lettre par lettre.
  // On utilise un lookbehind/lookahead sur espaces et ponctuation (pas \b car
  // \b ne fonctionne pas avec les chars Unicode comme Ç).
  return text.replace(/(?<![a-zàâäéèêëîïôùûüçœæ])[A-ZÀÂÄÉÈÊËÎÏÔÙÛÜÇŒÆ]{2,}(?![a-zàâäéèêëîïôùûüçœæ])/gu, word =>
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  );
}

function buildSlideText(slide) {
  return slide.texts
    .map((t, i) => {
      let text = t
        .replace(/→/g, "")
        .replace(/winelio\.app/gi, "winelio point app")
        .replace(/\s{2,}/g, " ")  // supprimer les doubles espaces
        .trim();
      // Normaliser les majuscules avant le TTS
      text = normalizeForTTS(text);
      if (text && !/[.!?,;:]$/.test(text)) {
        text += i < slide.texts.length - 1 ? "," : ".";
      }
      return text;
    })
    .filter(Boolean)
    .join(" ");
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const voiceIdx = args.indexOf("--voice");
  const voiceId = voiceIdx >= 0 ? args[voiceIdx + 1] : DEFAULT_VOICE_ID;
  const refAudioIdx = args.indexOf("--ref-audio");
  const refAudioPath = refAudioIdx >= 0 ? args[refAudioIdx + 1] : null;

  if (!MISTRAL_API_KEY) {
    console.error("❌ MISTRAL_API_KEY manquant. Définissez la variable d'environnement.");
    process.exit(1);
  }

  // Charger le ref_audio en base64 si fourni
  let refAudioBase64 = null;
  if (refAudioPath) {
    if (!fs.existsSync(refAudioPath)) {
      console.error(`❌ Fichier ref_audio introuvable: ${refAudioPath}`);
      process.exit(1);
    }
    refAudioBase64 = fs.readFileSync(refAudioPath).toString("base64");
    log(`Ref audio: ${refAudioPath} (${(fs.statSync(refAudioPath).size / 1024).toFixed(1)} KB)`);
  }

  // Env var alternative pour ref_audio (passé par le serveur éditeur)
  if (!refAudioBase64 && process.env.REF_AUDIO_B64) {
    refAudioBase64 = process.env.REF_AUDIO_B64;
    log(`Ref audio: chargé depuis REF_AUDIO_B64`);
  }

  log(`Modèle  : ${MODEL}`);
  log(`Voix    : ${refAudioBase64 ? "voice cloning (ref_audio)" : `voice_id=${voiceId}`}`);
  log(`Dry run : ${dryRun}`);
  log("");

  fs.mkdirSync(AUDIO_DIR, { recursive: true });

  const slides = JSON.parse(fs.readFileSync(SLIDES_JSON, "utf-8"));
  const results = [];

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    const text  = buildSlideText(slide);
    const outFile = path.join(AUDIO_DIR, `slide${i + 1}.mp3`);

    log(`Slide ${i + 1} "${slide.label}" → "${text.slice(0, 70)}"`);

    if (dryRun) {
      log(`  [dry-run] ignoré`);
      results.push({ slide, file: outFile, duration: null, frames: slide.frames });
      continue;
    }

    try {
      const size = await callVoxtralTTS(text, voiceId, refAudioBase64, outFile);
      const duration = getAudioDurationSeconds(outFile);
      const frames = duration ? Math.ceil(duration * FPS) + 60 : slide.frames; // +2s pour ne jamais couper

      log(`  ✅ ${(size / 1024).toFixed(1)} KB — ${duration?.toFixed(2)}s → ${frames} frames`);
      results.push({ slide, file: outFile, duration, frames });

      if (i < slides.length - 1) {
        await new Promise(r => setTimeout(r, 800));
      }
    } catch (err) {
      log(`  ❌ ${err.message}`);
      results.push({ slide, file: outFile, duration: null, frames: slide.frames });
    }
  }

  if (!dryRun) {
    const updatedSlides = slides.map((sl, i) => ({
      ...sl,
      frames: results[i].frames,
    }));

    fs.writeFileSync(SLIDES_JSON, JSON.stringify(updatedSlides, null, 2), "utf-8");
    fs.writeFileSync(CONFIG_TS, generateConfigTs(updatedSlides), "utf-8");

    log("");
    log("✅ slides.json + config.ts mis à jour.");
    log(`📁 Audio : ${AUDIO_DIR}`);
    log("");
    results.forEach((r, i) => {
      const dur = r.duration ? `${r.duration.toFixed(2)}s` : "inchangé";
      log(`  Slide ${i + 1} "${r.slide.label}": ${dur} → ${r.frames} frames`);
    });

    // Écrire le résultat JSON pour le serveur éditeur
    const summary = {
      ok: true,
      slides: results.map((r, i) => ({
        index: i + 1,
        label: r.slide.label,
        duration: r.duration,
        frames: r.frames,
        file: `slide${i + 1}.mp3`,
      })),
    };
    process.stdout.write("\n__RESULT__" + JSON.stringify(summary) + "__END__\n");
  }
}

main().catch(err => {
  console.error("❌ Erreur fatale:", err.message);
  process.exit(1);
});
