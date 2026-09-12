import { create } from "zustand";

export const useAppStore = create((set, get) => ({
  user: null,
  token: null,
  drafts: [],
  activeDraft: null,
  socialAccounts: [],
  toasts: [],
  isAuthModalOpen: false,
  isAiModalOpen: false,
  isLoading: false,

  setUser: (user, token) => {
    if (token !== undefined && typeof window !== "undefined") {
      if (token) {
        window.localStorage.setItem("accessToken", token);
      } else {
        window.localStorage.removeItem("accessToken");
      }
    }
    set({ user, token: token !== undefined ? token : get().token });
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
