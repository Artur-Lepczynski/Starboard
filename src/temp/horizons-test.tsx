import { useState } from 'react';
import { buildUrl } from '../api/client';
import './horizons-test.css';

const HORIZONS_URL = '/api/horizons';

const QUERY = {
  format: 'json',
  COMMAND: "'499'",
  OBJ_DATA: "'YES'",
  MAKE_EPHEM: "'YES'",
  EPHEM_TYPE: "'OBSERVER'",
  CENTER: "'500@399'",
  START_TIME: "'2006-01-01'",
  STOP_TIME: "'2006-01-20'",
  STEP_SIZE: "'1 d'",
  QUANTITIES: "'1,9,20,23,24,29'",
};

type TestState =
  | { status: 'idle' }
  | { status: 'loading' }
  | {
      status: 'response';
      ok: boolean;
      httpStatus: number;
      statusText: string;
      elapsedMs: number;
      headers: [string, string][];
      body: string;
      apiError?: string;
      resultText?: string;
    }
  | { status: 'error'; message: string; reason: string; elapsedMs: number };

async function diagnoseNetworkFailure(url: URL): Promise<string> {
  try {
    await fetch(url, { mode: 'no-cors' });
    return 'The server was reachable, but the browser blocked the response. This is a CORS failure: the server did not send an Access-Control-Allow-Origin header allowing this origin.';
  } catch {
    return 'The server could not be reached at all. This is a network, DNS or TLS certificate problem, not CORS.';
  }
}

export function HorizonsTest() {
  const [state, setState] = useState<TestState>({ status: 'idle' });
  const url = buildUrl(HORIZONS_URL, QUERY);

  async function runTest() {
    setState({ status: 'loading' });
    const startedAt = performance.now();

    try {
      const res = await fetch(url, { headers: {"Accept": "application/json"} });
      const text = await res.text();
      const elapsedMs = Math.round(performance.now() - startedAt);

      let body = text;
      let apiError: string | undefined;
      let resultText: string | undefined;
      try {
        const parsed = JSON.parse(text);
        body = JSON.stringify(parsed, null, 2);
        apiError = parsed.error;
        resultText = parsed.result;
      } catch {
        body = text;
      }

      setState({
        status: 'response',
        ok: res.ok,
        httpStatus: res.status,
        statusText: res.statusText,
        elapsedMs,
        headers: [...res.headers.entries()],
        body,
        apiError,
        resultText,
      });
    } catch (err) {
      const elapsedMs = Math.round(performance.now() - startedAt);
      const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      const reason =
        err instanceof TypeError
          ? await diagnoseNetworkFailure(url)
          : 'The request failed for an unexpected reason.';
      setState({ status: 'error', message, reason, elapsedMs });
    }
  }

  return (
    <section className="horizons-test">
      <h1>Horizons API test (temporary)</h1>
      <p className="horizons-test-url">GET {url.toString()}</p>
      <button onClick={runTest} disabled={state.status === 'loading'}>
        {state.status === 'loading' ? 'Calling...' : 'Call Horizons API'}
      </button>

      {state.status === 'error' && (
        <div className="horizons-test-box horizons-test-fail">
          <h2>Request failed ({state.elapsedMs} ms)</h2>
          <p>
            <strong>Message:</strong> {state.message}
          </p>
          <p>
            <strong>Reason:</strong> {state.reason}
          </p>
          <p>The browser console has the exact low-level error.</p>
        </div>
      )}

      {state.status === 'response' && (
        <div
          className={`horizons-test-box ${state.ok && !state.apiError ? 'horizons-test-pass' : 'horizons-test-fail'}`}
        >
          <h2>
            HTTP {state.httpStatus} {state.statusText} ({state.elapsedMs} ms)
          </h2>
          {state.apiError && (
            <p>
              <strong>API reported an error:</strong> {state.apiError}
            </p>
          )}

          <h3>Response headers visible to the browser</h3>
          <pre>
            {state.headers.length > 0
              ? state.headers.map(([name, value]) => `${name}: ${value}`).join('\n')
              : '(none exposed)'}
          </pre>

          {state.resultText && (
            <>
              <h3>result (decoded text)</h3>
              <pre>{state.resultText}</pre>
            </>
          )}

          <h3>Full response body</h3>
          <pre>{state.body}</pre>
        </div>
      )}
    </section>
  );
}
