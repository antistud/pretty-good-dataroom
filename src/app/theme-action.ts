"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

export async function setThemeAction(form: FormData) {
  const theme = String(form.get("theme") ?? "");
  const jar = await cookies();
  if (theme === "light" || theme === "dark") jar.set("pgd_theme", theme, { path: "/", maxAge: 31536000, sameSite: "lax" });
  else jar.delete("pgd_theme");
  // Return to the page the reader was on; only same-site paths are followed.
  const ref = (await headers()).get("referer");
  let back = "/home";
  try {
    if (ref) back = new URL(ref).pathname;
  } catch {
    /* keep default */
  }
  redirect(back.startsWith("/") && !back.startsWith("//") ? back : "/home");
}
