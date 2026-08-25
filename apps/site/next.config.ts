import type { NextConfig } from "next";

/**
 * The site is entirely static — no API routes, no middleware, no server
 * actions, no image optimisation. So it can be exported to plain files and
 * served from anywhere, including GitHub Pages, which needs no third-party
 * account at all.
 *
 * `STATIC_EXPORT=1` switches on the export. GitHub Pages serves a project site
 * from a subpath (`/<repo>`), so `BASE_PATH` prefixes routes and assets when
 * that is where it is going. Both are off by default, which keeps `next dev`
 * and any root-domain host working unchanged.
 */
const basePath = process.env.BASE_PATH ?? "";

const nextConfig: NextConfig = {
  ...(process.env.STATIC_EXPORT === "1"
    ? {
        output: "export",
        // Without this, /agents serves a 404 on a static host: the export
        // writes agents.html, and GitHub Pages will not rewrite the extension.
        trailingSlash: true,
      }
    : {}),
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),
};

export default nextConfig;
