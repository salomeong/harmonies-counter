/** @type {import('next').NextConfig} */
const nextConfig = {
  // The scoring core, the game declarations and the SVG art builders are plain ES modules with no
  // JSX — they moved into this app byte-identical, and `node --test` still runs them directly with
  // no toolchain. That is deliberate: they are the migration's safety net (see CLAUDE.md), so
  // nothing here should start transforming them.
  reactStrictMode: true,

  // There is a stray package-lock.json in the parent directory; without pinning the root,
  // Turbopack infers the workspace from it and warns on every build.
  turbopack: { root: import.meta.dirname }
};

export default nextConfig;
