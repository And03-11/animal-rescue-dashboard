import axios from "axios";

interface UserApiErrorPayload {
  detail?: unknown;
}

export const getUserApiErrorMessage = (error: unknown, fallback: string): string => {
  if (!axios.isAxiosError<UserApiErrorPayload>(error)) {
    return fallback;
  }

  const detail = error.response?.data?.detail;
  return typeof detail === "string" ? detail : fallback;
};
