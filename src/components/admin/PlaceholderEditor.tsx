"use client";

import { useState, useTransition } from "react";
import type { ReactNode } from "react";

type PlaceholderMap = Record<string, { value: string; filledBy: string }>;

export function PlaceholderEditor({
  placeholderKey,
  currentEntry,
  onSave,
}: {
  placeholderKey: string;
  currentEntry?: { value: string; filledBy: string };
  onSave: (key: string, value: string) => Promise<void>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(currentEntry?.value ?? "");
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    if (!inputValue.trim()) return;
    startTransition(async () => {
      await onSave(placeholderKey, inputValue.trim());
      setIsEditing(false);
    });
  }

  if (currentEntry && !isEditing) {
    return (
      <button
        onClick={() => {
          setInputValue(currentEntry.value);
          setIsEditing(true);
        }}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-400 hover:opacity-80 transition-opacity"
        title={`Rempli par ${currentEntry.filledBy} — cliquer pour modifier`}
      >
        {currentEntry.value}
        <svg className="w-3 h-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      </button>
    );
  }

  if (isEditing) {
    return (
      <span className="inline-flex items-center gap-1">
        <input
          autoFocus
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") setIsEditing(false);
          }}
          className="text-xs border border-winelio-orange/50 rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-winelio-orange/50 bg-background"
          placeholder={placeholderKey}
        />
        <button
          onClick={handleSave}
          disabled={isPending || !inputValue.trim()}
          className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-winelio-orange text-white disabled:opacity-50"
        >
          {isPending ? "..." : "OK"}
        </button>
        <button
          onClick={() => setIsEditing(false)}
          className="text-[10px] text-muted-foreground hover:text-foreground"
        >
          ✕
        </button>
      </span>
    );
  }

  return (
    <button
      onClick={() => setIsEditing(true)}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-semibold bg-orange-100 text-winelio-orange dark:bg-orange-950/30 border border-winelio-orange/30 hover:bg-orange-200 dark:hover:bg-orange-950/50 transition-colors"
      title="Cliquer pour remplir"
    >
      [{placeholderKey}]
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
      </svg>
    </button>
  );
}

function renderMarkdownInline(text: string): ReactNode {
  const boldParts = text.split(/(\*\*[^*]+\*\*)/g);
  if (boldParts.length === 1) return text;
  return boldParts.map((part, i) => {
    const boldMatch = part.match(/^\*\*([^*]+)\*\*$/);
    if (boldMatch) return <strong key={i} className="font-semibold">{boldMatch[1]}</strong>;
    return part;
  });
}

export function renderContentWithPlaceholders(
  content: string,
  placeholderMap: PlaceholderMap,
  onSave: (key: string, value: string) => Promise<void>
): ReactNode {
  const lines = content.split("\n");

  return lines.map((line, lineIndex) => {
    const parts = line.split(/(\[[^a-z\]]+\])/g);
    const rendered = parts.map((part, partIndex) => {
      const match = part.match(/^\[([^a-z\]]+)\]$/);
      if (match) {
        const key = match[1];
        return (
          <PlaceholderEditor
            key={`${lineIndex}-${partIndex}-${key}`}
            placeholderKey={key}
            currentEntry={placeholderMap[key]}
            onSave={onSave}
          />
        );
      }
      return <span key={`${lineIndex}-${partIndex}`}>{renderMarkdownInline(part)}</span>;
    });

    const trimmed = line.trim();
    if (trimmed.startsWith("**") && trimmed.endsWith("**") && !trimmed.slice(2, -2).includes("**")) {
      return <p key={lineIndex} className="font-semibold text-sm mt-3 mb-1">{rendered}</p>;
    }
    if (trimmed.match(/^\d+\. /)) {
      return <p key={lineIndex} className="ml-4 text-sm">{rendered}</p>;
    }
    if (trimmed.startsWith("- ")) {
      return (
        <p key={lineIndex} className="ml-4 text-sm">
          <span className="text-winelio-orange mr-2">•</span>{rendered}
        </p>
      );
    }
    if (trimmed === "") {
      return <br key={lineIndex} />;
    }
    if (trimmed.startsWith("*") && trimmed.endsWith("*") && !trimmed.startsWith("**")) {
      return <p key={lineIndex} className="text-sm italic text-muted-foreground mt-2">{rendered}</p>;
    }
    return <p key={lineIndex} className="text-sm">{rendered}</p>;
  });
}
