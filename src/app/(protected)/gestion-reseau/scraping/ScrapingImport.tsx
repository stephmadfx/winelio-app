"use client";

import { useState } from "react";

type Row = {
  name: string;
  email?: string;
  phone?: string;
  city?: string;
  postal_code?: string;
  address?: string;
  category_name?: string;
};

type ImportResult = { created: number; skipped: number; errors: string[] };

function parseCSV(text: string): Row[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const idx = {
    name: header.indexOf("name"),
    email: header.indexOf("email"),
    phone: header.indexOf("phone"),
    city: header.indexOf("city"),
    postal_code: header.indexOf("postal_code"),
    address: header.indexOf("address"),
    category_name: header.indexOf("category_name"),
  };
  if (idx.name === -1) throw new Error("La colonne 'name' est obligatoire");

  const rows: Row[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCSVLine(lines[i]);
    const row: Row = { name: cols[idx.name]?.trim() ?? "" };
    if (idx.email !== -1) row.email = cols[idx.email]?.trim();
    if (idx.phone !== -1) row.phone = cols[idx.phone]?.trim();
    if (idx.city !== -1) row.city = cols[idx.city]?.trim();
    if (idx.postal_code !== -1) row.postal_code = cols[idx.postal_code]?.trim();
    if (idx.address !== -1) row.address = cols[idx.address]?.trim();
    if (idx.category_name !== -1) row.category_name = cols[idx.category_name]?.trim();
    rows.push(row);
  }
  return rows;
}

// Gère les virgules à l'intérieur des guillemets
function splitCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"' && line[i - 1] !== "\\") {
      inQuotes = !inQuotes;
    } else if (c === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += c;
    }
  }
  result.push(current);
  return result;
}

export function ScrapingImport() {
  const [rows, setRows] = useState<Row[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const onFile = (file: File) => {
    setResult(null);
    setParseError(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parseCSV(reader.result as string);
        setRows(parsed);
      } catch (err) {
        setParseError(err instanceof Error ? err.message : "Erreur de parsing");
        setRows([]);
      }
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (rows.length === 0) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/scraping/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const payload = await res.json();
      if (!res.ok) {
        setResult({ created: 0, skipped: 0, errors: [payload.error || "Erreur inconnue"] });
      } else {
        setResult(payload as ImportResult);
      }
    } catch (err) {
      setResult({
        created: 0,
        skipped: 0,
        errors: [err instanceof Error ? err.message : "Erreur inconnue"],
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 rounded-2xl border border-winelio-gray/10 bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-lg font-bold text-winelio-dark">Uploader un fichier</h2>
        <p className="mt-1 text-sm text-winelio-gray">
          Déposez un fichier CSV — l&apos;import se fait ligne par ligne.
        </p>
      </div>

      <label className="block">
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          className="block w-full text-sm text-winelio-gray file:mr-4 file:rounded-xl file:border-0 file:bg-winelio-orange file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-winelio-amber"
        />
      </label>

      {parseError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {parseError}
        </div>
      )}

      {rows.length > 0 && (
        <div className="rounded-2xl border border-winelio-gray/10 bg-winelio-light p-4">
          <p className="text-sm font-semibold text-winelio-dark">
            {rows.length} ligne{rows.length > 1 ? "s" : ""} prête{rows.length > 1 ? "s" : ""} à importer
          </p>
          <div className="mt-3 max-h-40 overflow-y-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-winelio-gray">
                  <th className="pb-1">Nom</th>
                  <th className="pb-1">Email</th>
                  <th className="pb-1">Ville</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 10).map((r, i) => (
                  <tr key={i} className="border-t border-winelio-gray/10 text-winelio-dark">
                    <td className="py-1 pr-2">{r.name}</td>
                    <td className="py-1 pr-2">{r.email ?? "—"}</td>
                    <td className="py-1">{r.city ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 10 && (
              <p className="mt-2 text-xs text-winelio-gray">… et {rows.length - 10} autres</p>
            )}
          </div>
          <button
            onClick={handleImport}
            disabled={loading}
            className="mt-4 w-full rounded-xl bg-gradient-to-r from-winelio-orange to-winelio-amber py-3 text-sm font-bold text-white shadow-md shadow-winelio-orange/25 transition-all hover:-translate-y-0.5 disabled:opacity-60 cursor-pointer"
          >
            {loading
              ? "Import en cours…"
              : `Importer ${rows.length} ligne${rows.length > 1 ? "s" : ""}`}
          </button>
        </div>
      )}

      {result && (
        <div className="space-y-2">
          <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
            <p className="font-bold">
              ✓ {result.created} company{result.created > 1 ? "s" : ""} créée
              {result.created > 1 ? "s" : ""}
            </p>
            {result.skipped > 0 && (
              <p className="mt-1">
                {result.skipped} ligne{result.skipped > 1 ? "s" : ""} ignorée
                {result.skipped > 1 ? "s" : ""} (doublons ou vides)
              </p>
            )}
          </div>
          {result.errors.length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-700">
              <p className="mb-2 font-bold">
                {result.errors.length} erreur{result.errors.length > 1 ? "s" : ""} :
              </p>
              <ul className="space-y-1">
                {result.errors.slice(0, 20).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
                {result.errors.length > 20 && (
                  <li>… et {result.errors.length - 20} autres</li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
