/**
 * Prompts a founder can paste into any AI assistant. Each one turns the
 * assistant into an interviewer: it asks, pushes back on vague answers, and
 * only then drafts, in the exact shape this app's field expects.
 */

const HOUSE_RULES = `How to run this:
- Ask me ONE question at a time and wait for my answer before the next.
- If an answer is vague, generic or full of jargon, say so plainly and ask me to try again with a concrete example or a number.
- Do not flatter me. If something would not convince a sceptical investor, tell me why.
- Never invent facts, customers, numbers or traction. Use only what I tell you. If something is missing, ask or leave it out.
- Write in plain English a smart person outside my industry would understand. No buzzwords.`;

export function oneLinerPrompt(company: string, current: string): string {
  return `You are helping me, a startup founder, write the one-line description of my company, ${company}. It appears directly under the company name at the top of our investor data room, so it is the first thing every investor reads.

A good one-liner says who it is for and what it does for them, in words a stranger understands in five seconds. It is specific enough that it could not describe a competitor. It is not a slogan, not a mission statement, and not a list of features.

${HOUSE_RULES}

Interview me with these questions, one at a time:
1. Who exactly is the customer? (A specific kind of person or organisation, not "businesses".)
2. What painful problem do they have today, and what do they do about it now?
3. What does ${company} do for them, in the plainest words possible?
4. What is the result for them, ideally with a number?
5. What is the one thing that makes us different from the obvious alternative?

Then:
- Give me five candidate one-liners, each under 15 words and each taking a different angle.
- For each, say in a few words what it does well and what it risks.
- Ask which is closest, then refine it with me until I say it is right.
- Finish by giving me the final line on its own, with no quotation marks and no full stop, ready to paste.
${current.trim() ? `\nFor reference, what I have at the moment is: "${current.trim()}". Start by telling me honestly what is weak about it, then begin the questions.` : "\nBegin with question 1."}`;
}

export function overviewPrompt(company: string, tagline: string, current: string): string {
  return `You are helping me, a startup founder, write the Overview page of the investor data room for my company, ${company}${tagline.trim() ? ` (${tagline.trim()})` : ""}. An investor should be able to read it in two minutes and know what we do, why it matters, what we have proved and what we are asking for. It is a pre-seed company, so be honest about how early we are: investors trust clarity more than polish.

${HOUSE_RULES}

Interview me section by section, one question at a time. Move on only when a section is clear and concrete.

1. The problem: who has it, how painful and frequent is it, and what do they do about it today?
2. What we do: how does ${company} solve it? Describe it as a customer would experience it.
3. Why now: what has changed (technology, regulation, behaviour, cost) that makes this possible or urgent today?
4. Traction so far: customers, pilots, revenue, waitlist, usage, letters of intent, or what we have learned from talking to customers. Ask me for real numbers and dates. If we have very little, help me say that honestly and show what we have learned instead.
5. Why us: what about the founding team makes us the right people for this?
6. The ask: how much are we raising, on what terms if decided, and what milestone does it get us to?

Then write the overview:
- About 250 to 400 words in total.
- Short paragraphs and plain sentences. Lead each section with its most important fact.
- Use exactly this formatting and nothing else, because the page only understands these: a line starting with "## " for each section heading, "**bold**" for the occasional key number, and lines starting with "- " for short lists. No tables, no images, no HTML.
- Use these headings: ## The problem, ## What we do, ## Why now, ## Traction, ## Team, ## The ask.

After the draft:
- List anything a sceptical investor would question or find missing, and ask me about each.
- Revise with me until I say it is right.
- Finish by giving me the final text on its own in a single block, ready to paste.
${current.trim() ? `\nHere is what I have written so far. Start by telling me honestly what is unclear, unconvincing or missing, then begin the questions for the weakest sections first:\n\n${current.trim()}` : "\nBegin with section 1."}`;
}
