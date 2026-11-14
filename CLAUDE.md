# Be Guided

See [AGENTS.md](AGENTS.md).

## What's new

- **What it is:** the site-wide page `/changelog/` ("What's new" in the header). Source: `content/products/<product>/whats-new.json` (schema `whatsNewEntrySchema` in `src/types/content.ts`, loader `src/lib/content/whats-new.ts`, grouping `src/lib/whats-new/group.ts`, page `src/app/changelog/page.tsx`, view `src/components/whatsnew/WhatsNewView.tsx`, tests `tests/site/whats-new.test.ts`).
- **What readers see:** a "View by" select: **Date** (default), **Module**, **User**, **Module and user**. Every group is open to start with and can be folded. An entry is a **title and a one-line description on the same line**, tags (module or place, who it is for, "Improved"), **More** (a short longer text, two or three lines) and **How to use** (opens the guide page).
- **One entry per feature:** `slug`, `date`, `title` (60 characters), `summary` (one line, 140), `detail` (optional, 320), `module` (a module slug of the product), `where` (optional place name when it differs from the module title), `audience` (list; "Everyone" when for all), `kind` (`new` or `improved`), `guide` (optional page that shows how to use it, "module/page").
- **The date is the day readers got it: the day it reached production, not the day it was built.** Read the production branch, not whatever branch is checked out. A feature that is only in testing is not listed.
- **Audience** uses the app's real user types, the same names as the product's journeys. Never invent one.
- **Keep it in step:** whenever a feature is documented or an update check is applied, add its entry under the release day. A `guide` must point at a page that exists. No em dashes.

## What readers see is controlled in the admin (Maxwell, 14 Nov 2026)

- **Show or hide a page:** Admin › Pages has a "Show on site" tick on every page row. Unticked = the page becomes a draft (kept off the site, search and Ask AI; never deleted). `POST /api/v1/pages/{product}/{module}/{page}/shown`.
- **Show or hide a What's new entry:** Admin › What's new lists every entry of a product with a tick. Unticked sets `"hidden": true` on the entry in whats-new.json, and the site leaves it out (`src/lib/content/whats-new.ts`). `GET /api/v1/products/{product}/whats-new`, `PUT .../whats-new/{slug}/shown`.
- **Publish automatically (default on),** two switches per product in Admin › Products, stored as product.json `autoPublish: { pages, whatsNew }` (absent = both on). Pages off: every `save_page` waits for an owner in Updates & requests, even from an owner's key. What's new off: `save_whats_new` saves new entries with `hidden: true`; an owner ticks them in What's new to publish. Existing entries keep their state when updated. `list_products` shows both settings.
- **Connector tool `save_whats_new`** (product, entries[]) adds or updates entries, validated with the site's schema; the writing standard and update checks tell the AI to use it after documenting a new feature. The audit log has an area "What's new".
- Tests: `backend/tests/contract/publish-settings.contract.test.ts`, `tests/site/whats-new.test.ts`.
