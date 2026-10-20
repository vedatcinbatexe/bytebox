import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',

  // Only /embed/* may be shown inside other websites; every other page refuses to be framed (clickjacking)
  async headers() {
    return [
      {
        source: '/((?!embed/).*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
        ],
      },
      {
        source: '/embed/:path*',
        headers: [{ key: 'Content-Security-Policy', value: 'frame-ancestors *' }],
      },
    ];
  },
};

export default nextConfig;
