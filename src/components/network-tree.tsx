"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

interface TreeNode {
  id: string;
  full_name: string | null;
  referral_count: number;
  total_earned: number;
  children: TreeNode[];
  loaded: boolean;
  expanded: boolean;
}

function anonymizeName(name: string | null): string {
  if (!name) return "***";
  const parts = name.trim().split(" ");
  if (parts.length === 0) return "***";
  const first = parts[0][0]?.toUpperCase() ?? "?";
  const last = parts.length > 1 ? parts[parts.length - 1][0]?.toUpperCase() ?? "" : "";
  return `${first}.${last}***`;
}

export function NetworkTree({ userId }: { userId: string }) {
  const [roots, setRoots] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const supabase = createClient();

  const fetchChildren = useCallback(
    async (parentId: string): Promise<TreeNode[]> => {
      const { data: children } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("sponsor_id", parentId);

      if (!children || children.length === 0) return [];

      const nodes: TreeNode[] = await Promise.all(
        children.map(async (child) => {
          const { count } = await supabase
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .eq("sponsor_id", child.id);

          const { data: commissions } = await supabase
            .from("commission_transactions")
            .select("amount")
            .eq("source_user_id", child.id);

          const totalEarned = (commissions ?? []).reduce(
            (sum, c) => sum + (c.amount ?? 0),
            0
          );

          return {
            id: child.id,
            full_name: child.full_name,
            referral_count: count ?? 0,
            total_earned: totalEarned,
            children: [],
            loaded: false,
            expanded: false,
          };
        })
      );

      return nodes;
    },
    [supabase]
  );

  const loadInitial = useCallback(async () => {
    setLoading(true);
    const nodes = await fetchChildren(userId);
    // Mark level 1 as loaded since we have them
    setRoots(nodes);
    setInitialized(true);
    setLoading(false);
  }, [userId, fetchChildren]);

  const toggleNode = useCallback(
    async (path: number[]) => {
      setRoots((prev) => {
        const next = structuredClone(prev);
        let current = next;
        let node: TreeNode | undefined;

        for (const idx of path) {
          node = current[idx];
          if (path.indexOf(idx) < path.length - 1) {
            current = node.children;
          }
        }

        if (!node) return prev;

        if (!node.loaded) {
          // Mark as loading, then fetch
          node.expanded = true;
          // We'll handle async loading separately
          fetchChildren(node.id).then((children) => {
            setRoots((prevState) => {
              const updated = structuredClone(prevState);
              let cur = updated;
              let n: TreeNode | undefined;
              for (const idx of path) {
                n = cur[idx];
                if (path.indexOf(idx) < path.length - 1) {
                  cur = n.children;
                }
              }
              if (n) {
                n.children = children;
                n.loaded = true;
              }
              return updated;
            });
          });
          return next;
        }

        node.expanded = !node.expanded;
        return next;
      });
    },
    [fetchChildren]
  );

  if (!initialized) {
    return (
      <div className="text-center py-8">
        <button
          onClick={loadInitial}
          disabled={loading}
          className="px-6 py-3 bg-gradient-to-r from-kiparlo-orange to-kiparlo-amber text-white font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
        >
          {loading ? "Chargement..." : "Charger l'arbre du reseau"}
        </button>
      </div>
    );
  }

  if (roots.length === 0) {
    return (
      <p className="text-center text-kiparlo-gray py-8">
        Aucun membre dans votre reseau.
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {roots.map((node, i) => (
        <TreeNodeRow
          key={node.id}
          node={node}
          level={1}
          path={[i]}
          onToggle={toggleNode}
        />
      ))}
    </div>
  );
}

function TreeNodeRow({
  node,
  level,
  path,
  onToggle,
}: {
  node: TreeNode;
  level: number;
  path: number[];
  onToggle: (path: number[]) => void;
}) {
  const maxLevel = 5;
  const displayName = level === 1 ? (node.full_name ?? "Sans nom") : anonymizeName(node.full_name);
  const canExpand = level < maxLevel && node.referral_count > 0;

  const levelColors: Record<number, string> = {
    1: "border-l-kiparlo-orange",
    2: "border-l-kiparlo-amber",
    3: "border-l-yellow-400",
    4: "border-l-emerald-400",
    5: "border-l-blue-400",
  };

  const levelBadgeColors: Record<number, string> = {
    1: "bg-kiparlo-orange",
    2: "bg-kiparlo-amber",
    3: "bg-yellow-400",
    4: "bg-emerald-400",
    5: "bg-blue-400",
  };

  return (
    <div style={{ paddingLeft: `${(level - 1) * 24}px` }}>
      <div
        className={`flex items-center justify-between p-3 rounded-lg border-l-4 ${levelColors[level] ?? "border-l-gray-300"} bg-kiparlo-light hover:bg-gray-100 transition-colors`}
      >
        <div className="flex items-center gap-3">
          {canExpand ? (
            <button
              onClick={() => onToggle(path)}
              className="w-6 h-6 rounded flex items-center justify-center text-kiparlo-gray hover:text-kiparlo-dark transition-colors cursor-pointer"
            >
              <svg
                className={`w-4 h-4 transition-transform ${node.expanded ? "rotate-90" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          ) : (
            <div className="w-6 h-6 flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-gray-300" />
            </div>
          )}

          <span
            className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold text-white ${levelBadgeColors[level] ?? "bg-gray-400"}`}
          >
            {level}
          </span>

          <div className="w-8 h-8 rounded-full bg-gradient-to-r from-kiparlo-orange to-kiparlo-amber flex items-center justify-center text-white font-bold text-xs">
            {(node.full_name ?? "?")
              .split(" ")
              .map((n) => n[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()}
          </div>

          <span className="font-medium text-kiparlo-dark text-sm">
            {displayName}
          </span>
        </div>

        <div className="flex items-center gap-4 text-xs">
          <div className="text-center">
            <span className="font-bold text-kiparlo-dark">{node.referral_count}</span>
            <span className="text-kiparlo-gray ml-1">filleuls</span>
          </div>
          <div className="text-center">
            <span className="font-bold text-kiparlo-orange">
              {node.total_earned.toFixed(2)}
            </span>
            <span className="text-kiparlo-gray ml-1">EUR</span>
          </div>
        </div>
      </div>

      {node.expanded && node.children.length > 0 && (
        <div className="mt-1 space-y-1">
          {node.children.map((child, i) => (
            <TreeNodeRow
              key={child.id}
              node={child}
              level={level + 1}
              path={[...path, i]}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}

      {node.expanded && !node.loaded && (
        <div style={{ paddingLeft: "24px" }} className="py-2">
          <div className="flex items-center gap-2 text-sm text-kiparlo-gray">
            <svg
              className="w-4 h-4 animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Chargement...
          </div>
        </div>
      )}
    </div>
  );
}
