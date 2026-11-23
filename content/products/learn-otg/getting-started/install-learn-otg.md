---
title: "Install and run Learn OTG"
summary: "Get the code, run the setup and open Learn OTG on your computer, with free keys or in demo mode."
audience: "Anyone trying Learn OTG"
updated: 2026-11-23
status: published
author: claude
order: 10
---

Learn OTG runs on your own computer. The setup takes a few minutes, and you can try it in demo mode without any keys.

## Before you start

You need:

- **Node.js 20 or newer** and **Git** on your computer.
- Free keys from **Groq** or **NVIDIA** if you want real lessons. They are optional.

## Steps

::::::steps
::::step{title="Get the code and run the setup"}
In a terminal:

```bash
git clone https://github.com/kunlemaxwell/learn-otg.git
cd learn-otg
node scripts/setup.mjs
```

The setup checks your Node.js version, installs the packages, asks for your keys and starts the app at **http://localhost:3000**. On a Mac you can also double-click **Start Learn OTG.command**.
::::

::::step{title="Add a free key (optional)"}
For a **Groq** key, sign in at console.groq.com, open **API Keys** and select **Create API Key**. The key starts with `gsk_`.

For an **NVIDIA** key, sign in at build.nvidia.com, open a model page such as GLM or Kimi and select **Get API Key**. The key starts with `nvapi-`.

Paste the key when the setup asks. Keys stay on your computer in `.env.local`. Never share that file.
::::

::::step{title="Or use demo mode"}
With no keys, Learn OTG runs in **demo mode**. It shows sample lessons and courses and makes no AI calls. You can also add `?mock=1` to any page address to see demo mode on purpose.
::::
::::::

:::note
Run the setup again any time to add or change keys. To try it on your phone on the same Wi-Fi, run `npm run dev:phone` and open your computer's address on port 3000.
:::

## What happens next

The first time you open Learn OTG, a short welcome asks a few questions about you. See [Set up your profile](guide:getting-started/set-up-your-profile).
