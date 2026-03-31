"use client";

import dynamic from "next/dynamic";

const NetworkTree = dynamic(
  () =>
    import("@/components/admin/NetworkTree").then((m) => m.NetworkTree),
  {
    ssr: false,
    loading: () => (
      <div
        className="bg-gray-900 rounded-xl border border-white/5 flex items-center justify-center"
        style={{ height: "70vh" }}
      >
        <p className="text-gray-500 text-sm">Chargement de l&apos;arbre...</p>
      </div>
    ),
  }
);

interface ProfileNode {
  id: string;
  first_name: string | null;
  last_name: string | null;
  sponsor_id: string | null;
  is_professional: boolean;
  is_active: boolean;
}

export function NetworkTreeWrapper({
  nodes,
  rootIds,
}: {
  nodes: ProfileNode[];
  rootIds: string[];
}) {
  return <NetworkTree nodes={nodes} rootIds={rootIds} />;
}
