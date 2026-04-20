"use client";

import { useState } from "react";
import { resolveProfileAvatarUrl } from "@/lib/profile-avatar";

type ProfileAvatarProps = {
  name: string;
  avatar?: string | null;
  className?: string;
  imageClassName?: string;
  initialsClassName?: string;
  fallbackClassName?: string;
};

export function ProfileAvatar({
  name,
  avatar,
  className = "h-10 w-10",
  imageClassName = "h-full w-full object-cover",
  initialsClassName = "text-white font-bold",
  fallbackClassName = "bg-gradient-to-br from-winelio-orange to-winelio-amber",
}: ProfileAvatarProps) {
  const [failed, setFailed] = useState(false);
  const url = resolveProfileAvatarUrl(avatar);
  const initials =
    name
      .split(" ")
      .filter(Boolean)
      .map((part) => part[0]?.toUpperCase())
      .join("")
      .slice(0, 2) || "?";

  return (
    <div
      className={`relative overflow-hidden rounded-full flex items-center justify-center shrink-0 shadow-sm ${fallbackClassName} ${className}`}
    >
      {url && !failed ? (
        <img
          src={url}
          alt={name}
          className={imageClassName}
          onError={() => setFailed(true)}
        />
      ) : (
        <span className={`text-xs ${initialsClassName}`}>{initials}</span>
      )}
    </div>
  );
}
