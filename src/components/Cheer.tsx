"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const LINES: Record<string, string> = {
  wired: "Money in the bank. Well done.",
  committed: "A yes. Take a moment, then send the paperwork.",
  published: "Update published. Your investors will thank you for it.",
  closed: "Round closed. You did it.",
  ready: "Your room is ready for visitors.",
};
const COLOURS = ["var(--accent)", "var(--brand)", "#e8b04b", "#d98aa0", "var(--brand)"];

/** A brief scatter of paper confetti when something worth celebrating has just happened. */
export function Cheer() {
  const params = useSearchParams();
  const path = usePathname();
  const kind = params.get("cheer");
  const [show, setShow] = useState<string | null>(null);

  useEffect(() => {
    if (!kind || !LINES[kind]) return;
    setShow(kind);
    // Drop the marker from the address so a refresh does not replay it.
    const next = new URLSearchParams(params.toString());
    next.delete("cheer");
    window.history.replaceState(null, "", `${path}${next.size ? `?${next}` : ""}`);
    const t = setTimeout(() => setShow(null), 4200);
    return () => clearTimeout(t);
  }, [kind, params, path]);

  if (!show) return null;
  return (
    <div className="cheer" aria-live="polite">
      <div className="cheer-bits" aria-hidden="true">
        {Array.from({ length: 28 }, (_, i) => (
          <span
            key={i}
            style={{
              left: `${(i * 37 + 11) % 100}%`,
              background: COLOURS[i % COLOURS.length],
              animationDelay: `${(i % 9) * 0.12}s`,
              animationDuration: `${2.6 + (i % 5) * 0.35}s`,
              transform: `rotate(${i * 47}deg)`,
            }}
          />
        ))}
      </div>
      <div className="cheer-toast">{LINES[show]}</div>
    </div>
  );
}
