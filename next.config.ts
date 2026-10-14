import type { NextConfig } from "next";
import { BASE_PATH } from "./lib/site";

const nextConfig: NextConfig = {
  // Static HTML for GitHub Pages. vinext's prerender skips "/" when basePath is set,
  // so only assets carry the prefix; the deploy workflow moves them to the site root.
  output: "export",
  assetPrefix: BASE_PATH || undefined,
};

export default nextConfig;
