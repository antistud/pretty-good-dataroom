import { cookies } from "next/headers";
import { setThemeAction } from "@/app/theme-action";

export async function ThemeSwitch() {
  const current = (await cookies()).get("pgd_theme")?.value ?? "auto";
  return (
    <form action={setThemeAction} className="theme-switch" aria-label="Colour theme">
      {[["auto", "Auto"], ["light", "Light"], ["dark", "Dark"]].map(([value, label]) => (
        <button key={value} name="theme" value={value} className={current === value ? "on" : ""}>{label}</button>
      ))}
    </form>
  );
}
