# Let your AI do the setup

Nobody enjoys retyping a cap table. Hand your pitch deck, formation documents and SAFEs to the AI assistant you already use, and it suggests what goes in the room. You check its work before anything is saved.

The data room contains no AI of its own and never sends your files anywhere. Your documents go to whichever assistant you choose, under its terms.

## How it works

1. In the room, open **The room → From your documents**.
2. Create a **connector** for your assistant. You get a private address to paste into the assistant's settings.
3. In a new chat with the assistant, attach your documents and ask it to fill in your data room.
4. Back in the room, review what it found. Tick what is right, untick what is wrong, and press **Add the ticked items to the room**.

It can suggest the company profile and overview, the team, the cap table, a round and SAFEs, and say how each of your documents should be filed.

## Corrections, dates and updates

The assistant can fix what is already in the room, not only add to it. Ask it in plain words: "Jeff Stafford left on 20 October 2025", "the TN Funds SAFE was signed on 14 February and has been wired", "September's closing cash was $150,000".

- It matches by name, so it only sends the name and the field that changes.
- The review screen shows each change as old → new, and you tick the ones to apply.
- It can set start dates, vesting periods, cliffs and leaving dates on the cap table; signing dates, status and terms on SAFEs; round terms; team titles and bios; and monthly revenue, expenses and cash.
- Dates can be written most ways ("March 1, 2026", "3/1/2026", "2026-03-01"). Slashed dates are read as month/day/year.
- If it sends something the room cannot read or apply, the room tells both of you why, instead of dropping it.

- It can empty a field that was filled in by mistake, and record the number of shares someone kept on leaving.

It cannot open or close a round, change who sees what, or delete anything. Do those in the room.

## Getting the files themselves into the room

An assistant cannot upload files. It does not hold the original file, only what it read from it, and a signed SAFE that arrived slightly altered would be worse than a missing one. So the assistant does the filing and you do the drop:

1. The assistant tells the room what each file is: a clear name, the folder it belongs in, and which SAFE it goes with.
2. You open **Documents** (or the bottom of the AI setup page) and drop the same files into the box, all at once.
3. Each file is renamed, described, put in its folder and, for a signed SAFE, attached to that SAFE on the cap table. A "Just filed" list shows where everything went.

Files the assistant did not describe are filed by their own names ("Certificate of incorporation.pdf" goes to company documents). Anything the room cannot place waits in a private **To sort** folder that only founders and team can see. Who can see a file always comes from its folder, never from the assistant.

## Adding the connector to your assistant

The page has step-by-step instructions for Claude, ChatGPT and Grok next to the address. In short:

- **Claude:** Settings → Connectors → Add custom connector → paste the address.
- **ChatGPT:** Settings → Apps → Advanced settings → turn on Developer mode, then Create and paste the address.
- **Grok:** grok.com/connectors → New Connector → Custom → paste the address.
- **Anything else that supports MCP:** add a custom or remote MCP server, type HTTP, and paste the address.

These menus change often, and some assistants only offer custom connectors on paid plans.

## If your assistant has no connectors

Use the copy-and-paste route on the same page: copy the prepared prompt, paste it into any assistant along with your documents, and paste its answer back. You get the same review screen.

## What a connector can and cannot do

- **Suggestions only, by default.** A new connector cannot read anything in the room. It can only send suggestions.
- **Reading is a box you tick.** If you allow it, the assistant can see the company profile, team, cap table, rounds and SAFEs, which helps it avoid suggesting what is already there. It can never see documents, investors, your pipeline, people, requests, updates or activity.
- **Nothing goes live by itself.** Every suggestion waits for you. An assistant can be wrong, and documents can contain text that tries to steer it, so a person always decides.
- **Keys expire.** You choose 1, 7, 30 or 90 days. Seven is the default, because setup is a one-off job.
- **You hear about first use.** The first time a connector is used you get a notification and an email. If you were not expecting it, turn the connector off.
- **Turn it off any time** on the same page. It stops working at once.

## Keeping the key out of the address

The connector address ends in a long secret. If your assistant lets you add an API key, bearer token or request header, use the safer form shown on the page instead: the short address `https://your-room/mcp`, with the key sent as `Authorization: Bearer <key>`. Nothing secret is then stored in an address.

## Check the numbers

An AI read your documents, and AIs make mistakes, especially with share counts and SAFE terms. Compare what it suggests against the signed documents before you apply it.
