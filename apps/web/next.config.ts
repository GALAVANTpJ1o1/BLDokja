import type { NextConfig } from "next";

const config: NextConfig = {
  // Everything is local-first, so the whole site is static files (BRIEF §3, §12; D-030).
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  transpilePackages: ["@bld/cube-engine", "@bld/storage"],
  reactStrictMode: true,
  agentRules: false,
  // Already Next's default, but explicit per the launch checklist: nobody should be able to read
  // unminified source or comments from a production deploy.
  productionBrowserSourceMaps: false,
};

export default config;
