---
title: Publish the site
summary: Get your saved changes onto the public guide site.
audience: Owners
updated: 2026-11-11
status: published
author: claude
order: 40
---

Saving a page and showing it on the public site are two different things. How the site picks up your saves depends on how it was set up.

## Steps

::::::steps
::::step{title="If your site builds from GitHub"}
Nothing to do. Every save in the online admin is stored in GitHub, and Cloudflare rebuilds the site within a few minutes.
::::

::::step{title="If you publish from the admin"}
Select **Publish** at the top of the admin, then **Publish now**. The site rebuilds with your saves and shows them in a few minutes.

:::note
If you see "Publishing is not set up yet: the site rebuild link (deploy hook) is missing.", add the deploy hook described in `docs/DEPLOY.md`, section 5.
:::
::::

::::step{title="If you work on your computer"}
In the project folder, run `npm run setup -- --site-only`. It rebuilds the site from your `content/` folder and uploads it.
::::
::::::

## Related guides

- [Edit a page](guide:writing-guides/edit-a-page)
