"use client";

import { createContext, useContext } from "react";

const BugDeleteAccessContext = createContext(false);

export function BugDeleteAccessProvider({
  canDelete,
  children,
}: {
  canDelete: boolean;
  children: React.ReactNode;
}) {
  return (
    <BugDeleteAccessContext.Provider value={canDelete}>
      {children}
    </BugDeleteAccessContext.Provider>
  );
}

export function useBugDeleteAccess() {
  return useContext(BugDeleteAccessContext);
}
