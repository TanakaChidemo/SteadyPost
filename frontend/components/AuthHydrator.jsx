"use client";

import { useEffect } from "react";
import { useAppStore } from "../lib/store";

// Runs once at app start: restores `user` from a stored token (via GET
// /auth/me) so a page reload doesn't drop back to a logged-out-looking navbar
// while API calls underneath are still authenticated. Also listens for
// apiClient's "steadypost:session-expired" event — dispatched when the
// refresh token itself is missing/invalid, so no more 401s can be silently
// swallowed — and prompts the user to sign back in. Renders nothing.
export function AuthHydrator() {
  const hydrate = useAppStore((state) => state.hydrate);
  const expireSession = useAppStore((state) => state.expireSession);

  useEffect(() => {
    hydrate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function handleSessionExpired() {
      expireSession();
    }
    window.addEventListener("steadypost:session-expired", handleSessionExpired);
    return () => window.removeEventListener("steadypost:session-expired", handleSessionExpired);
  }, [expireSession]);

  return null;
}
