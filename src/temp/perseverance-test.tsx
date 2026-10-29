import { useState } from 'react';
import {
  buildPhotosUrl,
  getLatestPhotos,
  getPhotosBySol,
  NORMAL_CAMERAS,
  PERSEVERANCE_CAMERA_INFO,
  toPhotos,
  TOP_CAMERAS,
  UNAVAILABLE_CAMERAS,
  type PerseveranceCamera,
  type PerseverancePhoto,
} from '../api/mars/perseverance';
import './perseverance-test.css';

interface AppCall {
  call: string;
  failed: boolean;
  text: string;
}

async function callModule(
  sol: number | undefined,
  count: number,
  camera: PerseveranceCamera | undefined,
): Promise<AppCall> {
  const call =
    sol === undefined
      ? `getLatestPhotos({ count: ${count}${camera ? `, camera: '${camera}'` : ''} })`
      : `getPhotosBySol(${sol}${camera ? `, { camera: '${camera}' }` : ''})`;
  try {
    const photos =
      sol === undefined ? await getLatestPhotos({ count, camera }) : await getPhotosBySol(sol, { camera });
    return { call, failed: false, text: `returns ${photos.length} photos` };
  } catch (err) {
    return { call, failed: true, text: `throws ${err instanceof Error ? `${err.name}: ${err.message}` : String(err)}` };
  }
}

type TestState =
  | { status: 'idle' }
  | { status: 'loading' }
  | {
      status: 'response';
      ok: boolean;
      httpStatus: number;
      statusText: string;
      elapsedMs: number;
      bodyKb: number;
      headers: [string, string][];
      imageCount?: number;
      feedError?: string;
      rawJson: string;
      mapped?: PerseverancePhoto[];
      problem?: string;
      notice?: string;
      hiddenCount?: number;
      appCall: AppCall;
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

type ImageSize = keyof PerseverancePhoto['imageUrls'];

const IMAGE_SIZES: ImageSize[] = ['full', 'large', 'medium', 'small'];

function groupBySol(photos: PerseverancePhoto[]): { sol: number; photos: PerseverancePhoto[] }[] {
  const groups = new Map<number, PerseverancePhoto[]>();
  for (const photo of photos) {
    const group = groups.get(photo.sol);
    if (group) group.push(photo);
    else groups.set(photo.sol, [photo]);
  }
  return [...groups].map(([sol, groupPhotos]) => ({ sol, photos: groupPhotos }));
}

function PhotoFigure({ photo, size }: { photo: PerseverancePhoto; size: ImageSize }) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'failed'>('loading');
  const url = photo.imageUrls[size];

  return (
    <figure className="perseverance-test-figure">
      {status === 'failed' ? (
        <div className="perseverance-test-image-failed">Image failed to load: {url}</div>
      ) : (
        <img
          key={url}
          className={`perseverance-test-image ${status === 'loaded' ? '' : 'perseverance-test-image-loading'}`}
          src={url}
          alt={`${photo.camera}, sol ${photo.sol}`}
          loading="lazy"
          onLoad={() => setStatus('loaded')}
          onError={() => setStatus('failed')}
        />
      )}
      <figcaption className="perseverance-test-caption">
        Sol {photo.sol} · {photo.camera}
      </figcaption>
      <p className="perseverance-test-description">{photo.caption.trim()}</p>
    </figure>
  );
}

function parseSol(input: string): number | undefined {
  return input.trim() === '' ? undefined : Number(input);
}

function parseCount(input: string): number {
  return Math.min(Math.max(Number(input) || 10, 1), 100);
}

export function PerseveranceTest() {
  const [solInput, setSolInput] = useState('');
  const [countInput, setCountInput] = useState('10');
  const [cameraInput, setCameraInput] = useState('');
  const [sizeInput, setSizeInput] = useState<ImageSize>('full');
  const [state, setState] = useState<TestState>({ status: 'idle' });

  const selectedCamera = (cameraInput || undefined) as PerseveranceCamera | undefined;
  const cameraInfo = selectedCamera ? PERSEVERANCE_CAMERA_INFO[selectedCamera] : undefined;

  const previewSol = parseSol(solInput);
  const previewUrl = buildPhotosUrl({
    sol: Number.isInteger(previewSol) ? previewSol : undefined,
    count: parseCount(countInput),
    camera: selectedCamera,
  });

  async function runTest() {
    const sol = parseSol(solInput);
    if (sol !== undefined && (!Number.isInteger(sol) || sol < 0)) {
      setState({
        status: 'error',
        message: `Invalid sol: "${solInput}"`,
        reason: 'The sol must be a whole number of 0 or more, or empty for the latest photos.',
        elapsedMs: 0,
      });
      return;
    }
    const camera = selectedCamera;
    const url = buildPhotosUrl({ sol, count: parseCount(countInput), camera });

    setState({ status: 'loading' });
    const startedAt = performance.now();

    try {
      const res = await fetch(url);
      const text = await res.text();
      const elapsedMs = Math.round(performance.now() - startedAt);
      const bodyKb = Math.round(text.length / 1024);
      const headers = [...res.headers.entries()];

      let rawJson = text;
      let imageCount: number | undefined;
      let feedError: string | undefined;
      let mapped: PerseverancePhoto[] | undefined;
      let problem: string | undefined;
      let notice: string | undefined;
      let hiddenCount: number | undefined;

      try {
        const parsed = JSON.parse(text);
        rawJson = JSON.stringify(parsed, null, 2);
        feedError = parsed.error_message;
        if (Array.isArray(parsed.images)) {
          const photos: PerseverancePhoto[] = toPhotos(parsed.images);
          hiddenCount = parsed.images.length - photos.length;
          const matching = sol === undefined ? photos : photos.filter((photo) => photo.sol === sol);
          mapped = matching;
          imageCount = matching.length;

          if (matching.length === 0) {
            const request = sol === undefined ? 'this request' : `sol ${sol}${camera ? ` from camera ${camera}` : ''}`;
            notice = `No photos found for ${request}.`;
          }
          if (matching.length < photos.length) {
            const returnedSols = [...new Set(photos.map((photo) => photo.sol))].join(', ');
            notice = `${notice ? `${notice} ` : ''}The feed also returned ${photos.length - matching.length} photos from other sols (${returnedSols}). They are hidden here and only appear in the raw response below.`;
          }
        } else {
          problem = 'The response has no "images" array.';
        }
      } catch (err) {
        problem = `The response could not be read as expected: ${err instanceof Error ? err.message : String(err)}`;
      }

      const appCall = await callModule(sol, parseCount(countInput), camera);

      setState({
        status: 'response',
        ok: res.ok,
        httpStatus: res.status,
        statusText: res.statusText,
        elapsedMs,
        bodyKb,
        headers,
        imageCount,
        feedError,
        rawJson,
        mapped,
        problem,
        notice,
        hiddenCount,
        appCall,
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
    <section className="perseverance-test">
      <h1>Perseverance photos test (temporary)</h1>
      <p className="perseverance-test-url">GET {previewUrl.toString()}</p>
      {cameraInput && (
        <p className="perseverance-test-camera-info">
          <strong>{cameraInput}</strong>{' '}
          {cameraInfo
            ? `(${cameraInfo.category === 'top' ? 'top choice' : 'other camera'}): ${cameraInfo.description}`
            : '(unavailable): not offered in the app. Its photos are dropped and the module rejects it as a camera.'}
        </p>
      )}

      <div className="perseverance-test-form">
        <label>
          Sol (empty = latest)
          <input value={solInput} onChange={(e) => setSolInput(e.target.value)} placeholder="e.g. 2000" />
        </label>
        <label>
          Count (latest only, 1 to 100)
          <input value={countInput} onChange={(e) => setCountInput(e.target.value)} />
        </label>
        <label>
          Camera
          <select value={cameraInput} onChange={(e) => setCameraInput(e.target.value)}>
            <option value="">Any camera</option>
            <optgroup label="Top choices">
              {TOP_CAMERAS.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </optgroup>
            <optgroup label="Other cameras">
              {NORMAL_CAMERAS.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </optgroup>
            <optgroup label="Unavailable (rejected by the app)">
              {UNAVAILABLE_CAMERAS.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <label>
          Image size
          <select value={sizeInput} onChange={(e) => setSizeInput(e.target.value as ImageSize)}>
            {IMAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <button onClick={runTest} disabled={state.status === 'loading'}>
          {state.status === 'loading' ? 'Requesting...' : 'Request photos'}
        </button>
      </div>

      {state.status === 'error' && (
        <div className="perseverance-test-box perseverance-test-fail">
          <h2>Request failed ({state.elapsedMs} ms)</h2>
          <p>
            <strong>Message:</strong> {state.message}
          </p>
          <p>
            <strong>Reason:</strong> {state.reason}
          </p>
        </div>
      )}

      {state.status === 'response' && (
        <div
          className={`perseverance-test-box ${state.ok && !state.problem && !state.notice && !state.appCall.failed ? 'perseverance-test-pass' : 'perseverance-test-fail'}`}
        >
          <h2>
            HTTP {state.httpStatus} {state.statusText} ({state.elapsedMs} ms, {state.bodyKb} KB
            {state.imageCount !== undefined ? `, ${state.imageCount} photos` : ''})
          </h2>
          <p>
            <strong>What the app gets:</strong> <code>{state.appCall.call}</code> {state.appCall.text}
          </p>
          {state.problem && (
            <p>
              <strong>Problem:</strong> {state.problem}
            </p>
          )}
          {state.notice && (
            <p>
              <strong>Notice:</strong> {state.notice}
            </p>
          )}
          {state.hiddenCount !== undefined && state.hiddenCount > 0 && (
            <p>
              <strong>Hidden:</strong> {state.hiddenCount} photos from unavailable cameras ({UNAVAILABLE_CAMERAS.join(', ')}) are
              not shown. They only appear in the raw response below.
            </p>
          )}
          {state.feedError && (
            <p>
              <strong>Feed message:</strong> {state.feedError}
            </p>
          )}

          {state.mapped && state.mapped.length > 0 && (
            <>
              <h3>
                Images ({sizeInput}, {state.mapped.length} photos)
              </h3>
              {groupBySol(state.mapped).map((group) => (
                <div key={group.sol} className="perseverance-test-sol-group">
                  <h4 className="perseverance-test-sol-heading">
                    Sol {group.sol} · {group.photos.length} photos
                  </h4>
                  {group.photos.map((photo) => (
                    <PhotoFigure key={`${photo.id}-${sizeInput}`} photo={photo} size={sizeInput} />
                  ))}
                </div>
              ))}
            </>
          )}

          <h3>Response headers visible to the browser</h3>
          <pre>
            {state.headers.length > 0
              ? state.headers.map(([name, value]) => `${name}: ${value}`).join('\n')
              : '(none exposed)'}
          </pre>

          {state.mapped && (
            <>
              <h3>Mapped photos (the response run through toPhotos)</h3>
              <pre>{JSON.stringify(state.mapped, null, 2)}</pre>
            </>
          )}

          <h3>Full raw response (JSON)</h3>
          <pre>{state.rawJson}</pre>
        </div>
      )}
    </section>
  );
}
