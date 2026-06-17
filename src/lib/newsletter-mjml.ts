import mjml2html from "mjml";
import { DEFAULT_NEWSLETTER_MJML } from "@/lib/newsletter-defaults";
import { he } from "@/lib/html-escape";

const stripScripts = (value: unknown) =>
  String(value ?? "")
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(href|src)\s*=\s*("|')\s*javascript:[\s\S]*?\2/gi, "");

export const sanitizeMjml = (mjml: string) => stripScripts(mjml.trim());

const looksLikeHtmlEmail = (value: string) =>
  /<!doctype html|<html[\s>]|<body[\s>]/i.test(value);

export const compileNewsletterMjml = async (mjml: string) => {
  const cleanMjml = sanitizeMjml(mjml || DEFAULT_NEWSLETTER_MJML);
  if (looksLikeHtmlEmail(cleanMjml)) {
    return {
      mjml: DEFAULT_NEWSLETTER_MJML,
      html: stripScripts(cleanMjml),
      errors: [],
    };
  }

  const result = mjml2html(cleanMjml, {
    validationLevel: "soft",
    minify: false,
  });
  const output = await result;
  const errors = Array.isArray(output.errors) ? output.errors : [];

  if (!output.html) {
    const details = errors
      .map((err) => err.formattedMessage || err.message)
      .filter(Boolean)
      .join(" ");
    throw new Error(details || "Compilation MJML impossible");
  }

  return {
    mjml: cleanMjml,
    html: stripScripts(output.html),
    errors,
  };
};

export const withNewsletterPreheader = (html: string, preheader: string) => {
  const hidden = `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${he(preheader)}</div>`;
  return html.replace(/<body([^>]*)>/i, `<body$1>${hidden}`);
};
