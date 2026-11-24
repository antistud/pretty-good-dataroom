import { redirect } from "next/navigation";

/** Redirect back to a page with a one-line message. kind is "ok" or "error". */
export function flash(path: string, message: string, kind: "ok" | "error" = "ok"): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}${kind}=${encodeURIComponent(message)}`);
}
