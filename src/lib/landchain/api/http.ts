// Thin fetch wrapper for landchain-backend. Errors come back in one shape (spec section 4):
//   {"error": {"code", "message", "revert_reason", "field_errors", "request_id"}}
import { API_URL } from "./config";
import { authHeaders } from "./auth";

export class ApiError extends Error {
  constructor(message: string, readonly code: string, readonly status: number, readonly fieldErrors?: Record<string, string[]> | null) {
    super(message);
  }
}

type Body = Record<string, unknown> | FormData | undefined;

export async function api<T = unknown>(path: string, opts: { method?: string; body?: Body; idempotent?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json", ...(await authHeaders()) };
  let body: BodyInit | null = null;
  if (opts.body instanceof FormData) body = opts.body;
  else if (opts.body !== undefined) { body = JSON.stringify(opts.body); headers["Content-Type"] = "application/json"; }
  if (opts.idempotent) headers["Idempotency-Key"] = crypto.randomUUID();
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { method: opts.method ?? (body !== null ? "POST" : "GET"), headers, body });
  } catch {
    throw new ApiError(`Can't reach the LandChain API at ${API_URL}. Is python manage.py runserver running?`, "API_UNREACHABLE", 0);
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = (data as { error?: { code?: string; message?: string; field_errors?: Record<string, string[]> | null } }).error;
    throw new ApiError(e?.message ?? `Request failed (${res.status})`, e?.code ?? "ERROR", res.status, e?.field_errors);
  }
  return data as T;
}

/** All pages of a paginated list ({count, next, results}). */
export async function apiAll<T>(path: string): Promise<T[]> {
  const out: T[] = [];
  let url: string | null = path + (path.includes("?") ? "&" : "?") + "page_size=200";
  while (url) {
    const page: { results: T[]; next: string | null } = await api(url);
    out.push(...page.results);
    url = page.next ? page.next.slice(page.next.indexOf("/api/v1") + "/api/v1".length) : null;
  }
  return out;
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
