/** @type {import('next').NextConfig} */
// Pulled in as a build-time constant so the rewrite destination is baked in.
// Falls back to a localhost dev backend so `next dev` still works.
const BACKEND = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000'

const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async rewrites() {
    // Same-origin proxy: browser requests go to `/api/*` on Vercel, Vercel forwards to Render.
    // Bypasses ad blockers / corporate DNS filters that block onrender.com directly.
    return [
      { source: '/api/:path*', destination: `${BACKEND}/:path*` },
    ]
  },
}

export default nextConfig
