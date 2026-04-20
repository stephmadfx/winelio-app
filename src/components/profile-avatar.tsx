"use client";

import { useState } from "react";
import { getProfileInitials, resolveProfileAvatarUrl } from "@/lib/profile-avatar";

type ProfileAvatarProps = {
  name: string;
  avatar?: string | null;
  className?: string;
  initialsClassName?: string;
};

export function ProfileAvatar({
  name,
  avatar,
  className = "h-10 w-10",
  initialsClassName = "text-white font-bold",
}: ProfileAvatarProps) {
  const [failed, setFailed] = useState(false);
  const avatarUrl = resolveProfileAvatarUrl(avatar);
  const initials = getProfileInitials(name);

  return (
    <div
      className={[
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-winelio-orange to-winelio-amber text-white shadow-sm",
        className,
      ].join(" ")}
    >
      {avatarUrl && !failed ? (
        <img
          src={avatarUrl}
          alt={name}
          className="h-full w-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className={["select-none text-xs", initialsClassName].join(" ")}>
          {initials}
        </span>
      )}
    </div>
  );
}
