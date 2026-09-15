import type { NextConfig } from "next";

const config: NextConfig = {
  // Everything is local-first, so the whole site is static files (BRIEF §3, §12; D-030).
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  transpilePackages: ["@bld/cube-engine", "@bld/storage"],
  reactStrictMode: true,
};

export default config;
