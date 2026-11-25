import { ExportBar } from "@/components/Export";
import { requireSection } from "@/lib/auth";
import { q } from "@/lib/db";
import { logView } from "@/lib/activity";
import { Field, Flash, Hint, PageHead } from "@/components/ui";
import { addMemberAction, deleteMemberAction, moveMemberAction, updateMemberAction } from "./actions";

type Member = { id: number; name: string; title: string | null; bio: string | null; link: string | null; photo_key: string | null };
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");

function MemberFields({ m }: { m?: Member }) {
  return (
    <>
      <div className="grid2">
        <Field label="Name"><input name="name" required maxLength={120} defaultValue={m?.name} /></Field>
        <Field label="Title"><input name="title" maxLength={120} defaultValue={m?.title ?? ""} placeholder="Co-founder & CEO" /></Field>
      </div>
      <Field label="Short bio" hint="Two or three sentences."><textarea name="bio" maxLength={2000} defaultValue={m?.bio ?? ""} /></Field>
      <div className="grid2">
        <Field label="Link (optional)" hint="LinkedIn or a personal site."><input name="link" type="url" defaultValue={m?.link ?? ""} placeholder="https://" /></Field>
        <Field label="Photo (optional)" hint="JPEG, PNG or WebP, up to 3 MB."><input name="photo" type="file" accept="image/jpeg,image/png,image/webp" /></Field>
      </div>
      {m?.photo_key && <label className="row small" style={{ marginBottom: 10 }}><input type="checkbox" name="remove_photo" /> Remove the current photo</label>}
    </>
  );
}

export default async function Team({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const me = await requireSection("team");
  logView(me, "section.view", undefined, undefined, "team");
  const members = q<Member>("SELECT id, name, title, bio, link, photo_key FROM team_members ORDER BY position, id");

  return (
    <>
      <PageHead title="Team" sub="The people building the company."><ExportBar /></PageHead>
      <Flash sp={await searchParams} />
      {me.isStaff ? (
        <Hint title="Why this page matters">Investors back people first. List founders, then key hires and advisors, with what makes each credible.</Hint>
      ) : (
        <Hint title="What to look for">Who is full time, what they built before, and whether the team covers product and market.</Hint>
      )}

      {members.length === 0 && <div className="empty">{me.isStaff ? "No one listed yet. Add the founders below." : "The team page has not been filled in yet."}</div>}
      <div className="grid2">
        {members.map((m, i) => (
          <div className="card" key={m.id}>
            <div className="row" style={{ gap: 14, flexWrap: "nowrap", alignItems: "center" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {m.photo_key ? <img className="avatar-photo" src={`/api/team-photo/${m.id}?v=${m.photo_key.slice(0, 8)}`} alt="" width={64} height={64} /> : <div className="avatar-photo blank" aria-hidden>{initials(m.name)}</div>}
              <div>
                <h2 style={{ margin: 0 }}>{m.name}</h2>
                {m.title && <div className="muted">{m.title}</div>}
              </div>
            </div>
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
