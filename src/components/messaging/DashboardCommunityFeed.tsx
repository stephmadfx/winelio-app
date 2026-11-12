"use client";

import { useEffect, useState } from "react";
import { MessagingWorkspace } from "./MessagingWorkspace";

export function DashboardCommunityFeed({
  viewport,
}: {
  viewport: "mobile" | "desktop";
}) {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(
      viewport === "desktop" ? "(min-width: 1024px)" : "(max-width: 1023.98px)",
    );
    const update = () => setMatches(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [viewport]);

  if (!matches) return null;

  return (
    <MessagingWorkspace
      variant="dashboard"
      dashboardLimit={viewport === "desktop" ? 5 : 4}
    />
  );
}
