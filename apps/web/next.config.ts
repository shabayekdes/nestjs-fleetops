import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // /dev/* pages are development tools. The pages also guard themselves, but
  // with a root loading.tsx the response is already streaming (status 200)
  // when notFound() runs, so production gets a real 404 from a rewrite.
  async rewrites() {
    if (process.env.NODE_ENV !== 'production') return { beforeFiles: [] };
    return {
      beforeFiles: [
        { source: '/dev/:path*', destination: '/not-available-in-production' },
      ],
    };
  },
};

export default nextConfig;
