import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

const JPL_HOST = 'https://ssd.jpl.nasa.gov';
const FIREBASE_SITE = 'https://starboard-b7bc3.web.app';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const horizonsProxy = env.HORIZONS_PROXY || 'direct';

  if (horizonsProxy !== 'direct' && horizonsProxy !== 'firebase') {
    throw new Error(`HORIZONS_PROXY must be 'direct' or 'firebase', got '${horizonsProxy}'`);
  }

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api/horizons':
          horizonsProxy === 'firebase'
            ? { target: FIREBASE_SITE, changeOrigin: true }
            : {
                target: JPL_HOST,
                changeOrigin: true,
                rewrite: (path) => path.replace('/api/horizons', '/api/horizons.api'),
              },
      },
    },
  };
});
