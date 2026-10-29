export type Params = Record<string, string | number | boolean | undefined>;

export function buildUrl(base: string, params: Params = {}): URL {
  const url = new URL(base, globalThis.location?.origin);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url;
}

export async function fetchJson<T>(url: URL): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url.origin} responded ${res.status}: ${res.statusText}`);
  return res.json() as Promise<T>;
}
