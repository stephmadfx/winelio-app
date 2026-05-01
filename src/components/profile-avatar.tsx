"use client";

import { useState, useEffect } from "react";
import { getProfileInitials, resolveProfileAvatarUrl } from "@/lib/profile-avatar";

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
  const avatarUrl = resolveProfileAvatarUrl(avatar);

  useEffect(() => { setFailed(false); }, [avatar]);
  const initials = getProfileInitials(name);

  return (
    <div
      className={[
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full text-white shadow-sm",
        fallbackClassName,
        className,
      ].join(" ")}
    >
      {avatarUrl && !failed ? (
        <img
          src={avatarUrl}
          alt={name}
          className={imageClassName}
          loading="lazy"
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
