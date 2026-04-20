"use client";

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
  className = "",
  initialsClassName = "",
}: ProfileAvatarProps) {
  const avatarUrl = resolveProfileAvatarUrl(avatar);
  const initials = getProfileInitials(name);

  return (
    <div
      className={[
        "relative flex items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-winelio-orange to-winelio-amber text-white shadow-sm",
        className,
      ].join(" ")}
    >
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={name}
          className="h-full w-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      ) : (
        <span className={["select-none font-bold", initialsClassName].join(" ")}>
          {initials}
        </span>
      )}
    </div>
  );
}
