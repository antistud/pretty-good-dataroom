import { getSetting, q1 } from "./db";
import { mailEnabled } from "./mail";
import { periodOf } from "./updates";

export type HealthItem = { title: string; help: string; href: string; done: boolean; weight: number };

/** How many monthly updates in a row have been published, counting back from last month. */
export function updateStreak(now = new Date()): number {
  let streak = 0;
  for (let back = 1; back <= 60; back++) {
    const period = periodOf(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1)));
    if (!q1("SELECT 1 FROM updates WHERE period = ? AND status = 'published'", period)) break;
    streak++;
  }
  return streak;
}

/**
 * A single number for "how ready is this room for an investor to walk in",
 * with the specific things that would raise it.
 */
export function roomHealth(now = new Date()): { score: number; items: HealthItem[]; streak: number } {
  const n = (sql: string, ...p: unknown[]) => q1<{ n: number }>(sql, ...p)?.n ?? 0;
  const inFolder = (like: string) => n("SELECT COUNT(*) AS n FROM documents d JOIN folders f ON f.id = d.folder_id WHERE f.name LIKE ?", like);
  const lastMonth = periodOf(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1)));
  const streak = updateStreak(now);
  const items: HealthItem[] = [
    { title: "Overview written", help: "The first page every investor reads.", href: "/overview", done: getSetting("overview_md").trim().length > 80, weight: 15 },
    { title: "Deck uploaded", help: "Put the current deck in the Pitch folder.", href: "/documents", done: inFolder("%pitch%") > 0, weight: 15 },
    { title: "Cap table complete", help: "Every holder and the option pool.", href: "/captable", done: n("SELECT COUNT(*) AS n FROM holders") >= 2, weight: 15 },
    { title: "Company documents in place", help: "Certificate of incorporation, bylaws, IP assignments.", href: "/documents", done: inFolder("%org%") + inFolder("%legal%") > 0, weight: 10 },
    { title: "Team page filled in", help: "Investors back people first.", href: "/team", done: n("SELECT COUNT(*) AS n FROM team_members") > 0, weight: 8 },
    { title: "Round terms set", help: "Amount, cap and what the money achieves.", href: "/rounds", done: n("SELECT COUNT(*) AS n FROM rounds WHERE target_amount > 0") > 0, weight: 10 },
    { title: "Financials current", help: "Add last month's cash, revenue and spend.", href: "/financials", done: n("SELECT COUNT(*) AS n FROM financials WHERE month >= ?", lastMonth) > 0, weight: 10 },
    { title: "Introductions requested", help: "Tell your network who you want to meet.", href: "/intros", done: n("SELECT COUNT(*) AS n FROM intro_asks WHERE status = 'open'") > 0, weight: 5 },
    { title: "Updates going out", help: "Publish last month's investor update.", href: "/updates", done: streak > 0, weight: 5 },
    { title: "Two-step sign-in on for founders", help: "Protects the most powerful accounts.", href: "/account", done: n("SELECT COUNT(*) AS n FROM users WHERE role = 'founder' AND disabled = 0 AND totp_enabled = 0") === 0, weight: 4 },
    { title: "Email connected", help: "So invitations, updates and reminders are delivered.", href: "/settings", done: mailEnabled(), weight: 3 },
  ];
  const total = items.reduce((a, i) => a + i.weight, 0);
  const got = items.filter((i) => i.done).reduce((a, i) => a + i.weight, 0);
  return { score: Math.round((got / total) * 100), items, streak };
}
