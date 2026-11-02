import type { NextConfig } from "next";

const apiPort = process.env.COPA_STAGING_TEST === 'si' ? Number(process.env.COPA_STAGING_API_PORT || 4000) : 4000;
const apiHost = process.env.COPA_STAGING_TEST === 'si' ? '127.0.0.1' : 'localhost';
if (!Number.isInteger(apiPort) || apiPort < 1024 || apiPort > 65535) throw new Error('Puerto de Copa inválido');
const nextConfig: NextConfig = {
  basePath: '/copa',
  ...(process.env.COPA_STAGING_TEST === 'si' ? { distDir: '.next/staging-integration' } : process.env.COPA_PRODUCTION_CANDIDATE === 'si' ? { distDir: '.next/production-candidate' } : {}),
  images: {
    unoptimized: true,
  },
  async rewrites() {
    return { beforeFiles: [
      {
        source: '/copa/data/:path*',
        destination: 'http://localhost:4000/api/data/:path*',
        basePath: false,
      },
      {
        source: '/copa/copa-api/:path*',
        destination: `http://${apiHost}:${apiPort}/:path*`,
        basePath: false,
      },
      {
        source: '/copa-api/:path*',
        destination: `http://${apiHost}:${apiPort}/:path*`,
        basePath: false,
      },
    ] };
  },
};

export default nextConfig;
