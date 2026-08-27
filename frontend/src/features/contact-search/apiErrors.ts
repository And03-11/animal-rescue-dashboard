import axios from "axios";

interface ContactSearchErrorPayload {
  detail?: unknown;
}

export const isCanceledContactRequest = (error: unknown): boolean =>
  axios.isCancel(error) ||
  (axios.isAxiosError(error) && (error.code === "ERR_CANCELED" || error.name === "CanceledError"));

export const getContactSearchErrorMessage = (error: unknown, email: string): string => {
  if (!axios.isAxiosError<ContactSearchErrorPayload>(error)) {
    return "We could not complete the search. Please try again.";
  }

  if (error.response?.status === 404) {
    return `No donor record was found for ${email}.`;
  }

  const detail = error.response?.data?.detail;
  return typeof detail === "string"
    ? detail
    : "We could not complete the search. Please try again.";
};
