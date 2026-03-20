import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  reactCompiler: true,
  turbopack: {
    root: path.resolve(__dirname),
  },
  generateBuildId: async () => "build-20260320-v2",
  webpack: (config) => {
    config.cache = false;
    return config;
  },
};

export default nextConfig;
