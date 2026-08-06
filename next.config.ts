import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev only: allow phones on the home LAN to load /_next dev resources
  // (chunks, HMR) when the dev server is opened via the Mac's LAN IP.
  // Without this Next serves the HTML but blocks the JS — app looks empty.
  //
  // dev.nuggets.jomaar.de is the same situation one step removed: nginx proxies
  // to localhost:3001 but forwards `Host: dev.nuggets.jomaar.de`, so Next sees a
  // cross-origin request for its dev resources and blocks them. The page then
  // renders, every chunk 200s, and yet React never hydrates — no fetches, no
  // data, and the login form does nothing.
  allowedDevOrigins: ["192.168.188.*", "dev.nuggets.jomaar.de"],
};

export default nextConfig;
