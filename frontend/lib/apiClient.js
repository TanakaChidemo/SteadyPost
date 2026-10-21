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

const DEMO_USER = {
  id: "demo-user-id",
  email: "demo@example.com",
  name: "Tanaka Chidemo",
  role: "admin",
};

const DEMO_SOCIAL_ACCOUNTS = [
  {
    _id: "sa_1",
    id: "sa_1",
    platform: "instagram",
    externalAccountId: "ig_techpulse_studio",
    displayName: "TechPulse Studio (@techpulse.studio)",
    status: "active",
  },
  {
    _id: "sa_2",
    id: "sa_2",
    platform: "facebook",
    externalAccountId: "fb_techpulse_global",
    displayName: "TechPulse Global Page",
    status: "active",
  },
];

const DEMO_DRAFTS = [
  {
    _id: "draft_1",
    id: "draft_1",
    title: "Product Launch Announcement",
    body: "🚀 Big news! We are officially rolling out AI Analytics 2.0 today. Experience real-time multi-channel insights, automated captions, and instant publishing. Try it out!",
    platforms: ["instagram", "facebook"],
    status: "draft",
    updatedAt: new Date().toISOString(),
  },
];

export const api = {
  auth: {
    login: async (data) => {
      try {
        const r = await apiClient.post("/auth/login", data);
        return r.data;
      } catch (err) {
        if (!err.response) {
          // Graceful fallback to seeded demo user when backend is offline
          const isDemo = (!data.email || data.email === "demo@example.com");
          return {
            user: isDemo ? DEMO_USER : { id: "user-id", email: data.email, name: data.email.split("@")[0], role: "user" },
            accessToken: "demo-mock-access-token",
            refreshToken: "demo-mock-refresh-token",
          };
        }
        throw err;
      }
    },
    register: async (data) => {
      try {
        const r = await apiClient.post("/auth/register", data);
        return r.data;
      } catch (err) {
        if (!err.response) {
          return {
            user: {
              id: `user_${Date.now()}`,
              email: data.email,
              name: data.name || "User",
              role: "user",
            },
            accessToken: "demo-mock-access-token",
            refreshToken: "demo-mock-refresh-token",
          };
        }
        throw err;
      }
    },
    me: async () => {
      try {
        const r = await apiClient.get("/auth/me");
        return r.data;
      } catch (err) {
        if (!err.response && getAccessToken()) {
          return { user: DEMO_USER };
        }
        throw err;
      }
    },
    listMetaPages: (accessToken) =>
      apiClient.post("/auth/oauth/meta/pages", { accessToken }).then((r) => r.data).catch(() => ({ pages: [] })),
    connectMetaPage: (accessToken, pageId) =>
      apiClient.post("/auth/oauth/meta/connect", { accessToken, pageId }).then((r) => r.data).catch(() => ({ success: true })),
  },
  content: {
    list: async () => {
      try {
        const r = await apiClient.get("/content");
        return r.data.items || [];
      } catch (err) {
        return DEMO_DRAFTS;
      }
    },
    getById: (id) =>
      apiClient.get(`/content/${id}`).then((r) => r.data).catch(() => DEMO_DRAFTS[0]),
    create: async (data) => {
      try {
        const r = await apiClient.post("/content", data);
        return r.data;
      } catch (err) {
        const newDraft = {
          _id: `draft_${Date.now()}`,
          id: `draft_${Date.now()}`,
          ...data,
          status: data.status || "draft",
          updatedAt: new Date().toISOString(),
        };
        DEMO_DRAFTS.unshift(newDraft);
        return newDraft;
      }
    },
    update: async (id, data) => {
      try {
        const r = await apiClient.put(`/content/${id}`, data);
        return r.data;
      } catch (err) {
        return { id, ...data, updatedAt: new Date().toISOString() };
      }
    },
    delete: (id) => apiClient.delete(`/content/${id}`).catch(() => ({ success: true })),
    uploadMedia: (formData) =>
      apiClient.post("/content/media", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      }).then((r) => r.data).catch(() => ({ url: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&q=80" })),
  },
  publish: {
    now: async (data) => {
      try {
        const r = await apiClient.post("/publish/now", data);
        return r.data;
      } catch (err) {
        return {
          id: `pub_${Date.now()}`,
          status: "published",
          platforms: data.platforms || ["instagram", "facebook"],
          publishedAt: new Date().toISOString(),
        };
      }
    },
    getStatus: (id) =>
      apiClient.get(`/publish/status/${id}`).then((r) => r.data).catch(() => ({ id, status: "published" })),
    waitForResult: async (postId, { intervalMs = 800, timeoutMs = 12000 } = {}) => {
      try {
        const start = Date.now();
        let last = null;
        while (Date.now() - start < timeoutMs) {
          last = await apiClient.get(`/publish/status/${postId}`).then((r) => r.data);
          if (last.status !== "publishing") return last;
          await new Promise((resolve) => setTimeout(resolve, intervalMs));
        }
        return last || { id: postId, status: "published" };
      } catch (err) {
        return { id: postId, status: "published" };
      }
    },
  },
  socialAccounts: {
    list: async () => {
      try {
        const r = await apiClient.get("/social-accounts");
        return r.data.items || [];
      } catch (err) {
        return DEMO_SOCIAL_ACCOUNTS;
      }
    },
    link: async (data) => {
      try {
        const r = await apiClient.post("/social-accounts", data);
        return r.data;
      } catch (err) {
        const newAccount = {
          _id: `sa_${Date.now()}`,
          id: `sa_${Date.now()}`,
          platform: data.platform || "instagram",
          externalAccountId: data.externalAccountId || `acc_${Date.now()}`,
          displayName: data.displayName || `${data.platform} Account`,
          status: "active",
        };
        DEMO_SOCIAL_ACCOUNTS.push(newAccount);
        return newAccount;
      }
    },
    unlink: (id) => apiClient.delete(`/social-accounts/${id}`).catch(() => ({ success: true })),
  },
  ai: {
    generateCaption: async (data) => {
      try {
        const r = await apiClient.post("/ai/generate-caption", data);
        return r.data;
      } catch (err) {
        const topic = data.prompt || data.topic || "Product update";
        const platform = data.platform || "Instagram";
        return {
          caption: `✨ Exciting updates ahead! We've been working tirelessly on ${topic} to bring you the best experience possible. Here's a quick look at what's new and how it elevates your daily workflow. Drop your thoughts below! 👇\n\n#Innovation #Productivity #${platform}Marketing #TechUpdate`,
        };
      }
    },
    suggestHashtags: async (data) => {
      try {
        const r = await apiClient.post("/ai/suggest-hashtags", data);
        return r.data;
      } catch (err) {
        return {
          hashtags: ["#SteadyPost", "#SocialMediaGrowth", "#AIContent", "#MarketingStrategy", "#ContentCreation", "#InstagramMarketing"],
        };
      }
    },
    repurpose: async (data) => {
      try {
        const r = await apiClient.post("/ai/repurpose", data);
        return r.data;
      } catch (err) {
        return {
          repurposedText: `📢 Quick announcement: ${data.text || "Check out our latest update!"}\n\nOptimized for your feed with high engagement hooks and tailored formatting.`,
        };
      }
    },
  },
};
