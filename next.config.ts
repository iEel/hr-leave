import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Mark server-only packages to prevent bundling issues
  serverExternalPackages: ['mssql', 'bcryptjs'],

  // Experimental settings for better compatibility
  experimental: {
    // Enable server actions
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
};

export default nextConfig;
