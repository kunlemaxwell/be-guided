---
title: Switch on Ask AI
summary: Add a chat to your guide site that answers readers' questions from your guides.
audience: Owners
updated: 2026-11-11
status: published
author: claude
order: 30
---

**Ask AI** is an optional chat on your guide site. It answers readers' questions from your guide pages. It needs a Claude API key, billed by Anthropic. Readers can always [use the guide in their own Claude or ChatGPT](guide:reading-the-guide/connect-your-ai) for free instead.

## Steps

::::::steps
::::step{title="Get a Claude API key"}
At **console.anthropic.com**, open **API keys** and create one.
::::

::::step{title="Add it"}
Run `npm run setup` again and paste the key at **Switch on Ask AI**. Or, in the project folder, run:

```bash
npx wrangler secret put ANTHROPIC_API_KEY
```
::::

::::step{title="Try it"}
Open your guide site and select **Ask AI**. Until the key is set, it says *"Ask AI is not switched on yet."*
::::
::::::

## Related guides

- [Use the guide in Claude or ChatGPT](guide:reading-the-guide/connect-your-ai)
