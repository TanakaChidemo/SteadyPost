import axios from "axios";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000/api/v1";

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 10000,
});

export function getAccessToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("accessToken");
}

export function getRefreshToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("refreshToken");
}

export function setTokens({ accessToken, refreshToken } = {}) {
  if (typeof window === "undefined") return;
  if (accessToken) window.localStorage.setItem("accessToken", accessToken);
  if (refreshToken) window.localStorage.setItem("refreshToken", refreshToken);
}

export function getActiveWorkspaceId() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("activeWorkspaceId");
}

export function setActiveWorkspaceId(workspaceId) {
  if (typeof window === "undefined") return;
  if (workspaceId) {
    window.localStorage.setItem("activeWorkspaceId", workspaceId);
  } else {
    window.localStorage.removeItem("activeWorkspaceId");
  }
}

export function clearTokens() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem("accessToken");
  window.localStorage.removeItem("refreshToken");
  window.localStorage.removeItem("activeWorkspaceId");
}

apiClient.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const workspaceId = getActiveWorkspaceId();
  if (workspaceId) {
    config.headers["X-Workspace-Id"] = workspaceId;
  }
  return config;
});

// Access tokens expire after 15 minutes (see backend JWT_ACCESS_EXPIRY). Rather
// than let every request 401 once that happens, transparently swap in a fresh
// access token via the refresh token and retry — only falling back to
// "session-expired" (dispatched for AuthHydrator to catch) when the refresh
// token itself is missing or no longer valid.
let refreshPromise = null;

function refreshAccessToken() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    return Promise.reject(new Error("No refresh token available"));
  }

  if (!refreshPromise) {
    refreshPromise = axios
      .post(`${API_BASE_URL}/auth/refresh`, { refreshToken })
      .then((res) => {
        setTokens({ accessToken: res.data.accessToken });
        return res.data.accessToken;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    // If backend is not running, provide graceful structured error
    if (!error.response) {
      return Promise.reject(new Error("Network connection to backend server failed"));
    }

    const { config, response } = error;
    const isAuthEndpoint = /\/auth\/(login|register|refresh)$/.test(config?.url || "");

    if (response.status === 401 && config && !config._retry && !isAuthEndpoint) {
      // No refresh token on hand means the user was never logged in (or is
      // already fully logged out) — behave exactly as before, no refresh
      // attempt and no session-expired noise.
      if (!getRefreshToken()) {
        return Promise.reject(error);
      }

      config._retry = true;
      try {
        const newAccessToken = await refreshAccessToken();
        config.headers = { ...config.headers, Authorization: `Bearer ${newAccessToken}` };
        return apiClient(config);
      } catch (refreshErr) {
        clearTokens();
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("steadypost:session-expired"));
        }
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  }
);

export const api = {
  auth: {
    login: (data) => apiClient.post("/auth/login", data).then((r) => r.data),
    register: (data) => apiClient.post("/auth/register", data).then((r) => r.data),
    me: () => apiClient.get("/auth/me").then((r) => r.data),
    // accessToken here is the User Access Token the Facebook JS SDK hands
    // back from FB.login() with a Business Login config_id — not our own JWT.
    listMetaPages: (accessToken) =>
      apiClient.post("/auth/oauth/meta/pages", { accessToken }).then((r) => r.data),
    connectMetaPage: (accessToken, pageId) =>
      apiClient.post("/auth/oauth/meta/connect", { accessToken, pageId }).then((r) => r.data),
  },
  content: {
    list: () => apiClient.get("/content").then((r) => r.data.items || []),
    getById: (id) => apiClient.get(`/content/${id}`).then((r) => r.data),
    create: (data) => apiClient.post("/content", data).then((r) => r.data),
    update: (id, data) => apiClient.put(`/content/${id}`, data).then((r) => r.data),
    delete: (id) => apiClient.delete(`/content/${id}`),
    uploadMedia: (formData) =>
      apiClient.post("/content/media", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      }).then((r) => r.data),
  },
  publish: {
    now: (data) => apiClient.post("/publish/now", data).then((r) => r.data),
    getStatus: (id) => apiClient.get(`/publish/status/${id}`).then((r) => r.data),
    // Publish jobs run async on the backend (202 Publishing -> published/failed).
    // Poll status instead of trusting the 202 response, so real failures (e.g. an
    // Instagram media-format rejection) surface to the user instead of being silent.
    waitForResult: async (postId, { intervalMs = 800, timeoutMs = 12000 } = {}) => {
      const start = Date.now();
      let last = null;
      while (Date.now() - start < timeoutMs) {
        last = await apiClient.get(`/publish/status/${postId}`).then((r) => r.data);
        if (last.status !== "publishing") return last;
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
      return last || { id: postId, status: "timeout", errorMessage: "Timed out waiting for publish result" };
    },
  },
  socialAccounts: {
    list: () => apiClient.get("/social-accounts").then((r) => r.data.items || []),
    link: (data) => apiClient.post("/social-accounts", data).then((r) => r.data),
    unlink: (id) => apiClient.delete(`/social-accounts/${id}`),
  },
  workspaces: {
    list: () => apiClient.get("/workspaces").then((r) => r.data.items || []),
    current: () => apiClient.get("/workspaces/current").then((r) => r.data),
    create: (data) => apiClient.post("/workspaces", data).then((r) => r.data),
    switch: (id) => apiClient.post(`/workspaces/switch/${id}`).then((r) => r.data),
    listMembers: () => apiClient.get("/workspaces/current/members").then((r) => r.data.items || []),
    inviteMember: (data) => apiClient.post("/workspaces/current/invitations", data).then((r) => r.data),
  },
  businessProfile: {
    get: () => apiClient.get("/business-profile/profile").then((r) => r.data),
    update: (data) => apiClient.put("/business-profile/profile", data).then((r) => r.data),
    getNotifications: () => apiClient.get("/business-profile/notifications").then((r) => r.data),
    updateNotifications: (data) => apiClient.put("/business-profile/notifications", data).then((r) => r.data),
  },
  posts: {
    list: ({ status, campaignId } = {}) =>
      apiClient.get("/posts", { params: { status, campaignId } }).then((r) => r.data.items || []),
    getById: (id) => apiClient.get(`/posts/${id}`).then((r) => r.data),
    create: (data) => apiClient.post("/posts", data).then((r) => r.data),
    update: (id, data) => apiClient.put(`/posts/${id}`, data).then((r) => r.data),
    delete: (id) => apiClient.delete(`/posts/${id}`),
    getTopPerforming: ({ limit = 10, channel, metric = "engagement" } = {}) =>
      apiClient.get("/posts/top-performing", { params: { limit, channel, metric } }).then((r) => r.data),
    generateVariants: (data) => apiClient.post("/posts/generate-variants", data).then((r) => r.data),
    repurposePost: (id, data) => apiClient.post(`/posts/${id}/repurpose`, data).then((r) => r.data),
    batchCreate: (posts) => apiClient.post("/posts/batch-create", { posts }).then((r) => r.data.items || []),
    submitApproval: (id, data = {}) => apiClient.post(`/posts/${id}/submit-approval`, data).then((r) => r.data),
    approve: (id, data = {}) => apiClient.post(`/posts/${id}/approve`, data).then((r) => r.data),
    requestChanges: (id, data = {}) => apiClient.post(`/posts/${id}/request-changes`, data).then((r) => r.data),
    publishNow: (id) => apiClient.post(`/posts/${id}/publish-now`).then((r) => r.data),
    publishApproved: (data = {}) => apiClient.post("/posts/publish-approved", data).then((r) => r.data),
  },
  ai: {
    generateCaption: (data) => apiClient.post("/ai/generate-caption", data).then((r) => r.data),
    suggestHashtags: (data) => apiClient.post("/ai/suggest-hashtags", data).then((r) => r.data),
    repurpose: (data) => apiClient.post("/ai/repurpose", data).then((r) => r.data),
    generateVariants: (data) => apiClient.post("/posts/generate-variants", data).then((r) => r.data),
  },
};
