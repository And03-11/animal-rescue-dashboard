// --- Archivo: frontend/src/auth.ts (Versión Final Corregida) ---
import { jwtDecode } from "jwt-decode"; // <-- CAMBIO 1: La forma de importar

interface DecodedToken {
  sub: string;
  is_admin?: boolean;
  exp: number;
}

export const getCurrentUser = (): DecodedToken | null => {
  const token = localStorage.getItem("token");
  if (!token) return null;

  try {
    // CAMBIO 2: La forma de llamar a la función
    return jwtDecode<DecodedToken>(token);
  } catch (error) {
    console.error("Failed to decode token:", error);
    return null;
  }
};

export const isAdmin = (): boolean => {
  const user = getCurrentUser();
  // Esta comprobación ahora es más segura gracias a TypeScript
  return user?.is_admin === true;
};

export const logout = () => {
  localStorage.removeItem("token");
  // Redirigir a login para forzar un estado limpio
  window.location.replace("/login");
};

export const isTokenValid = (): boolean => {
  const token = localStorage.getItem("token");
  if (!token) return false;

  try {
    // CAMBIO 3: Corregir también aquí
    const decoded = jwtDecode<DecodedToken>(token);
    // Comprobar que el token no ha expirado
    return decoded.exp * 1000 > Date.now();
  } catch {
    return false;
  }
};