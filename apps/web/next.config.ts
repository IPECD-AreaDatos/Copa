import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: '/copa',
  images: {
    unoptimized: true,
  },
  async rewrites() {
    return [
      {
        source: '/copa/copa-api/:path*',
        destination: 'http://localhost:4000/:path*',
        basePath: false,
      },
      {
        source: '/copa-api/:path*',
        destination: 'http://localhost:4000/:path*',
        basePath: false,
      },
    ];
  },
};

export default nextConfig;
