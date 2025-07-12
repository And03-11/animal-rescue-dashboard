import * as jwt from "jwt-decode";

interface DecodedToken {
  sub: string;
  is_admin?: boolean;
  exp: number;
}

export const getCurrentUser = (): DecodedToken | null => {
  const token = localStorage.getItem("token");
  if (!token) return null;
  try {
    return (jwt as any).default(token) as DecodedToken;
  } catch {
    return null;
  }
};

export const isAdmin = (): boolean => {
  const user = getCurrentUser();
  return user?.is_admin === true;
};

export const logout = () => {
  localStorage.removeItem("token");
  window.location.replace("/login");
};

export const isTokenValid = (): boolean => {
  const token = localStorage.getItem("token");
  if (!token) return false;
  try {
    const decoded = (jwt as any).default(token) as DecodedToken; // ✅ usar default correctamente
    return decoded.exp * 1000 > Date.now();
  } catch {
    return false;
  }
};
