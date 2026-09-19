"use client";

import { useEffect } from "react";
import { useAppStore } from "../lib/store";

// Runs once at app start: restores `user` from a stored token (via GET
// /auth/me) so a page reload doesn't drop back to a logged-out-looking navbar
// while API calls underneath are still authenticated. Renders nothing.
export function AuthHydrator() {
  const hydrate = useAppStore((state) => state.hydrate);

  useEffect(() => {
    hydrate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
