import axios from 'axios';

interface ApiErrorPayload {
  detail?: string;
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError<ApiErrorPayload>(error)) {
    return error.response?.data?.detail || fallback;
  }

  return fallback;
}

export function getCampaignSaveErrorMessage(error: unknown): string {
  if (axios.isAxiosError<ApiErrorPayload>(error)) {
    if (error.response) {
      return error.response.data?.detail || `Server error: ${error.response.status}`;
    }

    if (error.request) {
      return 'No response from server.';
    }
  }

  if (error instanceof Error) {
    return `Error: ${error.message}`;
  }

  return 'Failed operation.';
}

export function isAbortError(error: unknown): boolean {
  return (
    axios.isCancel(error) ||
    (error instanceof Error && error.name === 'AbortError')
  );
}
