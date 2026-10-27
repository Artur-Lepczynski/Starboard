import { buildUrl, fetchJson } from './client';

// APOD no longer works through api.nasa.gov (it returns placeholder data), so this uses the APOD Basic feed on science.nasa.gov.
const APOD_URL = 'https://science.nasa.gov/wp-json/wp/v2/apod-basic';

const MAX_PER_PAGE = 25;

export type ApodMediaType = 'image' | 'video' | 'iframe';

interface ApodResponse {
  date: string;
  post_id: number;
  title: string;
  permalink: string;
  media_type: ApodMediaType;
  explanation: string;
  hdurl?: string;
  alt?: string;
  credit?: string;
  copyright?: string;
}

// The explanation, credit and copyright fields are HTML strings, not plain text.
export interface Apod {
  date: string;
  title: string;
  mediaType: ApodMediaType;
  pageUrl: string;
  imageUrl?: string;
  alt?: string;
  explanation: string;
  credit?: string;
  copyright?: string;
}

function toApod(raw: ApodResponse): Apod {
  return {
    date: raw.date,
    title: raw.title,
    mediaType: raw.media_type,
    pageUrl: raw.permalink,
    imageUrl: raw.hdurl || undefined,
    alt: raw.alt || undefined,
    explanation: raw.explanation,
    credit: raw.credit || undefined,
    copyright: raw.copyright || undefined,
  };
}

function toLegacyDate(date: string): string {
  return date.slice(2).replaceAll('-', '');
}

export async function getRecentApods(count = 10): Promise<Apod[]> {
  const url = buildUrl(APOD_URL, { per_page: Math.min(count, MAX_PER_PAGE) });
  const items = await fetchJson<ApodResponse[]>(url);
  return items.map(toApod);
}

export async function getLatestApod(): Promise<Apod> {
  const [latest] = await getRecentApods(1);
  if (!latest) throw new Error('APOD feed returned no entries');
  return latest;
}

export async function getApod(date: string): Promise<Apod> {
  const url = buildUrl(`${APOD_URL}/${toLegacyDate(date)}`);
  return toApod(await fetchJson<ApodResponse>(url));
}

export async function getApodRange(from: string, to: string): Promise<Apod[]> {
  const url = buildUrl(APOD_URL, {
    date_from: toLegacyDate(from),
    date_to: toLegacyDate(to),
    per_page: MAX_PER_PAGE,
  });
  const items = await fetchJson<ApodResponse[]>(url);
  return items.map(toApod);
}
