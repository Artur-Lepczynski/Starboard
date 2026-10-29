import { buildUrl, fetchJson, type Params } from '../core/client';

const HORIZONS_PATH = '/api/horizons';

interface HorizonsResponse {
  result: string;
  error?: string;
}

export interface EphemerisTable {
  columns: string[];
  rows: Record<string, string>[];
}

export interface StateVector {
  jd: number;
  date: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

const quote = (value: string) => `'${value}'`;

export async function queryHorizons(params: Params): Promise<string> {
  const quoted = Object.fromEntries(
    Object.entries(params).map(([name, value]) => [name, typeof value === 'string' ? quote(value) : value]),
  );
  const { result, error } = await fetchJson<HorizonsResponse>(buildUrl(HORIZONS_PATH, { format: 'json', ...quoted }));
  if (error) throw new Error(`Horizons error: ${error}`);
  return result;
}

// Horizons returns a human-readable report. With CSV_FORMAT the table sits between $$SOE and $$EOE and its header is the line above the closing asterisk row before $$SOE.
export function parseEphemeris(result: string): EphemerisTable {
  const [head, rest] = result.split('$$SOE');
  const body = rest?.split('$$EOE')[0];
  if (body === undefined) {
    const excerpt = result.trim().replace(/\s+/g, ' ').slice(0, 200);
    throw new Error(`Horizons response has no ephemeris table: ${excerpt}`);
  }

  const headLines = head.trimEnd().split('\n');
  const header = headLines[headLines.length - 2];
  const names = header.split(',').map((name) => name.trim());

  const rows = body
    .trim()
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const cells = line.split(',').map((cell) => cell.trim());
      const row: Record<string, string> = {};
      names.forEach((name, i) => {
        if (name !== '') row[name] = cells[i] ?? '';
      });
      return row;
    });

  return { columns: names.filter((name) => name !== ''), rows };
}

interface EphemerisRange {
  target: string;
  center: string;
  start: string;
  stop: string;
  step: string;
}

// Positions are in km and velocities in km/s, in the ICRF frame, for the given center. Target and center are Horizons IDs such as '499' or '500@10'.
export async function getStateVectors({ target, center, start, stop, step }: EphemerisRange): Promise<StateVector[]> {
  const result = await queryHorizons({
    COMMAND: target,
    OBJ_DATA: 'NO',
    MAKE_EPHEM: 'YES',
    EPHEM_TYPE: 'VECTORS',
    CENTER: center,
    START_TIME: start,
    STOP_TIME: stop,
    STEP_SIZE: step,
    VEC_TABLE: '2',
    CSV_FORMAT: 'YES',
  });

  return parseEphemeris(result).rows.map((row) => ({
    jd: Number(row['JDTDB']),
    date: row['Calendar Date (TDB)'],
    x: Number(row['X']),
    y: Number(row['Y']),
    z: Number(row['Z']),
    vx: Number(row['VX']),
    vy: Number(row['VY']),
    vz: Number(row['VZ']),
  }));
}

export async function getObserverTable({
  target,
  center,
  start,
  stop,
  step,
  quantities,
}: EphemerisRange & { quantities: string }): Promise<EphemerisTable> {
  const result = await queryHorizons({
    COMMAND: target,
    OBJ_DATA: 'NO',
    MAKE_EPHEM: 'YES',
    EPHEM_TYPE: 'OBSERVER',
    CENTER: center,
    START_TIME: start,
    STOP_TIME: stop,
    STEP_SIZE: step,
    QUANTITIES: quantities,
    CSV_FORMAT: 'YES',
  });
  return parseEphemeris(result);
}
