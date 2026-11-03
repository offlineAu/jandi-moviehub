import type { NextConfig } from 'next';

const apiInternalUrl = (process.env.API_INTERNAL_URL ?? 'http://localhost:4000').replace(/\/$/, '');
const publicApiOrigin = new URL(process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:4000').origin;
const wsApiOrigin = publicApiOrigin.replace(/^http/, 'ws');
const isDev = process.env.NODE_ENV !== 'production';

const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  // Next.js injects inline bootstrap scripts; dev mode additionally needs eval for HMR/React refresh.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: https://image.tmdb.org ${publicApiOrigin}`,
  "font-src 'self' data:",
  `media-src 'self' blob: https://bcdnxw.hakunaymatata.com ${publicApiOrigin}`,
  `connect-src 'self' ws: wss: ${publicApiOrigin} ${wsApiOrigin}`,
  'frame-src https://www.youtube-nocookie.com https://video.blender.org https://archive.org https://vidsrc.sh https://kisskh.megaplay.su',
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  {
    key: 'Permissions-Policy',
    value:
      'camera=(), microphone=(self), geolocation=(), payment=(), usb=(), fullscreen=(self), picture-in-picture=(self), autoplay=(self)',
  },
];

const nextConfig: NextConfig = {
  output: 'standalone',
  // Lets the E2E stack build into its own directory without disturbing `next dev`.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@jandi/shared'],
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'image.tmdb.org', pathname: '/t/p/**' }],
  },
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${apiInternalUrl}/api/v1/:path*` }];
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
