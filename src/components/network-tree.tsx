"use client";

import { useState, useCallback, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { ProfileAvatar } from "@/components/profile-avatar";

interface TreeNode {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar: string | null;
  city: string | null;
  is_professional: boolean;
  is_demo: boolean;
  company_alias: string | null;
  company_category: string | null;
  referral_count: number;
  total_earned: number;
  children: TreeNode[];
  loaded: boolean;
  expanded: boolean;
}

const LEVEL_COLORS: Array<{ border: string; badge: string; bg: string; text: string }> = [
  { border: "border-l-gray-300", badge: "bg-gray-400", bg: "bg-gray-50", text: "text-gray-500" }, // 0 unused
  { border: "border-l-winelio-orange", badge: "bg-winelio-orange", bg: "bg-winelio-orange/5", text: "text-winelio-orange" },
  { border: "border-l-winelio-amber", badge: "bg-winelio-amber", bg: "bg-winelio-amber/5", text: "text-winelio-amber" },
  { border: "border-l-yellow-400", badge: "bg-yellow-400", bg: "bg-yellow-50", text: "text-yellow-600" },
  { border: "border-l-emerald-400", badge: "bg-emerald-400", bg: "bg-emerald-50", text: "text-emerald-600" },
  { border: "border-l-blue-400", badge: "bg-blue-400", bg: "bg-blue-50", text: "text-blue-600" },
];

function getColors(level: number) {
  return LEVEL_COLORS[level] ?? { border: "border-l-gray-300", badge: "bg-gray-400", bg: "bg-gray-50", text: "text-gray-500" };
}

export function NetworkTree({ userId, maxLevel = 5 }: { userId: string; maxLevel?: number }) {
  const [roots, setRoots] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);

  const supabase = createClient();

  const fetchChildren = useCallback(
    async (parentId: string): Promise<TreeNode[]> => {
      const { data: children } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, avatar, city, is_professional, is_demo, companies!owner_id(alias, category:categories(name))")
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
            .eq("user_id", child.id);

          const totalEarned = (commissions ?? []).reduce(
            (sum, c) => sum + (c.amount ?? 0),
            0
          );

          const rawCompany = Array.isArray(child.companies) ? child.companies[0] ?? null : (child.companies ?? null);
          const rawCat = rawCompany ? (rawCompany as Record<string, unknown>).category : null;
          const catName = Array.isArray(rawCat) ? (rawCat[0] as { name: string } | undefined)?.name ?? null : (rawCat as { name: string } | null)?.name ?? null;

          return {
            id: child.id,
            first_name: child.first_name,
            last_name: child.last_name,
            avatar: (child as { avatar?: string | null }).avatar ?? null,
            city: child.city,
            is_professional: (child as { is_professional?: boolean }).is_professional ?? false,
            is_demo: (child as { is_demo?: boolean }).is_demo ?? false,
            company_alias: rawCompany ? (rawCompany as { alias?: string | null }).alias ?? null : null,
            company_category: catName,
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

  // Auto-load on mount
  useEffect(() => {
    async function init() {
      setLoading(true);
      const nodes = await fetchChildren(userId);
      setRoots(nodes);
      // Count total network
      const total = nodes.reduce((sum, n) => sum + 1 + n.referral_count, 0);
      setTotalCount(total);
      setLoading(false);
    }
    init();
  }, [userId, fetchChildren]);

  const toggleNode = useCallback(
    async (path: number[]) => {
      setRoots((prev) => {
        const next = structuredClone(prev);
        let current = next;
        let node: TreeNode | undefined;

        for (let i = 0; i < path.length; i++) {
          const idx = path[i];
          node = current[idx];
          if (i < path.length - 1) {
            current = node.children;
          }
        }

        if (!node) return prev;

        if (!node.loaded) {
          node.expanded = true;
          fetchChildren(node.id).then((children) => {
            setRoots((prevState) => {
              const updated = structuredClone(prevState);
              let cur = updated;
              let n: TreeNode | undefined;
              for (let i = 0; i < path.length; i++) {
                const idx = path[i];
                n = cur[idx];
                if (i < path.length - 1) {
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

  if (loading) {
    return (
      <div className="py-8 flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-3 border-winelio-orange border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-winelio-gray">Chargement du reseau...</p>
      </div>
    );
  }

  if (roots.length === 0) {
    return (
      <p className="text-center text-winelio-gray py-8">
        Aucun membre dans votre reseau.
      </p>
    );
  }

  return (
    <div>
      {/* Network summary bar */}
      <div className="flex items-center gap-4 mb-4 p-3 rounded-xl bg-gradient-to-r from-winelio-orange/10 to-winelio-amber/10">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-winelio-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className="text-sm font-semibold text-winelio-dark">{roots.length} filleuls directs</span>
        </div>
        <div className="h-4 w-px bg-winelio-orange/20" />
        <div className="flex gap-3">
          {[1, 2, 3, 4, 5].map((l) => (
            <span key={l} className={`inline-flex items-center gap-1 text-[10px] font-bold ${getColors(l).text}`}>
              <span className={`w-2 h-2 rounded-full ${getColors(l).badge}`} />
              N{l}
            </span>
          ))}
        </div>
      </div>

      {/* Tree */}
      <div className="space-y-1">
        {roots.map((node, i) => (
          <TreeNodeRow
            key={node.id}
            node={node}
            level={1}
            path={[i]}
            onToggle={toggleNode}
            isLast={i === roots.length - 1}
            maxLevel={maxLevel}
          />
        ))}
      </div>
    </div>
  );
}

function TreeNodeRow({
  node,
  level,
  path,
  onToggle,
  isLast,
  maxLevel = 5,
}: {
  node: TreeNode;
  level: number;
  path: number[];
  onToggle: (path: number[]) => void;
  isLast: boolean;
  maxLevel?: number;
}) {
  const isPro = node.is_professional && node.company_alias;

  const displayName = isPro
    ? node.company_alias!
    : level === 1
    ? ([node.first_name, node.last_name].filter(Boolean).join(" ") || "Sans nom")
    : ([node.first_name, node.last_name]
        .filter(Boolean)
        .map((n) => `${n![0].toUpperCase()}.`)
        .join(" ") || "?");
  const canExpand = level < maxLevel && node.referral_count > 0;
  const colors = getColors(level);

  return (
    <div className="relative" style={{ paddingLeft: level > 1 ? "20px" : "0" }}>
      {/* Vertical connector line */}
      {level > 1 && (
        <>
          <div
            className="absolute left-[9px] top-0 w-px bg-gray-200"
            style={{ height: isLast ? "20px" : "100%" }}
          />
          <div className="absolute left-[9px] top-[20px] w-[11px] h-px bg-gray-200" />
        </>
      )}

      {/* Node */}
      <div
        className={`relative flex items-center justify-between p-2.5 sm:p-3 rounded-xl border-l-4 ${colors.border} ${colors.bg} hover:brightness-95 transition-all mb-1`}
      >
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {/* Expand/collapse */}
          {canExpand ? (
            <button
              onClick={() => onToggle(path)}
              className={`w-7 h-7 rounded-lg flex items-center justify-center ${colors.badge} text-white shrink-0 transition-transform active:scale-95`}
            >
              <svg
                className={`w-3.5 h-3.5 transition-transform duration-200 ${node.expanded ? "rotate-90" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ) : (
            <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-gray-200/50 shrink-0">
              <div className="w-2 h-2 rounded-full bg-gray-300" />
            </div>
          )}

          {/* Avatar */}
          <ProfileAvatar
            name={displayName}
            avatar={node.avatar}
            className="h-9 w-9"
            initialsClassName="text-[11px]"
          />

          {/* Name + level badge */}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={`font-semibold text-sm truncate ${isPro ? "font-mono text-winelio-orange" : "text-winelio-dark"}`}>
                {displayName}
              </span>
              <span className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[9px] font-bold text-white ${colors.badge} shrink-0`}>
                N{level}
              </span>
              {node.is_demo && (
                <span className="inline-flex items-center justify-center px-1 py-0.5 rounded text-[8px] font-bold text-orange-400 bg-orange-50 border border-orange-200 shrink-0">
                  demo
                </span>
              )}
            </div>
            <p className="text-[11px] text-winelio-gray mt-0.5 truncate">
              {[
                isPro ? node.company_category : null,
                node.city,
                node.referral_count > 0
                  ? `${node.referral_count} membre${node.referral_count > 1 ? "s" : ""}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </div>

        {/* Stats */}
        {node.total_earned > 0 && (
          <span className={`text-xs font-bold ${colors.text} shrink-0 ml-2`}>
            {node.total_earned.toFixed(0)} EUR
          </span>
        )}
      </div>

      {/* Children */}
      {node.expanded && node.children.length > 0 && (
        <div className="relative">
          {node.children.map((child, i) => (
            <TreeNodeRow
              key={child.id}
              node={child}
              level={level + 1}
              path={[...path, i]}
              onToggle={onToggle}
              isLast={i === node.children.length - 1}
              maxLevel={maxLevel}
            />
          ))}
        </div>
      )}

      {/* Loading */}
      {node.expanded && !node.loaded && (
        <div className="ml-8 py-2 flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-winelio-orange border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-winelio-gray">Chargement...</span>
        </div>
      )}
    </div>
  );
}
