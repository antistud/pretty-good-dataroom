import { redirect } from "next/navigation";

/** Moments worth marking. The page shows a short burst of petals for these. */
export type Cheer = "wired" | "committed" | "published" | "closed" | "ready";

/** Redirect back to a page with a one-line message. kind is "ok" or "error". */
export function flash(path: string, message: string, kind: "ok" | "error" = "ok", cheer?: Cheer): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}${kind}=${encodeURIComponent(message)}${cheer ? `&cheer=${cheer}` : ""}`);
}
