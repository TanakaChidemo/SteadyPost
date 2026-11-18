// Where to go after Google sign-in. Google sign-in leaves the app, so the page
// it started from (e.g. an invite link) is kept for the callback to return to.
const KEY = "signInReturnTo";
const DEFAULT = "/dashboard";

/** A same-site path to go back to, or null. Never another site, nor the callback itself. */
export function safeReturnPath(path) {
  if (typeof path !== "string" || !path.startsWith("/")) return null;
  if (path.startsWith("//") || path.startsWith("/\\")) return null;
  if (path === "/" || path.startsWith("/auth/callback")) return null;
  return path;
}

function storage() {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** Remembers the current page before leaving for Google. */
export function rememberSignInReturn() {
  const path = safeReturnPath(`${window.location.pathname}${window.location.search}`);
  try {
    if (path) storage()?.setItem(KEY, path);
    else storage()?.removeItem(KEY);
  } catch {
    // Storage blocked: sign-in still works, it just lands on the dashboard.
  }
}

/** The page to go to after sign-in, forgetting it so it's used once. */
export function takeSignInReturn() {
  let path = null;
  try {
    path = storage()?.getItem(KEY) ?? null;
    storage()?.removeItem(KEY);
  } catch {
    path = null;
  }
  return safeReturnPath(path) || DEFAULT;
}
