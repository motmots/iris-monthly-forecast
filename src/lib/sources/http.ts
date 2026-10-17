/**
 * Server-only HTTP helpers for the live data path.
 *
 * Every `live.ts` that reaches an upstream API goes through one of these. They
 * add three things the raw `fetch` does not: a hard timeout (a hung upstream
 * must not hang the page), a browser-ish User-Agent (some feeds 403 the default
 * one), and Next's time-based cache so repeated renders inside the revalidate
 * window cost one request, not one per panel.
 *
 * On any non-2xx or network error these throw. `defineFeature` catches that and
 * falls back to the mock layer with `reason: 'query_error'`, so a dead upstream
 * degrades to a badged placeholder instead of a 500.
 */

const UA =
  'Mozilla/5.0 (compatible; IRIS-Terminal/1.0; +https://github.com/) AppleWebKit/537.36';

const DEFAULT_TIMEOUT_MS = 9_000;

export interface FetchOpts {
  /** Seconds Next may serve this response from cache before refetching. */
  revalidate: number;
  /** Extra request headers. */
  headers?: Record<string, string>;
  /** Override the abort timeout. */
  timeoutMs?: number;
}

async function raw(url: string, opts: FetchOpts): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctl.signal,
      headers: { 'user-agent': UA, accept: '*/*', ...opts.headers },
      next: { revalidate: opts.revalidate },
    });
    if (!res.ok) {
      throw new Error(`GET ${shorten(url)} -> ${res.status} ${res.statusText}`);
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch and parse JSON. Throws on non-2xx, timeout, or invalid JSON. */
export async function fetchJson<T>(url: string, opts: FetchOpts): Promise<T> {
  const res = await raw(url, { ...opts, headers: { accept: 'application/json', ...opts.headers } });
  return (await res.json()) as T;
}

/** Fetch raw text (RSS/XML). Throws on non-2xx or timeout. */
export async function fetchText(url: string, opts: FetchOpts): Promise<string> {
  const res = await raw(url, opts);
  return res.text();
}

function shorten(url: string): string {
  try {
    const u = new URL(url);
    return u.host + u.pathname;
  } catch {
    return url.slice(0, 80);
  }
}
