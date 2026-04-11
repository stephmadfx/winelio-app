/** Décode le quoted-printable en respectant l'encodage UTF-8 multi-octets. */
export const decodeQP = (s: string): string => {
  s = s.replace(/=\r?\n/g, "");
  const parts: string[] = [];
  const bytes: number[] = [];
  let i = 0;
  while (i < s.length) {
    if (s[i] === "=" && i + 2 < s.length && /^[0-9A-F]{2}$/i.test(s.slice(i + 1, i + 3))) {
      bytes.push(parseInt(s.slice(i + 1, i + 3), 16));
      i += 3;
    } else {
      if (bytes.length) {
        parts.push(new TextDecoder("utf-8").decode(new Uint8Array(bytes)));
        bytes.length = 0;
      }
      parts.push(s[i]);
      i++;
    }
  }
  if (bytes.length) parts.push(new TextDecoder("utf-8").decode(new Uint8Array(bytes)));
  return parts.join("");
};

const CITATION_MARKERS = [
  (s: string) => s.startsWith(">"),
  (s: string) => /^On .+wrote:/i.test(s),
  (s: string) => /^Le .+[àa].+ a [eé]crit/i.test(s),
  (s: string) => /^-{3,}/.test(s),
  (s: string) => /^Nouveau signalement de bug/i.test(s),
  (s: string) => /^Ref\. #[0-9a-f-]{8}/i.test(s),
  (s: string) => /^© \d{4} Winelio/i.test(s),
];

const filterReplyLines = (text: string): string => {
  const lines = text.split("\n");
  const result: string[] = [];
  for (const l of lines) {
    const s = l.trim();
    if (CITATION_MARKERS.some((fn) => fn(s))) break;
    if (s.startsWith("--")) continue;
    if (s) result.push(l);
  }
  return result.join("\n").trim();
};

/** Nettoie admin_reply : décode QP, saute les headers MIME, coupe aux citations. */
export const cleanReplyText = (raw: string): string => {
  let text = raw.replace(/\r\n/g, "\n");
  text = decodeQP(text);
  for (const block of text.split(/\n\n+/)) {
    const t = block.trim();
    if (/^Content-/m.test(t)) continue;
    const clean = filterReplyLines(t);
    if (clean) return clean;
  }
  return raw.trim();
};
