/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // sharp is a server-only native dep; ensure it's not bundled into edge/client
  serverExternalPackages: ["sharp"],
};

export default nextConfig;
