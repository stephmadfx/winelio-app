import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const JSON_FILE  = path.join(__dirname, "slides.json");
const CONFIG_TS  = path.join(__dirname, "../src/config.ts");
const SCRIPT     = path.join(__dirname, "../scripts/generate-audio.mjs");
const PORT       = 4001;
const MISTRAL_KEY = process.env.MISTRAL_API_KEY || "b6KKqB9SDGNXUFvdE3Ndq3p4HchQAoMI";

function readSlides() {
  return JSON.parse(fs.readFileSync(JSON_FILE, "utf-8"));
}

function generateConfigTs(slides) {
  const slidesTs = slides.map(s => {
    const textsTs = s.texts
      .map(t => `      "${t.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)
      .join(",\n");
    return `  {\n    id: "${s.id}",\n    label: "${s.label}",\n    frames: ${s.frames},\n    texts: [\n${textsTs}\n    ]\n  }`;
  }).join(",\n");

  return `// ── Source de vérité unique — éditée via http://localhost:${PORT} ───────────────
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

function saveSlides(slides) {
  fs.writeFileSync(JSON_FILE, JSON.stringify(slides, null, 2), "utf-8");
  fs.writeFileSync(CONFIG_TS, generateConfigTs(slides), "utf-8");
}

function send(res, status, body, type = "application/json") {
  res.writeHead(status, { "Content-Type": type, "Access-Control-Allow-Origin": "*" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  if (req.method === "GET" && req.url === "/") {
    const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf-8");
    send(res, 200, html, "text/html; charset=utf-8");
    return;
  }

  if (req.method === "GET" && req.url === "/config") {
    try { send(res, 200, readSlides()); }
    catch (e) { send(res, 500, { error: e.message }); }
    return;
  }

  if (req.method === "POST" && req.url === "/config") {
    let body = "";
    req.on("data", c => body += c);
    req.on("end", () => {
      try {
        saveSlides(JSON.parse(body));
        send(res, 200, { ok: true });
      } catch (e) {
        send(res, 400, { error: e.message });
      }
    });
    return;
  }

  // ── Génération audio Voxtral TTS ─────────────────────────────────────────────
  if (req.method === "POST" && req.url === "/generate-audio") {
    // Lancer le script en process séparé et streamer les logs en SSE
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Access-Control-Allow-Origin": "*",
    });

    const child = spawn("node", [SCRIPT], {
      env: { ...process.env, MISTRAL_API_KEY: MISTRAL_KEY },
    });

    child.stdout.on("data", chunk => {
      const text = chunk.toString();
      // Extraire le résultat JSON final si présent
      const match = text.match(/__RESULT__(.+?)__END__/s);
      if (match) {
        res.write(`data: ${JSON.stringify({ type: "result", data: JSON.parse(match[1]) })}\n\n`);
      }
      // Logger les autres lignes
      text.split("\n").filter(l => l.trim() && !l.includes("__RESULT__")).forEach(line => {
        res.write(`data: ${JSON.stringify({ type: "log", message: line })}\n\n`);
      });
    });

    child.stderr.on("data", chunk => {
      chunk.toString().split("\n").filter(l => l.trim()).forEach(line => {
        res.write(`data: ${JSON.stringify({ type: "error", message: line })}\n\n`);
      });
    });

    child.on("close", code => {
      res.write(`data: ${JSON.stringify({ type: "done", code })}\n\n`);
      res.end();
    });

    return;
  }

  res.writeHead(404); res.end();
});

server.listen(PORT, () => console.log(`✅  Éditeur Winelio → http://localhost:${PORT}`));
