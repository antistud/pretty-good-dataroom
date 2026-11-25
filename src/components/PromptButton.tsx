"use client";

import { useState } from "react";

/**
 * A small icon-only button that copies a ready-made prompt. The founder pastes
 * it into whichever AI assistant they use, and it interviews them towards a
 * good answer for this field.
 */
export function PromptButton({ prompt, about }: { prompt: string; about: string }) {
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");
  const label =
    state === "done" ? "Copied. Paste it into your AI assistant." : state === "failed" ? "Could not copy. Your browser blocked it." : `Copy a prompt that has an AI assistant walk you through ${about}`;
  return (
    <>
      <button
        type="button"
        className={`icon-btn ${state === "done" ? "done" : ""}`}
        title={label}
        aria-label={label}
        onClick={async (e) => {
          e.preventDefault();
          try {
            await navigator.clipboard.writeText(prompt);
            setState("done");
          } catch {
            setState("failed");
          }
          setTimeout(() => setState("idle"), 2200);
        }}
      >
        {state === "done" ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M10 2.5l1.9 5.1a3 3 0 0 0 1.8 1.8L18.8 11.3l-5.1 1.9a3 3 0 0 0-1.8 1.8L10 20.1l-1.9-5.1a3 3 0 0 0-1.8-1.8L1.2 11.3l5.1-1.9a3 3 0 0 0 1.8-1.8z" />
            <path d="M19 2l.8 2.2L22 5l-2.2.8L19 8l-.8-2.2L16 5l2.2-.8z" />
          </svg>
        )}
      </button>
      <span className="sr-only" aria-live="polite">{state === "idle" ? "" : label}</span>
    </>
  );
}
