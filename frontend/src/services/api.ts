/**
 * api.ts — Central REST client.
 *
 * NEXT_PUBLIC_API_URL accepts an origin or a URL ending with /api, e.g.:
 *   https://realtime-auction-z5s2.onrender.com/api
 */
import { authService } from "./auth.service";

export const USE_MOCK_DATA =
  process.env.NEXT_PUBLIC_USE_MOCK_DATA === "true";

export class ApiError extends Error {
  constructor(
    message: string,
    public code = "REQUEST_FAILED",
    public status?: number,
    public issues?: { message: string }[]
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function normalizeError(error: unknown): ApiError {
  return error instanceof ApiError
    ? error
    : new ApiError(
        error instanceof Error ? error.message : "Unable to complete the request."
      );
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const configured = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "");
  const base = configured ? configured.replace(/\/api$/, "") + "/api" : "";
  if (!base) throw new ApiError("Backend URL is not configured.", "CONFIGURATION_ERROR");

  const token = await authService.getAccessToken();
  // Don't throw here for missing token — let the backend return 401 so the
  // caller sees a consistent error code rather than a client-thrown exception
  // that surfaces as "server didn't respond."

  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (options.body != null && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const url = base + (path.startsWith("/") ? path : `/${path}`);

  let response: Response;
  try {
    response = await fetch(url, { ...options, headers, cache: "no-store" });
  } catch {
    throw new ApiError(
      "The request could not reach the backend. The server may be unavailable or may have blocked this request. Please try again.",
      "NETWORK_ERROR"
    );
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new ApiError(
        "The server returned an unexpected response.",
        "INVALID_RESPONSE",
        response.status
      );
    }
  }

  if (!response.ok) {
    const envelope = body as {
      error?: { code?: string; message?: string; issues?: { message: string }[] };
    } | null;
    const err = envelope?.error;
    throw new ApiError(
      err?.issues?.map((i) => i.message).join("; ") ||
        err?.message ||
        `Request failed (${response.status})`,
      err?.code,
      response.status,
      err?.issues
    );
  }

  return body as T;
}

export const api = {
  get: <T>(path: string, options?: RequestInit) =>
    apiFetch<T>(path, { ...options, method: "GET" }),
  post: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) }),
  patch: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: "PUT", body: JSON.stringify(body ?? {}) }),
  delete: <T>(path: string) =>
    apiFetch<T>(path, { method: "DELETE" }),
};
