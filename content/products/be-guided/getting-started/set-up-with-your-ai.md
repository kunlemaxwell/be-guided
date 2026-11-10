---
title: Set up Be Guided with your AI
summary: Paste one message into Claude Code or Codex and let it download, install and check Be Guided for you.
audience: The person setting up Be Guided
updated: 2026-11-11
status: published
author: claude
order: 20
---

If you use **Claude Code** or **Codex**, your AI can do the typing for you. It downloads the code, installs it, runs the checks and then walks you through `npm run setup` one step at a time. You still type any keys yourself, into the setup window or Cloudflare's own pages, never into the chat.

## Steps

::::::steps
::::step{title="Fork the repository"}
On GitHub, open **kunlemaxwell/be-guided** and select **Fork**. Your copy is where the online admin saves your guides.
::::

::::step{title="Paste this message into a new chat"}
Open Claude Code or Codex in a terminal, start a new chat and paste:

```text
Set up Be Guided for me from https://github.com/kunlemaxwell/be-guided.
1. Check I have Node.js 20 or newer and Git. If not, tell me how to install them.
2. Ask me for my GitHub username, then tell me to fork the repository to my account first.
3. Clone my fork into a folder I choose, and run npm install.
4. Run the checks: npm run typecheck && npm test.
5. Tell me to run "npm run setup" in my own terminal (it asks me questions there),
   and help me with each step it shows, in plain English, one step at a time.
Never ask me to paste passwords, tokens or keys into this chat. Keys are typed
into the setup window or Cloudflare's own pages only.
When it finishes, give me my guide site, admin and AI connector addresses.
```
::::

::::step{title="Run the setup when your AI asks"}
Your AI tells you when to run `npm run setup` in your own terminal. The setup asks questions there, so it has to be your window. Keep the chat open beside it and ask your AI about any step you are unsure of.
::::

::::step{title="Keep your three addresses"}
At the end, your AI gives you your **guide site**, your **admin** and your **AI connector** address.
::::
::::::

:::tip
Using **Claude** or **ChatGPT** on the web, without a terminal? Paste the same message. Your AI explains each step and you run the commands yourself.
:::

## Related guides

- [Install Be Guided](guide:getting-started/install-be-guided), the same setup step by step.
- [Sign in to the admin](guide:getting-started/sign-in-to-the-admin)
