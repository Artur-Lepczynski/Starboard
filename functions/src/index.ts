import { setGlobalOptions } from 'firebase-functions';
import { onRequest } from 'firebase-functions/https';
import * as logger from 'firebase-functions/logger';

setGlobalOptions({ maxInstances: 10 });

const HORIZONS_URL = 'https://ssd.jpl.nasa.gov/api/horizons.api';

const ALLOWED_PARAMS = new Set([
  'COMMAND',
  'OBJ_DATA',
  'MAKE_EPHEM',
  'EPHEM_TYPE',
  'CENTER',
  'START_TIME',
  'STOP_TIME',
  'STEP_SIZE',
  'TLIST',
  'QUANTITIES',
  'VEC_TABLE',
  'CSV_FORMAT',
  'REF_PLANE',
  'REF_SYSTEM',
  'OUT_UNITS',
  'VEC_LABELS',
  'VEC_DELTA_T',
  'TIME_TYPE',
  'TIME_DIGITS',
  'CAL_FORMAT',
  'ANG_FORMAT',
  'APPARENT',
  'EXTRA_PREC',
  'COORD_TYPE',
  'SITE_COORD',
  'AIRMASS',
  'SKIP_DAYLT',
]);

const MAX_VALUE_LENGTH = 500;
const UPSTREAM_TIMEOUT_MS = 20_000;

export const horizons = onRequest({ cors: false }, async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Only GET is supported' });
    return;
  }

  const upstream = new URL(HORIZONS_URL);
  upstream.searchParams.set('format', 'json');

  for (const [name, value] of Object.entries(req.query)) {
    if (name === 'format') continue;
    if (!ALLOWED_PARAMS.has(name)) {
      res.status(400).json({ error: `Parameter not allowed: ${name}` });
      return;
    }
    if (typeof value !== 'string' || value.length > MAX_VALUE_LENGTH) {
      res.status(400).json({ error: `Invalid value for parameter: ${name}` });
      return;
    }
    upstream.searchParams.set(name, value);
  }

  if (!upstream.searchParams.has('COMMAND')) {
    res.status(400).json({ error: 'COMMAND is required' });
    return;
  }

  try {
    const upstreamRes = await fetch(upstream, {
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    const body = await upstreamRes.json();

    if (!upstreamRes.ok || body.error) {
      logger.warn('Horizons returned an error', { status: upstreamRes.status, error: body.error });
      res.status(502).json({ error: body.error ?? `Horizons responded ${upstreamRes.status}` });
      return;
    }

    res.set('Cache-Control', 'public, max-age=300, s-maxage=3600');
    res.status(200).json(body);
  } catch (err) {
    logger.error('Horizons request failed', err);
    res.status(504).json({ error: 'Horizons did not respond' });
  }
});
