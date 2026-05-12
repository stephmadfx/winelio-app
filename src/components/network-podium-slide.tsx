"use client";

import { ProfileAvatar } from "@/components/profile-avatar";
import { formatPodiumName, fmtEur, type PodiumEntry, type MyPosition, type LeaderboardCategory } from "@/lib/leaderboard";

interface Props {
  category: LeaderboardCategory;
  title: string;        // ex: "Top Parrains · Mai 2026"
  emoji: string;        // 🏆 / 💰 / 📋
  unitSuffix: string;   // " pts" / "" (€ géré ailleurs) / " recos"
  topEntries: PodiumEntry[];
  myPosition: MyPosition;
  currentUserId: string;
}

const RANK_GRADIENTS: Record<1 | 2 | 3, string> = {
  1: "from-yellow-400 to-yellow-500",
  2: "from-gray-300 to-gray-400",
  3: "from-amber-600 to-amber-700",
};

const RANK_EMOJIS: Record<1 | 2 | 3, string> = {
  1: "🥇",
  2: "🥈",
  3: "🥉",
};

function formatValue(value: number, category: LeaderboardCategory, suffix: string): string {
  if (category === "revenue") return fmtEur(value);
  return `${value}${suffix}`;
}

export function NetworkPodiumSlide({
  category,
  title,
  emoji,
  unitSuffix,
  topEntries,
  myPosition,
  currentUserId,
}: Props) {
  const top1 = topEntries[0] ?? null;
  const top2 = topEntries[1] ?? null;
  const top3 = topEntries[2] ?? null;
  const userIsInTop3 = top1?.user_id === currentUserId
    || top2?.user_id === currentUserId
    || top3?.user_id === currentUserId;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-center gap-2 mb-4">
        <span className="text-xl" aria-hidden="true">{emoji}</span>
        <h3 className="font-semibold text-winelio-dark text-sm uppercase tracking-wide">{title}</h3>
      </div>

      {topEntries.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-center text-sm text-winelio-gray">
            Personne ce mois-ci.<br/>
            <span className="text-winelio-orange font-semibold">Sois le premier !</span>
          </p>
        </div>
      ) : (
        <div className="flex-1 flex items-end justify-center gap-4 sm:gap-8 px-2">
          {/* Place 2 (gauche) */}
          {top2 && (
            <PodiumStep
              rank={2}
              entry={top2}
              category={category}
              suffix={unitSuffix}
              isCurrentUser={top2.user_id === currentUserId}
              heightClass="h-16"
            />
          )}
          {/* Place 1 (centre, plus haute) */}
          {top1 && (
            <PodiumStep
              rank={1}
              entry={top1}
              category={category}
              suffix={unitSuffix}
              isCurrentUser={top1.user_id === currentUserId}
              heightClass="h-24"
            />
          )}
          {/* Place 3 (droite) */}
          {top3 && (
            <PodiumStep
              rank={3}
              entry={top3}
              category={category}
              suffix={unitSuffix}
              isCurrentUser={top3.user_id === currentUserId}
              heightClass="h-12"
            />
          )}
        </div>
      )}

      {/* Ma position */}
      <div className="mt-4 pt-3 border-t border-gray-100 text-center">
        {myPosition.rank === 0 ? (
          <p className="text-xs text-winelio-gray">
            Toi : <span className="font-semibold">non classé</span>
          </p>
        ) : userIsInTop3 ? (
          <p className="text-xs text-winelio-gray">
            🎉 Tu es <span className="font-bold text-winelio-orange">#{myPosition.rank}</span> sur {myPosition.totalUsers}
          </p>
        ) : (
          <p className="text-xs text-winelio-gray">
            Toi : <span className="font-bold text-winelio-orange">#{myPosition.rank}</span>
            {" · "}
            <span className="font-semibold text-winelio-dark">{formatValue(myPosition.value, category, unitSuffix)}</span>
            {" · "}sur {myPosition.totalUsers}
          </p>
        )}
      </div>
    </div>
  );
}

function PodiumStep({
  rank,
  entry,
  category,
  suffix,
  isCurrentUser,
  heightClass,
}: {
  rank: 1 | 2 | 3;
  entry: PodiumEntry;
  category: LeaderboardCategory;
  suffix: string;
  isCurrentUser: boolean;
  heightClass: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5 min-w-0 max-w-[120px] flex-1">
      <div className="relative">
        <ProfileAvatar
          name={`${entry.first_name ?? ""} ${entry.last_name ?? ""}`}
          avatar={entry.avatar}
          className={`${rank === 1 ? "h-14 w-14" : "h-11 w-11"} ${isCurrentUser ? "ring-2 ring-winelio-orange ring-offset-2" : ""}`}
        />
        <span className="absolute -top-1 -right-1 text-base" aria-label={`${rank}e place`}>
          {RANK_EMOJIS[rank]}
        </span>
      </div>
      <p className="text-xs font-semibold text-winelio-dark text-center truncate max-w-full">
        {formatPodiumName(entry.first_name, entry.last_name)}
      </p>
      <p className="text-xs font-bold text-winelio-orange tabular-nums">
        {formatValue(entry.value, category, suffix)}
      </p>
      <div className={`w-full ${heightClass} rounded-t-lg bg-gradient-to-b ${RANK_GRADIENTS[rank]} flex items-start justify-center pt-1`}>
        <span className="text-white text-xs font-bold">#{rank}</span>
      </div>
    </div>
  );
}
