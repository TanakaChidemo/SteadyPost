import { create } from "zustand";
import { api } from "./apiClient";

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
    const token = window.localStorage.getItem("accessToken");
    if (!token) {
      set({ authReady: true });
      return;
    }
    try {
      const { user } = await api.auth.me();
      set({ user, token, authReady: true });
    } catch (err) {
      window.localStorage.removeItem("accessToken");
      set({ user: null, token: null, authReady: true });
    }
  },

  setUser: (user, token) => {
    if (token !== undefined && typeof window !== "undefined") {
      if (token) {
        window.localStorage.setItem("accessToken", token);
      } else {
        window.localStorage.removeItem("accessToken");
      }
    }
    set({ user, token: token !== undefined ? token : get().token, authReady: true });
  },

  logout: () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("accessToken");
    }
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
