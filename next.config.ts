import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev only: allow phones on the home LAN to load /_next dev resources
  // (chunks, HMR) when the dev server is opened via the Mac's LAN IP.
  // Without this Next serves the HTML but blocks the JS — app looks empty.
  allowedDevOrigins: ["192.168.188.*"],
};

export default nextConfig;
