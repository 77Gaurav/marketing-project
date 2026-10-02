/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },
  // Emits .next/standalone with a server.js entrypoint and only the traced node_modules the server
  // actually imports — 24 MB here. The Docker image copies that rather than a full install, which
  // takes the built image to 245 MB. It changes build output only; `next dev` and `next build`
  // locally behave exactly as before.
  output: 'standalone',
};

export default nextConfig;
