import { q, q1 } from "./db";
import { canSeeSection, type Viewer } from "./auth";
import { visibleDocuments, visibleFolders } from "./docs";

export type Step = {
  key: string;
  title: string;
  /** Plain-language "why and what to look for". */
  body: string;
  href: string;
  cta: string;
  done: boolean;
  optional?: boolean;
};

export const STEP_KEYS = ["overview", "deck", "round", "captable", "financials", "team", "request", "colleague", "intros"];

export function onboardScope(userId: number): string {
  return `onboard:${userId}`;
}

function viewedSection(userId: number, section: string): boolean {
  return !!q1("SELECT 1 FROM activity WHERE user_id = ? AND action = 'section.view' AND detail = ? LIMIT 1", userId, section);
}

/** The "Start here" checklist for one investor, with completion detected from what they have actually done. */
export function onboardingSteps(me: Viewer): Step[] {
  const manual = new Set(q<{ key: string }>("SELECT key FROM checks WHERE scope = ?", onboardScope(me.id)).map((r) => r.key));
  const steps: Step[] = [];
  const add = (s: Omit<Step, "done">, detected: boolean) => steps.push({ ...s, done: detected || manual.has(s.key) });

  if (canSeeSection(me, "overview")) {
    add(
      { key: "overview", title: "Read the overview", body: "Two minutes. What the company does, who it is for and where it is today.", href: "/overview", cta: "Read the overview" },
      viewedSection(me.id, "overview"),
    );
  }

  if (canSeeSection(me, "documents")) {
    const roots = visibleFolders(me.level).filter((f) => f.parent_id === null);
    const pitch = roots.find((f) => /pitch|deck/i.test(f.name)) ?? roots[0];
    if (pitch) {
      const docs = visibleDocuments(me.level).filter((d) => d.folder_id === pitch.id && d.current_version_id);
      if (docs.length > 0) {
        const ids = docs.map((d) => d.id);
        const seen = !!q1(
          `SELECT 1 FROM activity WHERE user_id = ? AND action = 'doc.view' AND target_id IN (${ids.map(() => "?").join(",")}) LIMIT 1`,
          me.id,
          ...ids,
        );
        add(
          {
            key: "deck",
            title: "Read the pitch deck",
            body: "The full story in slides. If you only open one document, open this one.",
            href: docs.length === 1 ? `/documents/${docs[0].id}` : "/documents",
            cta: "Open the deck",
          },
          seen,
        );
      }
    }
  }

  if (canSeeSection(me, "round")) {
    add(
      { key: "round", title: "Review the round terms", body: "How much is being raised, on what instrument, at what cap, and how much is already committed.", href: "/round", cta: "See the round" },
      viewedSection(me.id, "round"),
    );
  }
  if (canSeeSection(me, "captable")) {
    add(
      { key: "captable", title: "Look at the cap table and SAFEs", body: "Who owns what today, and what your investment would convert into at the next priced round.", href: "/captable", cta: "Open the cap table" },
      viewedSection(me.id, "captable"),
    );
  }
  if (canSeeSection(me, "financials")) {
    add(
      { key: "financials", title: "Check the financials", body: "Cash in the bank, monthly burn and runway. At this stage, runway is the number that matters.", href: "/financials", cta: "See the financials" },
      viewedSection(me.id, "financials"),
    );
  }
  if (canSeeSection(me, "team")) {
    add(
      { key: "team", title: "Meet the team", body: "Who is building this and why they are the right people to do it.", href: "/team", cta: "Meet the team" },
      viewedSection(me.id, "team"),
    );
  }
  if (canSeeSection(me, "requests")) {
    add(
      { key: "request", title: "Ask a question or request something", body: "Missing a document or want to go deeper on something? Ask here and the founders are notified straight away.", href: "/requests", cta: "Ask the founders" },
      !!q1("SELECT 1 FROM requests WHERE user_id = ? LIMIT 1", me.id),
    );
  }
  if (me.orgId) {
    add(
      { key: "colleague", title: "Invite a colleague", body: "Optional. Bring in a partner or associate. They see exactly what you see.", href: "/account", cta: "Invite a colleague", optional: true },
      !!q1("SELECT 1 FROM invites WHERE invited_by = ? LIMIT 1", me.id),
    );
  }
  if (canSeeSection(me, "intros")) {
    add(
      { key: "intros", title: "See who we would love to meet", body: "The introductions that would help most right now. One warm intro can change the company's month.", href: "/intros", cta: "See the list" },
      viewedSection(me.id, "intros"),
    );
  }
  return steps;
}

export type UpdateLink = { id: number; title: string; period: string; published_at: string | null };

/** Published updates with at least one section this level may read, newest first. */
export function visibleUpdates(level: number, limit = 6): UpdateLink[] {
  return q<UpdateLink>(
    `SELECT u.id, u.title, u.period, u.published_at FROM updates u
      WHERE u.status = 'published' AND EXISTS (SELECT 1 FROM update_sections s WHERE s.update_id = u.id AND s.min_level <= ?)
      ORDER BY u.period DESC LIMIT ?`,
    level,
    limit,
  );
}
