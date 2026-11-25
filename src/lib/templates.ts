import { getSetting, q1 } from "./db";
import { money } from "./format";

export type Template = { key: string; title: string; when: string; subject: string; body: string };

type LeadLite = { org_name: string; contact_name: string | null; stage: string; check_size: number | null; round_id: number | null };

/**
 * Ready-to-edit wording for the message a founder most likely needs to send
 * at each stage. These are starting points: the founder should always make
 * them their own before sending.
 */
export function templatesFor(lead: LeadLite, founderName: string): Template[] {
  const company = getSetting("company_name");
  const tagline = getSetting("tagline").trim();
  const first = (lead.contact_name || "").trim().split(/\s+/)[0] || "there";
  const me = founderName.split(/\s+/)[0];
  const round = lead.round_id
    ? q1<{ name: string; target_amount: number; valuation_cap: number | null; instrument: string }>("SELECT name, target_amount, valuation_cap, instrument FROM rounds WHERE id = ?", lead.round_id)
    : undefined;
  const what = tagline ? `${company} (${tagline.replace(/\.$/, "")})` : company;
  const raising = round?.target_amount
    ? `We are raising ${money(round.target_amount)}${round.instrument === "safe" ? " on SAFEs" : ""}${round.valuation_cap ? ` at a ${money(round.valuation_cap, true)} cap` : ""}.`
    : "We are raising our first round.";
  const amount = lead.check_size ? money(lead.check_size) : "[amount]";

  const all: Record<string, Template> = {
    intro: {
      key: "intro", title: "First note", when: "To reach out cold, or to forward through a mutual contact.",
      subject: `${company}: quick introduction`,
      body: `Hi ${first},\n\nI'm ${me}, founder of ${what}. [One sentence on the problem and who has it.] [One sentence of proof: users, revenue, pilots, or what you have built.]\n\n${raising} I'm reaching out to you because [the specific reason: a company they backed, something they wrote].\n\nWould you be open to a 20-minute call next week?\n\n${me}`,
    },
    nudge: {
      key: "nudge", title: "Gentle follow-up", when: "About five days after your first note, once.",
      subject: `Re: ${company}: quick introduction`,
      body: `Hi ${first},\n\nFollowing up on my note below in case it got buried. Since then: [one new thing: a customer, a number, a hire].\n\nHappy to send the deck if that's easier than a call.\n\n${me}`,
    },
    invite: {
      key: "invite", title: "Invitation to the room", when: "Send with (or right after) their invite link.",
      subject: `${company}: your data room access`,
      body: `Hi ${first},\n\nGood to hear you'd like to look closer. I've set up access to our data room for you. Everything is there to look at in your own time.\n\n[paste their invite link]\n\nIf you need anything that is not there, tell me what and when you need it by. You can add colleagues yourself.\n\n${me}`,
    },
    afterMeeting: {
      key: "afterMeeting", title: "After the meeting", when: "Same day as the call.",
      subject: `${company}: thanks, and next steps`,
      body: `Hi ${first},\n\nThank you for the time today. You asked about [their main question]; [your answer, or when you will have it].\n\nI've opened up the cap table, financials and company documents in the data room so you can dig in.\n\nWhat would you need to see to make a decision, and what is your timeline? We're aiming to close by [date].\n\n${me}`,
    },
    diligence: {
      key: "diligence", title: "Diligence check-in", when: "If they have been quiet for a few days during diligence.",
      subject: `${company}: anything you need?`,
      body: `Hi ${first},\n\nChecking in. Is there anything missing from the data room, or a question I can answer to help you decide?\n\nA quick update from our side: [progress on the round or the business].\n\n${me}`,
    },
    paperwork: {
      key: "paperwork", title: "Sending the SAFE", when: "The day they commit.",
      subject: `${company}: SAFE for signature`,
      body: `Hi ${first},\n\nDelighted to have ${lead.org_name} in the round. I've sent the SAFE for ${amount} for signature${round?.valuation_cap ? ` at the ${money(round.valuation_cap, true)} post-money cap` : ""}.\n\nWire instructions are in the Closing folder of the data room. Once the wire lands I'll confirm, and you'll start receiving our monthly updates.\n\nThank you for backing us.\n\n${me}`,
    },
    wire: {
      key: "wire", title: "Wire reminder", when: "A few days after signing, if the money has not arrived.",
      subject: `${company}: wire details`,
      body: `Hi ${first},\n\nThank you for signing. A quick note that we have not yet seen the wire for ${amount}; the instructions are in the Closing folder of the data room. Let me know if anything is unclear or if your bank needs something from us.\n\n${me}`,
    },
    thanks: {
      key: "thanks", title: "Thank you", when: "The day the wire lands.",
      subject: `${company}: received, and thank you`,
      body: `Hi ${first},\n\nThe wire has arrived. Thank you for believing in us this early; it matters a great deal.\n\nYou'll get an update from us every month, with the good and the bad, and a short list of ways you can help. The first thing on that list: [one specific ask].\n\n${me}`,
    },
    passed: {
      key: "passed", title: "A gracious reply to a no", when: "Whenever someone passes.",
      subject: `Re: ${company}`,
      body: `Hi ${first},\n\nThank you for taking the time and for the straight answer. If you're willing to share, I'd value knowing the main reason; it helps us sharpen the story.\n\nWould you like to stay on our monthly update list? No obligation, and it means you'll see how things develop before our next round.\n\n${me}`,
    },
  };
  const byStage: Record<string, string[]> = {
    lead: ["intro"], contacted: ["nudge", "invite"], interested: ["invite", "afterMeeting"], meeting: ["afterMeeting", "diligence"],
    diligence: ["diligence", "paperwork"], committed: ["paperwork"], signed: ["wire"], wired: ["thanks"], passed: ["passed"],
  };
  return (byStage[lead.stage] ?? []).map((k) => all[k]);
}
