/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // sharp is a server-only native dep; keep it out of the bundle (use the runtime require)
  serverExternalPackages: ["sharp"],
  // Make sure the platform-specific sharp binaries (@img/sharp-linux-x64 on Vercel)
  // get copied into the serverless function output. Without this, "Collecting build
  // traces" cannot resolve the native .node files and the deploy fails.
  outputFileTracingIncludes: {
    "/api/convert": [
      "./node_modules/@img/**/*",
      "./node_modules/sharp/**/*",
    ],
  },
};

export default nextConfig;
