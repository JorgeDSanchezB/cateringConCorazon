import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone solo para el despliegue self-hosted/sandbox (start.sh usa
  // .next/standalone/server.js). En Vercel se usa su pipeline nativo.
  output: process.env.VERCEL ? undefined : "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
