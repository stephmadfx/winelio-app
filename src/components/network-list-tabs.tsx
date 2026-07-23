"use client";

import { useState } from "react";
import { DirectReferralsList, type DirectReferralListItem } from "@/components/direct-referrals-list";
import { NetworkTree } from "@/components/network-tree";

type NetworkTab = "details" | "direct";

export const NetworkListTabs = ({
  userId,
  totalMembers,
  directReferrals,
}: {
  userId: string;
  totalMembers: number;
  directReferrals: DirectReferralListItem[];
}) => {
  const [activeTab, setActiveTab] = useState<NetworkTab>("details");
  const tabs: Array<{ id: NetworkTab; label: string; count: number }> = [
    { id: "details", label: "Liste détaillée", count: totalMembers },
    { id: "direct", label: "Filleuls directs", count: directReferrals.length },
  ];

  return (
    <div>
      <div role="tablist" aria-label="Vues du réseau" className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
        {tabs.map((tab) => {
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`network-tab-${tab.id}`}
              aria-controls={`network-panel-${tab.id}`}
              aria-selected={selected}
              onClick={() => setActiveTab(tab.id)}
              className={`flex min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 py-2.5 text-xs font-semibold transition sm:text-sm ${selected ? "bg-white text-winelio-dark shadow-sm dark:bg-background" : "text-winelio-gray hover:text-winelio-dark"}`}
            >
              <span className="truncate">{tab.label}</span>
              <span className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold ${selected ? "bg-winelio-orange text-white" : "bg-gray-200 text-winelio-gray dark:bg-muted"}`}>{tab.count}</span>
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={`network-panel-${activeTab}`} aria-labelledby={`network-tab-${activeTab}`}>
        {activeTab === "details" ? (
          <NetworkTree userId={userId} totalMembers={totalMembers} />
        ) : (
          <DirectReferralsList referrals={directReferrals} />
        )}
      </div>
    </div>
  );
};
