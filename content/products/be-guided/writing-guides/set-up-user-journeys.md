---
title: Set up user journeys
summary: Give each kind of reader a short, ordered path through your guide, so nobody has to read the whole product.
audience: Guide writers and site owners
updated: 2026-11-14
status: published
author: claude
order: 50
section: Writing
prerequisites:
  - page: writing-guides/edit-a-page
    why: Journeys point at pages that already exist.
---

A **user journey** is the short list of guides one kind of reader needs, in a sensible order. Your product might have a finance lead, an employee and an administrator, and each of them wants a different slice of the guide. Journeys let readers pick theirs instead of wading through everything.

## What readers see

- On a product's home page, a **Which user are you?** card. Readers pick one or more user types. It is never a pop-up, and it remembers the choice in that browser only.
- After picking, the product page shows **your journey**: the guides for them, in order.
- On each guide page that is part of the journey, a bar shows "step 3 of 8" with the previous and next guide in that journey.
- A **User journeys** link in the header opens every journey, and each one has its own page that draws it as a path.
- Choosing nothing, or "Everyone", shows the whole guide. Journeys never hide pages.

## How user types are found

User types are not fixed. They depend on the product you are documenting.

1. If the product has real roles or user types (role names, permission groups, a user types screen, menus that change per role), use those.
2. If it has none, work them out from what the product does, for example head of finance, finance executive, inventory manager, hiring manager, head of HR, HR administrator, supervisor or employee. Mark these as worked out (`"inferred": true`).

Your AI follows the same rule when it writes guides or runs an update check: it looks at the user types first, then checks the journeys for gaps.

## Where journeys live

Each product has a file `content/products/<product>/journeys.json`. A journey has a short `slug`, a `title`, a one-line `summary`, an optional `group` heading, and ordered `steps`:

```json
{
  "journeys": [
    {
      "slug": "finance-lead",
      "title": "Finance lead",
      "group": "Finance",
      "summary": "Set the books up properly and close each month.",
      "inferred": true,
      "steps": [
        { "page": "accounting/overview", "why": "Start with the whole picture." },
        { "page": "accounting/close-a-month" }
      ]
    }
  ]
}
```

A step's `page` is `module/page`. Steps that point at pages that are private, in draft or missing are left out automatically, and a journey with no pages left is not shown.

## Keeping journeys right

Whenever a page is added, renamed or removed, check which journeys it belongs to. A new page that no journey uses is a gap worth fixing. A new feature that a new kind of user needs deserves its own journey.
