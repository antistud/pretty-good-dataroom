import { getSetting, q } from "@/lib/db";
import { renderMarkdown } from "@/lib/md";

const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

/** A welcome in the founders' own words, signed by them. Falls back to a plain default until they write one. */
export function FounderNote({ kind, firstName }: { kind: "investor" | "supporter"; firstName: string }) {
  const company = getSetting("company_name");
  const founders = q<{ name: string }>("SELECT name FROM users WHERE role = 'founder' AND disabled = 0 ORDER BY id LIMIT 3");
  const custom = getSetting(kind === "investor" ? "welcome_investor" : "welcome_supporter").trim();
  const we = founders.length > 1;
  const fallback =
    kind === "investor"
      ? `Thank you for taking the time to look at ${company}.\n\nEverything ${we ? "we" : "I"} would want in your position is here, to read in whatever order suits you.\n\nIf you need something that is not here, or want to talk it through, tell ${we ? "us" : "me"} what and when you need it by. ${we ? "We" : "I"} will work to your timing.`
      : `Thank you for being in ${company}'s corner.\n\nOnce a month ${we ? "we" : "I"} will write to tell you how it is going: what worked, what did not, and where ${we ? "we" : "I"} could use a hand. There is nothing you need to review and nothing to sign.\n\nIf you ever know someone ${we ? "we" : "I"} should meet, that is the most valuable thing you can offer.`;
  const names = founders.map((f) => f.name.split(/\s+/)[0]);
  const signed = names.length <= 1 ? names[0] ?? company : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return (
    <div className="letter note">
      <p>Dear {firstName},</p>
      <div dangerouslySetInnerHTML={{ __html: renderMarkdown(custom || fallback) }} />
      <div className="sig">
        <span>{founders.map((f) => <span className="avatar" key={f.name}>{initials(f.name)}</span>)}</span>
        <span>{signed}</span>
      </div>
    </div>
  );
}
