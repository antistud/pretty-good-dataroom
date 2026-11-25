"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Guide = { id: string; name: string; steps: React.ReactNode[]; notes: string[]; help?: { label: string; url: string } };

const ADDRESS = <strong>connector address</strong>;
const GUIDES: Guide[] = [
  {
    id: "claude",
    name: "Claude",
    steps: [
      <>Open <strong>Settings</strong> (some versions call it <strong>Customize</strong>) and choose <strong>Connectors</strong>.</>,
      <>Press <strong>Add custom connector</strong>.</>,
      <>Name it &ldquo;Data room&rdquo; and paste your {ADDRESS} as the URL. Leave the OAuth fields empty.</>,
      <>Press <strong>Add</strong>.</>,
      <>In a new chat, open the <strong>+</strong> or tools menu and make sure &ldquo;Data room&rdquo; is switched on. Then attach your documents.</>,
    ],
    notes: [
      "Safer: use the short address instead, and under Request headers add a header named Authorization with the value Bearer followed by a space and your key.",
      "Free accounts can add one custom connector. On Team and Enterprise plans an owner adds it for everyone under Organization settings.",
      "Claude asks before it sends anything. Allow both tools: suggesting details, and saying how to file documents.",
    ],
    help: { label: "Claude's own instructions", url: "https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp" },
  },
  {
    id: "chatgpt",
    name: "ChatGPT",
    steps: [
      <>Open <strong>Settings</strong> and choose <strong>Apps</strong> (older versions: <strong>Connectors</strong>).</>,
      <>Open <strong>Advanced settings</strong> and turn on <strong>Developer mode</strong>. ChatGPT warns that custom connectors are unverified; that is expected.</>,
      <>Go back and press <strong>Create</strong>.</>,
      <>Name it &ldquo;Data room&rdquo;, paste your {ADDRESS} as the MCP server URL, set authentication to <strong>No authentication</strong>, tick that you trust it, and press <strong>Create</strong>.</>,
      <>In a new chat, press <strong>+</strong>, choose <strong>Developer mode</strong>, and switch &ldquo;Data room&rdquo; on. Then attach your documents.</>,
    ],
    notes: [
      "Needs a paid plan. Which plans may send information through a custom connector has changed more than once; if ChatGPT says it can only read, use “My assistant does not support connectors” below.",
      "In a company workspace, an admin has to allow developer mode first.",
    ],
    help: { label: "ChatGPT's own instructions", url: "https://developers.openai.com/api/docs/guides/developer-mode" },
  },
  {
    id: "grok",
    name: "Grok",
    steps: [
      <>Go to <strong>grok.com/connectors</strong>.</>,
      <>Press <strong>New Connector</strong> and choose <strong>Custom</strong>.</>,
      <>Paste your {ADDRESS} as the server URL and save. Grok finds the tools on its own.</>,
      <>In a new chat, attach your documents and ask it to fill in your data room.</>,
    ],
    notes: ["Needs a paid Grok plan.", "On a business account an admin adds it: Add Connector, then Other."],
    help: { label: "Grok's own instructions", url: "https://docs.x.ai/grok/connectors" },
  },
  {
    id: "other",
    name: "Another assistant",
    steps: [
      <>In its settings, look for <strong>Connectors</strong>, <strong>Apps</strong>, <strong>Integrations</strong> or <strong>MCP servers</strong>.</>,
      <>Choose to add a <strong>custom</strong> or <strong>remote</strong> one.</>,
      <>Paste your {ADDRESS}. If it asks for a type, choose <strong>HTTP</strong> (also called Streamable HTTP).</>,
      <>If it asks about sign-in, choose <strong>none</strong>. If it offers an API key or bearer token instead, use the short address and paste your key there.</>,
    ],
    notes: ["Cannot find it? Search the assistant's help for “remote MCP server” or “custom connector”. If it has no such thing, use “My assistant does not support connectors” below."],
  },
];

/** Step-by-step help for adding the connector, one assistant at a time, in a panel that sits in the page margin. */
export function AssistantHelp() {
  const [open, setOpen] = useState<string | null>(null);
  const [wide, setWide] = useState(false);
  const guide = GUIDES.find((g) => g.id === open);
  // On a wide screen the panel floats in the right-hand margin (attached to the page itself, so nothing clips it); otherwise it opens in place.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1240px)");
    const sync = () => setWide(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const panel = guide && (
        <aside id="assist-panel" className="popout" role="complementary" aria-label={`Adding the connector to ${guide.name}`} key={guide.id}>
          <div className="spread" style={{ alignItems: "flex-start" }}>
            <h3 style={{ margin: 0 }}>{guide.id === "other" ? "In another assistant" : `In ${guide.name}`}</h3>
            <button type="button" className="linkbtn small" onClick={() => setOpen(null)} aria-label="Close these instructions">Close</button>
          </div>
          <ol>{guide.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
          {guide.notes.map((n, i) => <p key={i} className="muted small">{n}</p>)}
          <p className="muted small">
            Menus change often.{" "}
            {guide.help && <>If yours looks different, see <a href={guide.help.url} target="_blank" rel="noreferrer noopener">{guide.help.label}</a>.</>}
          </p>
        </aside>
  );

  return (
    <div className="assist">
      <p className="muted small" style={{ margin: "0 0 8px" }}>Show me where to put it in:</p>
      <div className="row" style={{ gap: 8 }}>
        {GUIDES.map((g) => (
          <button key={g.id} type="button" className={`btn small${open === g.id ? " on" : ""}`} aria-expanded={open === g.id} aria-controls="assist-panel" onClick={() => setOpen(open === g.id ? null : g.id)}>
            {g.name}
          </button>
        ))}
      </div>
      {panel && (wide ? createPortal(panel, document.body) : panel)}
    </div>
  );
}
