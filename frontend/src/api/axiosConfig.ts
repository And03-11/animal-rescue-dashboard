// =====================================================================
// File: src/api/axiosConfig.ts  (REEMPLAZA COMPLETO)
// =====================================================================
import axios from "axios";

const apiClient = axios.create({
  baseURL: "/api/v1",
});

apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    config.headers = config.headers || {};

    if (token) {
      (config.headers as any).Authorization = `Bearer ${token}`;
    }

    // --- Content-Type correcto según el cuerpo ---
    if (!config.headers["Content-Type"]) {
      const method = (config.method || "").toLowerCase();

      if (method === "post" || method === "put" || method === "patch") {
        const isFormData =
          typeof FormData !== "undefined" && config.data instanceof FormData;
        const isUrlSearchParams =
          typeof URLSearchParams !== "undefined" &&
          config.data instanceof URLSearchParams;

        if (isUrlSearchParams) {
          // Solo urlencoded si el body es URLSearchParams
          (config.headers as any)["Content-Type"] =
            "application/x-www-form-urlencoded";
        } else if (isFormData) {
          // Dejar que el navegador ponga el boundary automáticamente
          // No seteamos Content-Type aquí.
        } else {
          // JSON por defecto
          (config.headers as any)["Content-Type"] = "application/json";
        }
      }
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// 401 global
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