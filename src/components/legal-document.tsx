import Link from "next/link";
import { AppBackground } from "@/components/AppBackground";
import { WinelioLogo } from "@/components/winelio-logo";
import { legalDocuments } from "@/lib/legal-documents";

type MarkdownBlock =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] };

const parseBlocks = (markdown: string): MarkdownBlock[] => {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];
  let listItems: string[] = [];
  let tableLines: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push({ type: "paragraph", text: paragraph.join(" ") });
    paragraph = [];
  };

  const flushList = () => {
    if (listItems.length === 0) return;
    blocks.push({ type: "list", items: listItems });
    listItems = [];
  };

  const flushTable = () => {
    if (tableLines.length < 2) {
      tableLines = [];
      return;
    }

    const rows = tableLines.map((tableLine) =>
      tableLine
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((cell) => cell.trim())
    );
    const [headers, separator, ...bodyRows] = rows;
    const isSeparator = separator?.every((cell) => /^:?-{3,}:?$/.test(cell));

    if (headers && isSeparator) {
      blocks.push({ type: "table", headers, rows: bodyRows });
    }

    tableLines = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line || line === "---") {
      flushParagraph();
      flushList();
      flushTable();
      continue;
    }

    if (line.startsWith("# ")) {
      flushParagraph();
      flushList();
      flushTable();
      blocks.push({ type: "heading", level: 1, text: line.slice(2).trim() });
      continue;
    }

    if (line.startsWith("## ")) {
      flushParagraph();
      flushList();
      flushTable();
      blocks.push({ type: "heading", level: 2, text: line.slice(3).trim() });
      continue;
    }

    if (line.startsWith("### ")) {
      flushParagraph();
      flushList();
      flushTable();
      blocks.push({ type: "heading", level: 3, text: line.slice(4).trim() });
      continue;
    }

    if (line.startsWith("- ")) {
      flushParagraph();
      flushTable();
      listItems.push(line.slice(2).trim());
      continue;
    }

    if (line.startsWith("|") && line.endsWith("|")) {
      flushParagraph();
      flushList();
      tableLines.push(line);
      continue;
    }

    flushList();
    flushTable();
    paragraph.push(line);
  }

  flushParagraph();
  flushList();
  flushTable();

  return blocks;
};

const renderInline = (text: string) => {
  const parts = text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)|`[^`]+`)/g);

  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }

    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={index} className="rounded bg-winelio-light px-1.5 py-0.5 text-[0.9em] text-winelio-dark">
          {part.slice(1, -1)}
        </code>
      );
    }

    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      return (
        <a
          key={index}
          href={linkMatch[2]}
          className="font-semibold text-winelio-orange underline decoration-winelio-orange/30 underline-offset-4"
        >
          {linkMatch[1]}
        </a>
      );
    }

    return part;
  });
};

export function LegalDocument({
  markdown,
  currentSlug,
  inApp = false,
}: {
  markdown: string;
  currentSlug?: string;
  inApp?: boolean;
}) {
  const blocks = parseBlocks(markdown);
  const titleBlock = blocks.find(
    (block): block is Extract<MarkdownBlock, { type: "heading" }> =>
      block.type === "heading" && block.level === 1
  );
  const contentBlocks = titleBlock ? blocks.slice(1) : blocks;

  return (
    <div className="relative min-h-dvh overflow-hidden bg-winelio-light">
      <AppBackground />
      <main
        className={`relative z-10 mx-auto grid w-full max-w-6xl gap-6 px-4 lg:grid-cols-[240px_minmax(0,1fr)] lg:px-8 ${
          inApp ? "pb-28 pt-24 lg:py-8" : "py-8"
        }`}
      >
        <aside className="lg:sticky lg:top-8 lg:h-fit">
          <Link
            href={inApp ? "/dashboard" : "/"}
            aria-label="Winelio — Accueil"
            className={inApp ? "hidden lg:inline-flex" : "inline-flex"}
          >
            <WinelioLogo variant="color" height={36} gradientId="wGrad-legal" />
          </Link>
          <nav className={`${inApp ? "mt-0 lg:mt-6" : "mt-6"} space-y-1 rounded-2xl border border-black/5 bg-white/80 p-2 shadow-sm`}>
            <Link
              href="/documents-legaux"
              className="block rounded-xl px-3 py-2 text-sm font-semibold text-winelio-dark hover:bg-winelio-orange/5"
            >
              Tous les documents
            </Link>
            {legalDocuments.map((document) => {
              const active = document.slug === currentSlug;
              return (
                <Link
                  key={document.slug}
                  href={`/documents-legaux/${document.slug}`}
                  className={`block rounded-xl px-3 py-2 text-sm font-medium transition ${
                    active
                      ? "bg-gradient-to-r from-winelio-orange to-winelio-amber text-white"
                      : "text-winelio-gray hover:bg-winelio-orange/5 hover:text-winelio-dark"
                  }`}
                >
                  {document.title}
                </Link>
              );
            })}
          </nav>
        </aside>

        <article className="rounded-3xl border border-black/5 bg-white/90 p-6 shadow-sm sm:p-8 lg:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-winelio-orange">
            Documents légaux Winelio
          </p>
          {titleBlock && (
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-winelio-dark sm:text-4xl">
              {titleBlock.text}
            </h1>
          )}

          <div className="mt-8 space-y-5">
            {contentBlocks.map((block, index) => {
              if (block.type === "heading" && block.level === 2) {
                return (
                  <h2 key={index} className="border-t border-black/5 pt-6 text-xl font-bold text-winelio-dark">
                    {block.text}
                  </h2>
                );
              }

              if (block.type === "heading" && block.level === 3) {
                return (
                  <h3 key={index} className="text-base font-bold text-winelio-dark">
                    {block.text}
                  </h3>
                );
              }

              if (block.type === "list") {
                return (
                  <ul key={index} className="space-y-2 pl-5 text-sm leading-7 text-winelio-gray">
                    {block.items.map((item, itemIndex) => (
                      <li key={itemIndex} className="list-disc">
                        {renderInline(item)}
                      </li>
                    ))}
                  </ul>
                );
              }

              if (block.type === "table") {
                return (
                  <div key={index} className="overflow-x-auto rounded-2xl border border-black/5">
                    <table className="min-w-full divide-y divide-black/5 text-left text-sm">
                      <thead className="bg-winelio-light">
                        <tr>
                          {block.headers.map((header, headerIndex) => (
                            <th
                              key={headerIndex}
                              scope="col"
                              className="px-4 py-3 font-bold text-winelio-dark"
                            >
                              {renderInline(header)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black/5 bg-white">
                        {block.rows.map((row, rowIndex) => (
                          <tr key={rowIndex}>
                            {row.map((cell, cellIndex) => (
                              <td key={cellIndex} className="min-w-48 px-4 py-3 align-top leading-6 text-winelio-gray">
                                {renderInline(cell)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              }

              return (
                <p key={index} className="text-sm leading-7 text-winelio-gray">
                  {renderInline(block.text)}
                </p>
              );
            })}
          </div>
        </article>
      </main>
    </div>
  );
}
