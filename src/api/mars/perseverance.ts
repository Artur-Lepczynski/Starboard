import { buildUrl, fetchJson } from '../core/client';

const FEED_URL = 'https://mars.nasa.gov/rss/api/';

// The feed silently returns at most 100 photos per request, however many are asked for.
export const MAX_PHOTOS_PER_REQUEST = 100;

export type CameraCategory = 'top' | 'normal';

export interface CameraInfo {
  category: CameraCategory;
  description: string;
}

export const PERSEVERANCE_CAMERA_INFO = {
  NAVCAM_LEFT: {
    category: 'top',
    description: 'Left navigation camera on the rover mast. Used for driving, it shows the terrain around and ahead of the rover.',
  },
  NAVCAM_RIGHT: {
    category: 'top',
    description: 'Right navigation camera on the rover mast. Used for driving, it shows the terrain around and ahead of the rover.',
  },
  SHERLOC_WATSON: {
    category: 'top',
    description: 'Close-up camera on the turret at the end of the robotic arm. Shows fine detail of rock and soil surfaces.',
  },
  SUPERCAM_RMI: {
    category: 'top',
    description: 'SuperCam Remote Micro-Imager at the top of the mast. A telescopic camera that takes close-ups of distant rocks and other targets.',
  },
  FRONT_HAZCAM_LEFT_A: {
    category: 'top',
    description: 'Front left hazard avoidance camera. Looks at the ground in front of the rover to spot obstacles.',
  },
  FRONT_HAZCAM_RIGHT_A: {
    category: 'top',
    description: 'Front right hazard avoidance camera. Looks at the ground in front of the rover to spot obstacles.',
  },
  REAR_HAZCAM_LEFT: {
    category: 'top',
    description: 'Rear left hazard avoidance camera. Looks at the ground behind the rover.',
  },
  REAR_HAZCAM_RIGHT: {
    category: 'top',
    description: 'Rear right hazard avoidance camera. Looks at the ground behind the rover.',
  },
  MCZ_LEFT: {
    category: 'normal',
    description: 'Left camera of Mastcam-Z, a pair of zoomable color cameras high on the rover mast. Takes landscape and target images, and forms a stereo pair with the right camera.',
  },
  MCZ_RIGHT: {
    category: 'normal',
    description: 'Right camera of Mastcam-Z, a pair of zoomable color cameras high on the rover mast. Takes landscape and target images, and forms a stereo pair with the left camera.',
  },
  SHERLOC_ACI: {
    category: 'normal',
    description: 'Autofocus and Context Imager of the SHERLOC instrument, on the turret at the end of the robotic arm. Takes close-ups of the rock surface being analyzed.',
  },
  PIXL_MCC: {
    category: 'normal',
    description: 'PIXL Micro Context Camera, on the turret at the end of the robotic arm. Takes close-ups of the rock area that the PIXL instrument analyzes.',
  },
  SKYCAM: {
    category: 'normal',
    description: 'Upward-facing camera on the top deck of the rover. Looks at the sky.',
  },
  CACHECAM: {
    category: 'normal',
    description: 'Sample Caching System camera inside the rover underbelly. Looks down into a sample tube to photograph the collected material before the tube is sealed.',
  },
} satisfies Record<string, CameraInfo>;

export type PerseveranceCamera = keyof typeof PERSEVERANCE_CAMERA_INFO;

export const PERSEVERANCE_CAMERAS = Object.keys(PERSEVERANCE_CAMERA_INFO) as PerseveranceCamera[];

export const TOP_CAMERAS = PERSEVERANCE_CAMERAS.filter((name) => PERSEVERANCE_CAMERA_INFO[name].category === 'top');

export const NORMAL_CAMERAS = PERSEVERANCE_CAMERAS.filter(
  (name) => PERSEVERANCE_CAMERA_INFO[name].category === 'normal',
);

// Entry, descent and landing cameras and the lander vision camera. They are not offered and their photos are dropped.
export const UNAVAILABLE_CAMERAS: readonly string[] = [
  'EDL_RDCAM',
  'EDL_RUCAM',
  'EDL_PUCAM1',
  'EDL_PUCAM2',
  'EDL_DDCAM',
  'LCAM',
];

interface RawPhoto {
  imageid: string;
  sol: number;
  title: string;
  caption: string;
  credit: string;
  date_taken_utc: string;
  date_received: string;
  link: string;
  camera: { instrument: string };
  image_files: {
    small: string;
    medium: string;
    large: string;
    full_res: string;
  };
}

export interface RawPhotosResponse {
  images: RawPhoto[];
  total_results?: number;
  total_images?: number;
  error_message?: string;
}

export interface PerseverancePhoto {
  id: string;
  sol: number;
  dateTaken: string;
  dateReceived: string;
  camera: string;
  title: string;
  caption: string;
  credit: string;
  pageUrl: string;
  imageUrls: {
    small: string;
    medium: string;
    large: string;
    full: string;
  };
}

export interface PhotosQuery {
  sol?: number;
  count?: number;
  page?: number;
  camera?: PerseveranceCamera;
}

export function buildPhotosUrl({ sol, count = 25, page = 0, camera }: PhotosQuery = {}): URL {
  return buildUrl(FEED_URL, {
    feed: 'raw_images',
    category: 'mars2020',
    feedtype: 'json',
    order: 'sol desc',
    num: count,
    page,
    sol,
    search: camera,
  });
}

function toPhoto(raw: RawPhoto): PerseverancePhoto {
  return {
    id: raw.imageid,
    sol: raw.sol,
    dateTaken: raw.date_taken_utc,
    dateReceived: raw.date_received,
    camera: raw.camera.instrument,
    title: raw.title,
    caption: raw.caption,
    credit: raw.credit,
    pageUrl: raw.link,
    imageUrls: {
      small: raw.image_files.small,
      medium: raw.image_files.medium,
      large: raw.image_files.large,
      full: raw.image_files.full_res,
    },
  };
}

// Photos from unavailable cameras are dropped, so a page can hold fewer photos than requested.
export function toPhotos(raw: RawPhoto[]): PerseverancePhoto[] {
  return raw.filter((photo) => !UNAVAILABLE_CAMERAS.includes(photo.camera.instrument)).map(toPhoto);
}

async function fetchPhotos(query: PhotosQuery): Promise<PerseverancePhoto[]> {
  const { images } = await fetchJson<RawPhotosResponse>(buildPhotosUrl(query));
  if (!Array.isArray(images)) throw new Error('Perseverance feed returned an unexpected response');
  return toPhotos(images);
}

// The feed matches the camera name exactly and returns nothing for a partial or unknown name, so it is checked first.
function assertCamera(camera: string | undefined): void {
  if (camera === undefined) return;
  if (UNAVAILABLE_CAMERAS.includes(camera)) throw new Error(`Camera not available: ${camera}`);
  if (!(PERSEVERANCE_CAMERAS as readonly string[]).includes(camera)) throw new Error(`Unknown camera: ${camera}`);
}

export interface LatestPhotosOptions {
  count?: number;
  page?: number;
  camera?: PerseveranceCamera;
}

export async function getLatestPhotos({ count = 25, page = 0, camera }: LatestPhotosOptions = {}): Promise<
  PerseverancePhoto[]
> {
  if (!Number.isInteger(count) || count < 1 || count > MAX_PHOTOS_PER_REQUEST) {
    throw new Error(`Invalid count: ${count}. It must be a whole number from 1 to ${MAX_PHOTOS_PER_REQUEST}`);
  }
  if (!Number.isInteger(page) || page < 0) throw new Error(`Invalid page: ${page}`);
  assertCamera(camera);
  return fetchPhotos({ count, page, camera });
}

// The feed ignores count and page when a sol is given and returns every photo of that sol.
// When the sol has no photos (an unknown sol, or none from the requested camera) the feed returns the latest photos instead of nothing.
// Those are filtered out here, so such a sol gives an empty array.
export async function getPhotosBySol(
  sol: number,
  { camera }: { camera?: PerseveranceCamera } = {},
): Promise<PerseverancePhoto[]> {
  if (!Number.isInteger(sol) || sol < 0) throw new Error(`Invalid sol: ${sol}`);
  assertCamera(camera);
  const photos = await fetchPhotos({ sol, camera });
  return photos.filter((photo) => photo.sol === sol).sort((a, b) => b.dateTaken.localeCompare(a.dateTaken));
}

export async function getLatestSol(): Promise<number> {
  const [latest] = await getLatestPhotos({ count: 1 });
  if (!latest) throw new Error('Perseverance feed returned no photos');
  return latest.sol;
}
