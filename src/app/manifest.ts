import type { MetadataRoute } from "next";

// Add to Home Screen opens a full-screen app (spec §8). No service worker:
// there's no offline mode.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Life Goals",
    short_name: "Life Goals",
    description: "Personal life goals tracker",
    // The app opens on today's plan.
    start_url: "/today",
    display: "standalone",
    background_color: "#f7f6fb",
    theme_color: "#f7f6fb",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
