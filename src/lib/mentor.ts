import { q, q1 } from "./db";

/**
 * The founder's guide: where you are in the raise, what matters right now,
 * and what to do next. Advice here is general practice for pre-seed rounds,
 * not legal or financial advice.
 */
export type Season = {
  key: string;
  label: string;
  title: string;
  summary: string;
  /** What good looks like at this point. */
  focus: string[];
  /** Things founders commonly get wrong here. */
  watchOut: string[];
  /** Where in the app to do the work. */
  links: { label: string; href: string }[];
};

export const SEASONS: Season[] = [
  {
    key: "prepare",
    label: "Prepare",
    title: "Prepare the ground",
    summary: "Before you talk to anyone, get the room tidy. Investors forgive an early product; they do not forgive a messy cap table or a missing incorporation document.",
    focus: [
      "Write the overview: the problem, what you built, why now, what you have proved so far, and what you are raising.",
      "Upload the deck, and keep it to one current version.",
      "Enter every shareholder and every SAFE so the cap table is complete and adds up.",
      "Put the incorporation documents and IP assignments in their folders.",
      "Decide the round: how much, on what terms, and what the money gets you to.",
    ],
    watchOut: [
      "Raising without a number. Pick an amount tied to a milestone 18 to 24 months out, then work back.",
      "Waiting for the room to be perfect. A lean, complete room beats a padded one.",
    ],
    links: [
      { label: "Write the overview", href: "/overview" },
      { label: "Add documents", href: "/documents" },
      { label: "Fill in the cap table", href: "/captable" },
      { label: "Set up the round", href: "/rounds" },
    ],
  },
  {
    key: "list",
    label: "Build your list",
    title: "Plant widely",
    summary: "A raise is a numbers game run with care. Most founders need far more conversations than they expect, so build the list before you start the clock.",
    focus: [
      "List every investor who could plausibly write this cheque: angels, pre-seed funds, operators in your market.",
      "For each one, find the warmest path in. A warm introduction is worth many cold emails.",
      "Post the introductions you need in Set Me Up, so supporters and existing investors can help.",
      "Start conversations close together. Momentum is real, and it only exists when people are deciding at the same time.",
    ],
    watchOut: [
      "Talking to investors one at a time. It stretches a six-week process into six months.",
      "Starting with your dream investor. Practise the pitch on a few others first.",
    ],
    links: [
      { label: "Add investors to the pipeline", href: "/pipeline" },
      { label: "Ask for introductions", href: "/intros" },
    ],
  },
  {
    key: "conversations",
    label: "Conversations",
    title: "Water regularly",
    summary: "You are in meetings now. Your job is to keep every conversation moving and to make it easy for an interested investor to say yes.",
    focus: [
      "After every meeting, write a note and set a next action with a date. Then do it on that date.",
      "When someone shows interest, invite them to the room the same day. Interest fades quickly.",
      "Watch what they read. Someone who opens the financials twice is closer than someone who says kind things.",
      "Ask directly: what would you need to see to decide, and by when?",
    ],
    watchOut: [
      "Treating a friendly meeting as a yes. Until there is an amount and a date, it is a maybe.",
      "Letting a slow investor set your pace. Keep going with the others.",
    ],
    links: [
      { label: "Work the pipeline", href: "/pipeline" },
      { label: "See who is reading what", href: "/activity" },
    ],
  },
  {
    key: "diligence",
    label: "Diligence",
    title: "Tend what is growing",
    summary: "Someone is looking closely. Diligence at pre-seed is mostly about trust: are you organised, honest and quick to respond?",
    focus: [
      "Answer requests within a day, even if the answer is that you will have it by Friday.",
      "If you do not have a document, say so. Do not improvise one.",
      "Fill the gaps the diligence tracker shows before they are asked about.",
      "Keep talking to everyone else. Diligence with one investor is not a closed round.",
    ],
    watchOut: [
      "Hiding a weakness. Investors find it, and the hiding is what ends the deal.",
      "Going quiet while you gather answers. Silence reads as trouble.",
    ],
    links: [
      { label: "Open requests", href: "/requests" },
      { label: "Pipeline", href: "/pipeline" },
    ],
  },
  {
    key: "closing",
    label: "Closing",
    title: "Bring in the harvest",
    summary: "You have commitments. A commitment is not money, so move each one to a signature and a wire without letting it drift.",
    focus: [
      "Send the SAFE the day someone commits, with wire instructions.",
      "Record each step here: committed, signed, wired. Chase the gaps politely and promptly.",
      "Upload every signed SAFE and attach it to its entry, so the cap table and the paperwork match.",
      "Ask your lawyer about board consent and securities filings before the first wire, not after.",
      "Tell the investors still deciding how much is left. A filling round is the best nudge there is.",
    ],
    watchOut: [
      "Leaving the round open forever. Set a closing date and keep to it.",
      "Different terms for different investors without a reason you could explain to all of them.",
    ],
    links: [
      { label: "Round and closing checklist", href: "/rounds" },
      { label: "Cap table and SAFEs", href: "/captable" },
    ],
  },
  {
    key: "tending",
    label: "Keep the garden",
    title: "Keep the garden",
    summary: "The round is closed. The founders who raise the next one easily are the ones who kept their investors informed through this one.",
    focus: [
      "Send the update every month, on time, including the bad months. Especially the bad months.",
      "Always include asks. Investors want to help and rarely know how.",
      "Keep the financials current so runway is never a surprise to you or to them.",
      "Invite the people who passed to follow along as supporters. Many next-round cheques come from them.",
    ],
    watchOut: [
      "Going quiet when things are hard. That is when investors can be most useful.",
      "Starting the next raise with less than six months of runway.",
    ],
    links: [
      { label: "Write this month's update", href: "/updates" },
      { label: "Update the financials", href: "/financials" },
    ],
  },
];

/** Works out which season the founder is in from what is actually in the room. */
export function currentSeason(): number {
  const round = q1<{ id: number; status: string }>(
    "SELECT id, status FROM rounds ORDER BY CASE status WHEN 'closing' THEN 0 WHEN 'open' THEN 1 WHEN 'planning' THEN 2 ELSE 3 END, id DESC LIMIT 1",
  );
  if (!round || round.status === "planning") return 0;
  if (round.status === "closed") return 5;
  if (round.status === "closing") return 4;
  const stages = q<{ stage: string; n: number }>("SELECT stage, COUNT(*) AS n FROM leads WHERE round_id = ? OR round_id IS NULL GROUP BY stage", round.id);
  const count = (...names: string[]) => stages.filter((s) => names.includes(s.stage)).reduce((a, s) => a + s.n, 0);
  if (count("committed", "signed", "wired") > 0) return 4;
  if (count("diligence") > 0) return 3;
  if (count("contacted", "interested", "meeting") > 0) return 2;
  return 1;
}

/** A short, rotating encouragement. Changes daily, the same for everyone that day. */
const NOTES = [
  "Most rounds feel like nothing is happening until, quite suddenly, they close. Keep doing the next small thing.",
  "A no today is often a not yet. Be gracious, and keep them on the update list.",
  "You do not need every investor. You need the few who see what you see.",
  "The follow-up you are putting off is usually the one that matters. Send it now.",
  "Clear beats clever. Say plainly what you are building and what you need.",
  "Investors back people who do what they said they would. Small promises kept add up.",
  "Rest is part of the work. A tired founder pitches worse.",
  "Write the update even when the month was hard. Trust is built in the hard months.",
  "Ask for the introduction. People like to help, and they rarely offer unprompted.",
  "One good conversation a day is a strong pace. You do not have to do it all at once.",
];
export function noteOfTheDay(now = new Date()): string {
  const day = Math.floor(now.getTime() / 86400_000);
  return NOTES[day % NOTES.length];
}
