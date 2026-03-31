"use client";

import dynamic from "next/dynamic";

const NetworkTree = dynamic(
  () =>
    import("@/components/admin/NetworkTree").then((m) => m.NetworkTree),
  { ssr: false }
);

interface ProfileNode {
  id: string;
  full_name: string | null;
  sponsor_id: string | null;
  is_professional: boolean;
  is_suspended: boolean;
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
