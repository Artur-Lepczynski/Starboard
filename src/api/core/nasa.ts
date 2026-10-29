import { buildUrl, fetchJson, type Params } from './client';

const BASE_URL = 'https://api.nasa.gov';

const API_KEY = import.meta.env.VITE_NASA_API_KEY || 'DEMO_KEY';

export function nasaFetch<T>(path: string, params: Params = {}): Promise<T> {
  return fetchJson<T>(buildUrl(BASE_URL + path, { ...params, api_key: API_KEY }));
}
