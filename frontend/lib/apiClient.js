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

apiClient.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = window.localStorage.getItem("accessToken");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // If backend is not running, provide graceful structured error
    if (!error.response) {
      return Promise.reject(new Error("Network connection to backend server failed"));
    }

    return Promise.reject(error);
  }
);

export const api = {
  auth: {
    login: (data) => apiClient.post("/auth/login", data).then((r) => r.data),
    register: (data) => apiClient.post("/auth/register", data).then((r) => r.data),
    me: () => apiClient.get("/auth/me").then((r) => r.data),
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
