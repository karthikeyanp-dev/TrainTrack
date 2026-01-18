/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  output: 'export', // Enable static export
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Remove serverExternalPackages - not needed for static export
  images: {
    unoptimized: true, // Required for static export
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
    ],
  },
  // Note: Headers configured in firebase.json for Firebase Hosting
};

export default nextConfig;
