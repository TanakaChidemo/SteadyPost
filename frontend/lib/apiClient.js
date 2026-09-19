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

export function clearTokens() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem("accessToken");
  window.localStorage.removeItem("refreshToken");
}

apiClient.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
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
  ai: {
    generateCaption: (data) => apiClient.post("/ai/generate-caption", data).then((r) => r.data),
    suggestHashtags: (data) => apiClient.post("/ai/suggest-hashtags", data).then((r) => r.data),
    repurpose: (data) => apiClient.post("/ai/repurpose", data).then((r) => r.data),
  },
};
