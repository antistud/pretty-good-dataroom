import { requireSection } from "@/lib/auth";
import { q } from "@/lib/db";
import { logView } from "@/lib/activity";
import { Field, Flash, Hint, PageHead } from "@/components/ui";
import { addMemberAction, deleteMemberAction, moveMemberAction, updateMemberAction } from "./actions";

type Member = { id: number; name: string; title: string | null; bio: string | null; link: string | null };

function MemberFields({ m }: { m?: Member }) {
  return (
    <>
      <div className="grid2">
        <Field label="Name"><input name="name" required maxLength={120} defaultValue={m?.name} /></Field>
        <Field label="Title"><input name="title" maxLength={120} defaultValue={m?.title ?? ""} placeholder="Co-founder & CEO" /></Field>
      </div>
      <Field label="Short bio" hint="Two or three sentences: what they did before and why they are right for this."><textarea name="bio" maxLength={2000} defaultValue={m?.bio ?? ""} /></Field>
      <Field label="Link (optional)" hint="LinkedIn or a personal site. Must start with https://"><input name="link" type="url" defaultValue={m?.link ?? ""} placeholder="https://" /></Field>
    </>
  );
}

export default async function Team({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const me = await requireSection("team");
  logView(me, "section.view", undefined, undefined, "team");
  const members = q<Member>("SELECT id, name, title, bio, link FROM team_members ORDER BY position, id");

  return (
    <>
      <PageHead title="Team" sub="The people building the company." />
      <Flash sp={await searchParams} />
      {me.isStaff ? (
        <Hint title="Why this page matters">At pre-seed, investors are mostly betting on the team. List the founders first, then key hires and advisors. Say what each person has done that makes them credible here.</Hint>
      ) : (
        <Hint title="What to look for">Who is full time, what they have built before, and whether the team covers both the product and the market. If you want to talk to someone, use “Ask or request”.</Hint>
      )}

      {members.length === 0 && <div className="empty">{me.isStaff ? "No one listed yet. Add the founders below." : "The team page has not been filled in yet."}</div>}
      <div className="grid2">
        {members.map((m, i) => (
          <div className="card" key={m.id}>
            <h2 style={{ marginBottom: 2 }}>{m.name}</h2>
            {m.title && <div className="muted">{m.title}</div>}
            {m.bio && <p style={{ marginTop: 10, whiteSpace: "pre-wrap" }}>{m.bio}</p>}
            {m.link && /^https?:\/\//i.test(m.link) && (
              <a href={m.link} target="_blank" rel="noopener noreferrer" className="small">{m.link.replace(/^https?:\/\/(www\.)?/i, "")}</a>
            )}
            {me.isStaff && (
              <>
                <hr />
                <div className="row">
                  {i > 0 && <form action={moveMemberAction}><input type="hidden" name="id" value={m.id} /><input type="hidden" name="dir" value="up" /><button className="linkbtn small">Move up</button></form>}
                  {i < members.length - 1 && <form action={moveMemberAction}><input type="hidden" name="id" value={m.id} /><input type="hidden" name="dir" value="down" /><button className="linkbtn small">Move down</button></form>}
                  <form action={deleteMemberAction}><input type="hidden" name="id" value={m.id} /><button className="linkbtn small danger">Remove</button></form>
                </div>
                <details style={{ marginTop: 8 }}>
                  <summary>Edit</summary>
                  <form action={updateMemberAction}>
                    <input type="hidden" name="id" value={m.id} />
                    <MemberFields m={m} />
                    <button className="btn">Save</button>
                  </form>
                </details>
              </>
            )}
          </div>
        ))}
      </div>

      {me.isStaff && (
        <div className="card">
          <h2>Add a person</h2>
          <form action={addMemberAction}>
            <MemberFields />
            <button className="btn primary">Add to team page</button>
          </form>
        </div>
      )}
    </>
  );
}
