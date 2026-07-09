"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";

export function ProfileGraceTimer({
  emailConfirmedAtStr,
  isProfileComplete,
}: {
  emailConfirmedAtStr: string | null;
  isProfileComplete: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (isProfileComplete || !emailConfirmedAtStr || pathname.startsWith("/profile")) {
      return;
    }

    const confirmedTime = new Date(emailConfirmedAtStr).getTime();
    const calculateRemaining = () => {
      const elapsed = Date.now() - confirmedTime;
      return Math.max(0, 60000 - elapsed);
    };

    const remaining = calculateRemaining();
    if (remaining <= 0) {
      router.replace("/profile");
      return;
    }

    const timer = setTimeout(() => {
      router.replace("/profile");
    }, remaining);

    return () => clearTimeout(timer);
  }, [emailConfirmedAtStr, isProfileComplete, pathname, router]);

  return null;
}
