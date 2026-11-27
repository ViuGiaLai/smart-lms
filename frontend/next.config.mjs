/** @type {import('next').NextConfig} */
const nextConfig = (phase) => ({
  // A local dev server and a production build must never write the same files.
  distDir: phase === 'phase-development-server' ? '.next-dev' : '.next',
  async redirects() {
    return [
      { source: '/login', destination: '/?auth=login', permanent: false },
      { source: '/register', destination: '/?auth=register', permanent: false },
    ]
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '8000',
      },
      {
        protocol: 'https',
        hostname: 'smart-lms.storage.googleapis.com',
      },
      {
        // Giảng viên có thể dán URL thumbnail từ bất kỳ host nào; cho phép https
        // để <Image> không lỗi "hostname is not configured" khi render.
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: '/api/backend/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/:path*`,
      },
    ]
  },
})

export default nextConfig
