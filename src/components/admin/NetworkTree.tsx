"use client";

import { useCallback, useMemo, useState } from "react";
import Tree from "react-d3-tree";
import type {
  RawNodeDatum,
  CustomNodeElementProps,
  TreeNodeDatum,
} from "react-d3-tree";
import type { HierarchyPointNode } from "d3-hierarchy";
import type { SyntheticEvent } from "react";

interface ProfileNode {
  id: string;
  full_name: string | null;
  sponsor_id: string | null;
  is_professional: boolean;
  is_suspended: boolean;
}

function buildTree(nodes: ProfileNode[], rootIds: string[]): RawNodeDatum[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const childrenMap = new Map<string, string[]>();

  for (const node of nodes) {
    if (node.sponsor_id) {
      if (!childrenMap.has(node.sponsor_id))
        childrenMap.set(node.sponsor_id, []);
      childrenMap.get(node.sponsor_id)!.push(node.id);
    }
  }

  function buildSubtree(id: string): RawNodeDatum {
    const node = nodeMap.get(id)!;
    const childIds = childrenMap.get(id) ?? [];
    return {
      name: node.full_name ?? id,
      attributes: {
        id,
        is_professional: String(node.is_professional),
        is_suspended: String(node.is_suspended),
      },
      children: childIds.map(buildSubtree),
    };
  }

  return rootIds.map(buildSubtree);
}

function CustomNode({ nodeDatum, toggleNode }: CustomNodeElementProps) {
  const isPro = nodeDatum.attributes?.is_professional === "true";
  const isSuspended = nodeDatum.attributes?.is_suspended === "true";

  return (
    <g onClick={toggleNode} style={{ cursor: "pointer" }}>
      <circle
        r={20}
        fill={isSuspended ? "#ef4444" : isPro ? "#3b82f6" : "#FF6B35"}
        stroke={isSuspended ? "#dc2626" : isPro ? "#2563eb" : "#F7931E"}
        strokeWidth={2}
      />
      <text
        fill="white"
        fontSize={9}
        textAnchor="middle"
        dy={35}
        fontWeight="500"
      >
        {nodeDatum.name.length > 16
          ? nodeDatum.name.slice(0, 14) + "…"
          : nodeDatum.name}
      </text>
    </g>
  );
}

export function NetworkTree({
  nodes,
  rootIds,
}: {
  nodes: ProfileNode[];
  rootIds: string[];
}) {
  const [search, setSearch] = useState("");

  const nodeMap = useMemo(
    () => new Map(nodes.map((n) => [n.id, n])),
    [nodes]
  );

  const treeData = useMemo(
    () => buildTree(nodes, rootIds),
    [nodes, rootIds]
  );

  const handleNodeClick = useCallback(
    (node: HierarchyPointNode<TreeNodeDatum>, _event: SyntheticEvent) => {
      const userId = node.data.attributes?.id as string | undefined;
      if (userId) {
        window.open(`/gestion-reseau/utilisateurs/${userId}`, "_blank");
      }
    },
    []
  );

  const filteredRootIds = useMemo(() => {
    if (search.trim() === "") return rootIds;
    return nodes
      .filter((n) =>
        n.full_name?.toLowerCase().includes(search.toLowerCase())
      )
      .map((n) => {
        // Remonter jusqu'à la racine
        let curr = n;
        const visited = new Set<string>();
        while (curr.sponsor_id && !visited.has(curr.id)) {
          visited.add(curr.id);
          const parent = nodeMap.get(curr.sponsor_id);
          if (!parent) break;
          curr = parent;
        }
        return curr.id;
      })
      .filter((id, i, arr) => arr.indexOf(id) === i);
  }, [search, nodes, nodeMap, rootIds]);

  const displayData = useMemo(
    () => (search.trim() === "" ? treeData : buildTree(nodes, filteredRootIds)),
    [search, treeData, nodes, filteredRootIds]
  );

  if (displayData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-gray-500">
        <p>Aucun résultat pour &quot;{search}&quot;</p>
      </div>
    );
  }

  const rootDatum: RawNodeDatum =
    displayData.length === 1
      ? displayData[0]
      : { name: "Réseau", children: displayData };

  return (
    <div>
      <div className="flex gap-3 mb-4 items-center flex-wrap">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un membre..."
          className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder-gray-600 w-72"
        />
        <div className="flex gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-[#FF6B35] inline-block" />
            Particulier
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-blue-500 inline-block" />
            Professionnel
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-red-500 inline-block" />
            Suspendu
          </span>
        </div>
        <p className="ml-auto text-xs text-gray-500">
          Clic sur un nœud → ouvre la fiche utilisateur
        </p>
      </div>
      <div
        className="bg-gray-900 rounded-xl border border-white/5 overflow-hidden"
        style={{ height: "70vh" }}
      >
        <Tree
          data={rootDatum}
          orientation="vertical"
          pathFunc="step"
          onNodeClick={handleNodeClick}
          renderCustomNodeElement={(props) => <CustomNode {...props} />}
          separation={{ siblings: 1.5, nonSiblings: 2 }}
          translate={{ x: 600, y: 60 }}
          zoom={0.7}
          nodeSize={{ x: 160, y: 100 }}
          pathClassFunc={() => "stroke-gray-700 fill-none"}
        />
      </div>
    </div>
  );
}
