import type { NextConfig } from "next";
import fs from "fs";
import path from "path";

// Helper to get variable from process.env or locate and parse local .env files
const getEnvValue = (key: string): string => {
  if (process.env[key]) return process.env[key] as string;
  const paths = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "../.env"),
    path.resolve(process.cwd(), "../../.env"),
  ];
  for (const envPath of paths) {
    try {
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, "utf-8");
        const lines = content.split(/\r?\n/);
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const index = trimmed.indexOf("=");
          if (index > 0) {
            const k = trimmed.slice(0, index).trim();
            if (k === key) {
              let val = trimmed.slice(index + 1).trim();
              if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                val = val.slice(1, -1);
              }
              return val;
            }
          }
        }
      }
    } catch {
      // Ignore read/exists errors
    }
  }
  return "";
};

const nextConfig: NextConfig = {
  basePath: '/copa',
  env: {
    ARA_WEB_API_PUBLIC_BASE_URL: getEnvValue("ARA_WEB_API_PUBLIC_BASE_URL"),
    ARA_WIDGET_TENANT_ROUTES_JSON: getEnvValue("ARA_WIDGET_TENANT_ROUTES_JSON"),
    ARA_WIDGET_JWT_ENABLED: getEnvValue("ARA_WIDGET_JWT_ENABLED"),
    NEXT_PUBLIC_API_URL: getEnvValue("NEXT_PUBLIC_API_URL"),
  },
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
