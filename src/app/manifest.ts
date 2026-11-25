import type { MetadataRoute } from "next";

/** Lets the room be added to a phone's home screen. Deliberately generic: no company name is exposed to signed-out visitors. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Data room",
    short_name: "Data room",
    start_url: "/home",
    display: "standalone",
    background_color: "#fbfbf9",
    theme_color: "#fbfbf9",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
