---
title: Install Be Guided
summary: Get the code, try it on your computer, then put your guide site and admin online with one command.
audience: The person setting up Be Guided
updated: 2026-11-10
status: published
author: claude
order: 10
---

Be Guided runs on your own Cloudflare account. The setup takes about 10 minutes the first time, and you can stop at any step and run it again later.

## Before you start

You need:

- **Node.js 20 or newer** and **Git** on your computer.
- A free **Cloudflare** account.
- A free **GitHub** account. The online admin saves your guides to a GitHub repository.
- macOS, Linux, or Windows with WSL or Git Bash.

You don't need an AI API key. Ask AI on the guide site is optional.

## Steps

::::::steps
::::step{title="Fork and download the code"}
On GitHub, open **kunlemaxwell/be-guided** and select **Fork** to make your own copy. Then, in a terminal:

```bash
git clone https://github.com/<you>/be-guided.git
cd be-guided
npm install
```

`npm install` gets everything Be Guided needs, including Cloudflare's own tool, so you don't install anything else.
::::

::::step{title="Try it on your computer (optional)"}
Run the guide site and the admin in two terminals:

```bash
npm run dev -- -p 3100
```

```bash
npm run admin
```

Open **http://localhost:3100** for the guide site and **http://localhost:3101** for the admin. Changes you make in the admin are saved straight into the `content/` folder.
::::

::::step{title="Run the setup"}
```bash
npm run setup
```

The setup explains each step and waits for you. Your browser opens Cloudflare's sign-in page first. Sign in and select **Allow**.

It then creates the database and file storage, puts the admin online and puts the guide site online. Type **s** at any step to skip it and come back later.
::::

::::step{title="Lock the admin"}
When the setup reaches **Choose who can open the admin**, follow its steps in the Cloudflare dashboard:

1. Turn on **Cloudflare Access** for the admin. The free plan covers up to 50 people.
2. Add your own email, and the emails of anyone else allowed in.
3. Leave these addresses open (**Bypass**), so the guide site and AI tools can reach them: `api/v1/chat`, `api/v1/mcp`, `api/v1/editor`, `api/v1/health` and `api/v1/openapi.json`.
4. Paste the **team domain** and the **Audience (AUD) tag** back into the setup, then your own email. You become the first owner.
::::

::::step{title="Connect GitHub"}
Enter your repository as **owner/name**, for example `your-name/be-guided`. Then paste a GitHub **fine-grained token** that can read and write **Contents** on that one repository only. It is typed straight into Cloudflare and never shown or saved on your computer.
::::

::::step{title="Note your three addresses"}
At the end the setup checks everything and prints:

- **Your guide site**, which your customers read.
- **Your admin**, where you and your team sign in.
- **AI connector URL**, which readers add to Claude or ChatGPT.
::::
::::::

## If something goes wrong

| What you see | What to do |
| --- | --- |
| The setup stops at a step | Run `npm run setup` again. Steps already done are skipped. Details are in `.wrangler/setup-logs/`. |
| Storage isn't switched on | In the Cloudflare dashboard, open **R2 Object Storage** and start using R2 (10 GB free), then run the setup again. Everything except uploads works without it. |
| "AI connector answered 302" or a sign-in page | Add the Bypass addresses from the **Lock the admin** step. |
| The guide site isn't answering yet | Wait a minute and open it again. |

## What happens next

Open your admin, add your first product, and connect your AI so it can write guides for you.
