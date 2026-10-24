import { create } from "zustand";
import {
  api,
  getAccessToken,
  getRefreshToken,
  setTokens,
  clearTokens,
  setActiveWorkspaceId,
  getActiveWorkspaceId,
} from "./apiClient";

export const useAppStore = create((set, get) => ({
  user: null,
  token: null,
  authReady: false,
  workspaces: [],
  currentWorkspace: null,
  businessProfile: null,
  isBusinessProfileOpen: false,
  // Onboarding wizard (#04): null when closed, otherwise { mode } where mode
  // is "create" (new workspace) or "complete" (finish the current one).
  onboarding: null,
  // Workspaces whose onboarding was put off this session, so it doesn't
  // reopen on every workspace switch.
  onboardingDismissed: [],
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
      const { user } = await api.auth.me();
      
      const wsList = await api.workspaces.list().catch(() => []);

      const activeWsId = getActiveWorkspaceId() || user?.activeWorkspaceId;
      const currentWorkspace =
        wsList.find((w) => (w.id || w._id) === activeWsId) || wsList[0] || null;

      if (currentWorkspace) {
        setActiveWorkspaceId(currentWorkspace.id || currentWorkspace._id);
      }

      set({
        user,
        token: getAccessToken(),
        workspaces: wsList,
        currentWorkspace,
        authReady: true,
      });
    } catch (err) {
      clearTokens();
      set({ user: null, token: null, workspaces: [], currentWorkspace: null, authReady: true });
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
    if (user) {
      get().fetchWorkspaces();
    }
  },

  fetchWorkspaces: async () => {
    try {
      const items = await api.workspaces.list();
      const activeWsId = getActiveWorkspaceId() || get().user?.activeWorkspaceId;
      const currentWorkspace =
        items.find((w) => (w.id || w._id) === activeWsId) || items[0] || null;

      if (currentWorkspace) {
        setActiveWorkspaceId(currentWorkspace.id || currentWorkspace._id);
      }
      set({ workspaces: items, currentWorkspace });
      return items;
    } catch (err) {
      return [];
    }
  },

  switchWorkspace: async (workspaceId) => {
    try {
      set({ isLoading: true });
      await api.workspaces.switch(workspaceId);
      setActiveWorkspaceId(workspaceId);

      const items = await api.workspaces.list();
      const currentWorkspace = items.find((w) => (w.id || w._id) === workspaceId) || null;

      set({
        workspaces: items,
        currentWorkspace,
        isLoading: false,
      });

      // Refresh channels and drafts for the selected workspace
      api.socialAccounts.list().then((accounts) => set({ socialAccounts: accounts })).catch(() => {});
      api.content.list().then((drafts) => set({ drafts })).catch(() => {});

      get().addToast("success", `Switched to ${currentWorkspace?.name || "workspace"}`);
    } catch (err) {
      set({ isLoading: false });
      get().addToast("error", err.response?.data?.error || "Failed to switch workspace");
    }
  },

  expireSession: () => {
    clearTokens();
    set({ user: null, token: null, workspaces: [], currentWorkspace: null });
    get().addToast("error", "Your session expired — please sign in again");
    get().setAuthModalOpen(true);
  },

  logout: () => {
    clearTokens();
    set({ user: null, token: null, workspaces: [], currentWorkspace: null });
    get().addToast("info", "Signed out successfully");
  },

  setDrafts: (drafts) => set({ drafts }),
  setActiveDraft: (draft) => set({ activeDraft: draft }),
  setSocialAccounts: (accounts) => set({ socialAccounts: accounts }),
  setBusinessProfileOpen: (open) => set({ isBusinessProfileOpen: open }),
  openOnboarding: (mode) => set({ onboarding: { mode }, isBusinessProfileOpen: false }),
  closeOnboarding: () => set({ onboarding: null }),
  dismissOnboarding: (workspaceId) =>
    set((state) => ({
      onboarding: null,
      onboardingDismissed: [...state.onboardingDismissed, workspaceId],
    })),

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
