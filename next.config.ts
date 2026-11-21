import type { NextConfig } from "next";
const config: NextConfig = {
  agentRules: false,
  experimental: { proxyClientMaxBodySize: "4.5mb", serverActions: { bodySizeLimit: "4.5mb" } },
  turbopack: { root: process.cwd() },
  outputFileTracingRoot: process.cwd(),
};
export default config;
