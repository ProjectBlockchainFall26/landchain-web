// Thin fetch wrapper for landchain-backend. Errors come back in one shape (spec section 4):
//   {"error": {"code", "message", "revert_reason", "field_errors", "request_id"}}
import { API_URL } from "./config";
import { authHeaders, signOutApi } from "./auth";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly fieldErrors?: Record<string, string[]> | null,
  ) {
    super(message);
  }
}

type Body = Record<string, unknown> | FormData | undefined;

let rejected: string | null = null;
/** The message of the last sign-in the backend refused (cleared when read). */
export function takeRejectedSignIn(): string | null {
  const r = rejected;
  rejected = null;
  return r;
}

export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: Body; idempotent?: boolean } = {},
  retried = false,
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(await authHeaders()),
  };
  let body: BodyInit | null = null;
  if (opts.body instanceof FormData) body = opts.body;
  else if (opts.body !== undefined) {
    body = JSON.stringify(opts.body);
    headers["Content-Type"] = "application/json";
  }
  if (opts.idempotent) headers["Idempotency-Key"] = crypto.randomUUID();
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: opts.method ?? (body !== null ? "POST" : "GET"),
      headers,
      body,
    });
  } catch {
    throw new ApiError(
      `Can't reach the LandChain API at ${API_URL}. Is python manage.py runserver running?`,
      "API_UNREACHABLE",
      0,
    );
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && headers["Authorization"] && !retried) {
    // The backend refused our Supabase session (expired, or the backend can't verify it). Drop it and carry
    // on as a visitor, so public pages still load; sign-in screens report the reason.
    const code = (data as { error?: { code?: string } }).error?.code;
    if (code === "TOKEN_INVALID" || code === "TOKEN_EXPIRED") {
      rejected =
        code === "TOKEN_EXPIRED"
          ? "Your session expired. Sign in again."
          : "The LandChain API didn't accept this sign-in. Check SUPABASE_JWT_SECRET (or the JWT signing keys) in the backend .env, then restart it.";
      await signOutApi();
      return api<T>(path, opts, true);
    }
  }
  if (!res.ok) {
    const e = (
      data as {
        error?: {
          code?: string;
          message?: string;
          field_errors?: Record<string, string[]> | null;
        };
      }
    ).error;
    throw new ApiError(
      e?.message ?? `Request failed (${res.status})`,
      e?.code ?? "ERROR",
      res.status,
      e?.field_errors,
    );
  }
  return data as T;
}

/** All pages of a paginated list ({count, next, results}). */
export async function apiAll<T>(path: string): Promise<T[]> {
  const out: T[] = [];
  let url: string | null =
    path + (path.includes("?") ? "&" : "?") + "page_size=200";
  while (url) {
    const page: { results: T[]; next: string | null } = await api(url);
    out.push(...page.results);
    url = page.next
      ? page.next.slice(page.next.indexOf("/api/v1") + "/api/v1".length)
      : null;
  }
  return out;
}

export const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : String(e);
