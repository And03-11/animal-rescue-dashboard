// --- Archivo: src/api/axiosConfig.ts ---
import axios from "axios";

const apiClient = axios.create({
  baseURL: "/api/v1",
});

// ➕ Añadir token automáticamente
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    config.headers = config.headers || {};

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    if (config.method === "post" && !config.headers["Content-Type"]) {
      config.headers["Content-Type"] = "application/x-www-form-urlencoded";
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// 🚨 Manejar errores 401 globalmente
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export default apiClient;
