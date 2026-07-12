import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/", destination: "/app.html", permanent: false },
      { source: "/lab", destination: "/lab.html", permanent: false },
    ];
  },
};

export default nextConfig;
