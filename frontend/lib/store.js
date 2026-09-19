import { create } from "zustand";
import { api, getAccessToken, getRefreshToken, setTokens, clearTokens } from "./apiClient";

export const useAppStore = create((set, get) => ({
  user: null,
  token: null,
  // True once we've checked localStorage for a token and (if present)
  // confirmed it against GET /auth/me. Components that fetch user-scoped
  // data on mount should wait for this instead of firing immediately —
  // otherwise the very first request races the token being loaded and
  // just 401s silently.
  authReady: false,
  drafts: [],
  activeDraft: null,
  socialAccounts: [],
  toasts: [],
  isAuthModalOpen: false,
  isAiModalOpen: false,
  isLoading: false,

  hydrate: async () => {
    if (typeof window === "undefined") return;
    const token = getAccessToken() || getRefreshToken();
    if (!token) {
      set({ authReady: true });
      return;
    }
    try {
      // If the access token has expired, apiClient's response interceptor
      // transparently refreshes it (via the stored refresh token) and
      // retries this call, so this only throws once both are invalid.
      const { user } = await api.auth.me();
      set({ user, token: getAccessToken(), authReady: true });
    } catch (err) {
      clearTokens();
      set({ user: null, token: null, authReady: true });
    }
  },

  setUser: (user, accessToken, refreshToken) => {
    if (accessToken !== undefined) {
      if (accessToken) {
        setTokens({ accessToken, refreshToken });
      } else {
        clearTokens();
      }
    }
    set({ user, token: accessToken !== undefined ? accessToken : get().token, authReady: true });
  },

  // Resets auth state after the refresh token itself has expired or been
  // rejected (see apiClient's "steadypost:session-expired" event) — as
  // opposed to logout(), this doesn't imply the user asked to sign out.
  expireSession: () => {
    clearTokens();
    set({ user: null, token: null });
    get().addToast("error", "Your session expired — please sign in again");
    get().setAuthModalOpen(true);
  },

  logout: () => {
    clearTokens();
    set({ user: null, token: null });
    get().addToast("info", "Signed out successfully");
  },

  setDrafts: (drafts) => set({ drafts }),
  setActiveDraft: (draft) => set({ activeDraft: draft }),
  setSocialAccounts: (accounts) => set({ socialAccounts: accounts }),

  addToast: (type, text) => {
    const id = `toast_${Date.now()}_${Math.random()}`;
    set((state) => ({ toasts: [...state.toasts, { id, type, text }] }));
    setTimeout(() => {
      get().removeToast(id);
    }, 4000);
  },

  removeToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },

  setAuthModalOpen: (open) => set({ isAuthModalOpen: open }),
  setAiModalOpen: (open) => set({ isAiModalOpen: open }),
}));
