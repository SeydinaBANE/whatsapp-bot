import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone', // active le bundle standalone pour Docker
}

export default nextConfig
