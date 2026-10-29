type SharePayload = { title?: string; text?: string; url?: string };

// Android Share uses message, not url. Keep invitation links and sponsor codes
// together in one message, without adding an already included URL twice.
export const nativeShareContent = ({ title, text, url }: SharePayload) => ({
  title,
  message: [text, url && !text?.includes(url) ? url : undefined].filter(Boolean).join("\n"),
});

export const nativeShareResultScript = (id: string, status: "shared" | "dismissed" | "error") =>
  `window.__WINELIO_NATIVE_SHARE_RESULT__ && window.__WINELIO_NATIVE_SHARE_RESULT__(${JSON.stringify(id)}, ${JSON.stringify(status)}); true;`;
