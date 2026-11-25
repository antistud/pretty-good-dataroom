import { requireStaff } from "@/lib/auth";
import { q, q1 } from "@/lib/db";
import { levelOptions } from "@/lib/format";
import { safeOwnershipToday } from "@/lib/captable";
import { safeInputs } from "@/lib/rounds";
import { RoundWizard, type WizardContext } from "@/components/RoundWizard";

/** Plans a round by asking the founder one question at a time. */
export default async function NewRound() {
  await requireStaff();
  const months = q<{ revenue: number; expenses: number; cash: number }>("SELECT revenue, expenses, cash FROM financials ORDER BY month DESC LIMIT 3");
  const holders = q<{ kind: string; shares: number }>("SELECT kind, shares FROM holders");
  const total = holders.reduce((n, h) => n + h.shares, 0);
  const founders = holders.filter((h) => h.kind === "founder").reduce((n, h) => n + h.shares, 0);
  const audiences = levelOptions().filter((o) => o.level >= 1 && o.level < 100);
  const ctx: WizardContext = {
    burn: months.length ? months.reduce((n, m) => n + (m.expenses - m.revenue), 0) / months.length : null,
    cash: months.length ? months[0].cash : null,
    foundersNow: total > 0 ? founders / total : null,
    soldOnSafes: Math.min(0.9, safeOwnershipToday(safeInputs())),
    hasRounds: !!q1("SELECT 1 FROM rounds LIMIT 1"),
    audiences,
    defaultAudience: audiences[0]?.level ?? 1,
  };
  return <RoundWizard ctx={ctx} />;
}
