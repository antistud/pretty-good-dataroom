import { requireStaff } from "@/lib/auth";
import { q } from "@/lib/db";
import { contactKeys } from "@/lib/csv";
import { currentRound } from "@/lib/rounds";
import { Flash, PageHead } from "@/components/ui";
import { ImportContacts } from "@/components/ImportContacts";

export default async function ImportPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireStaff();
  const rounds = q<{ id: number; name: string }>("SELECT id, name FROM rounds WHERE status != 'closed' ORDER BY id DESC");
  const existingKeys = q<{ org_name: string; contact_name: string | null; contact_email: string | null }>("SELECT org_name, contact_name, contact_email FROM leads").flatMap((l) =>
    contactKeys({ firm: l.org_name, name: l.contact_name ?? "", email: l.contact_email ?? "" }),
  );
  const current = currentRound();
  return (
    <div className="wizard" style={{ maxWidth: 760 }}>
      <PageHead title="Import contacts" sub="Add a whole list of investors to your pipeline from a spreadsheet." />
      <Flash sp={await searchParams} />
      <ImportContacts rounds={rounds} defaultRound={current && rounds.some((r) => r.id === current.id) ? current.id : null} existingKeys={existingKeys} />
    </div>
  );
}
