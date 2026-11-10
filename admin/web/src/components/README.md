# Admin component library

Shared, presentational components for the Be Guided admin. They take
props and render; they never fetch data or read the session (that lives in
`features/*` hooks and `auth/`). Every one is keyboard accessible and labelled
for screen readers (WCAG AA). See them all, in their states, on the
**Components** screen (`/components`).

Reuse these instead of building one-off controls. A new shared control goes
here, gets JSDoc, an entry in this file and an example on the Components screen.

| Component | Props (main) | Use it when |
| --- | --- | --- |
| `AsyncView` | `query`, `isEmpty?`, `empty?`, `loadingLabel?`, `children(data)` | Every data view. Renders loading, error (with "Try again"), empty, or success. |
| `Badge` | `tone: on \| off \| warn \| draft \| live \| neutral \| info`, `title?` | Small status chips: Text/Screenshots/Video, Draft/Published, Private. |
| `ActionsMenu` | `label` (accessible name), `items: { label, to? \| href? \| onSelect?, disabled? }[]` | Row actions behind a vertical ⋮ button (pages list). Enter/Space/↓ opens, ↑/↓/Home/End move, Escape closes and returns focus, Tab or outside click closes. |
| `Tabs` + `TabPanel` | `label`, `tabs: { id, label, marked?, markLabel? }[]`, `value`, `onChange`, `idPrefix`; panel: `idPrefix`, `id`, `active` | One screen split into areas (Settings). WAI-ARIA tabs: only the chosen tab is in the Tab order, ←/→ (wrapping), Home/End move and show that tab. `marked` adds a dot (e.g. unsaved changes). Keep the chosen tab in the URL (`?tab=`) so refresh and links work. |
| `Accordion` | `title`, `summary?`, `defaultOpen?` (false), `level?`, `children` | A long group of fields people rarely need all at once (theme customizer). Closed by default; the header's `summary` says what is set inside. Wrap several in `.accordion-group`. Content stays mounted while closed. |
| `Switch` | `label`, `checked`, `onChange`, `hint?`, `disabled?` | A yes/no setting saved with its form, e.g. "Show on the public site". `role="switch"`. |
| `MultiSelect` | `label`, `options: { value, label, note? }[]`, `value`, `allSelected`, `onChange`, `allLabel` | Choosing several of many (30–40+) items, with search and an "All …" choice. |
| `FilePicker` | `label`, `value` (stored path), `href` (link or null), `accept`, `onPick(file)`, `onClear?`, `busy?`, `status?`, `error?`, `existing?`, `onChooseExisting?` | "Choose file…" instead of typing a path. The parent uploads in `onPick` and sets `value`; the chosen file shows as a clickable link. |
| `ColorField` | `label`, `value` (hex or undefined), `themeValue`, `onChange` | A colour with picker + hex box. `undefined` = use the theme's colour; reset button returns to it. |
| `SliderField` | `label`, `value`, `themeValue`, `min`, `max`, `step?`, `unit?`, `onChange` | A number on a slider + number box, with "reset to theme" (theme customizer sizes). |
| `Field` | `label`, `hint?`, `error?`, `children(props)` | Label + any control + hint or error, wired with `id`/`aria-describedby`/`aria-invalid`. |
| `ModePicker` | `value`, `onChange`, `legend?` | The mandatory content mode for every request (nothing preselected). |
| `Pagination` | `pageNumber`, `totalPages`, `totalCount`, `onChange`, `noun?` | Server-side paged lists (audit log, version history). |
| `Dialog` | `open`, `title`, `onClose`, `children`, `footer?`, `wide?` | A question or a short form. Native modal `<dialog>`: traps focus, Escape closes, focus returns. Focuses the first field. |
| `Drawer` | `open`, `title`, `subtitle?`, `onClose`, `children`, `footer?` | Details next to a list (audit entry, page history). Same focus rules as `Dialog`; backdrop click closes. |
| `Icon` | `name: IconName`, `size?` | Decorative line icons (always `aria-hidden`). |
| `AccessDenied` | `what?` | Shown for a 403: the person's role doesn't include a screen. Used by `RequirePermission`. |
| `ErrorFallback` | – | Route error boundary: a screen crashed; offers a way back. |
| `Layout` | – | The shell: sidebar with an icon-only collapse button at its top (`SidebarToggle`, tooltip on hover and focus; remembered per browser), top bar, Publish. |

Feature-level shared views that are also shown on the Components screen:
`FieldChanges` and `DiffView` (in `features/editor/HistoryPanel.tsx`) render a
version's before/after page details and its line-by-line text diff; the audit
log reuses `FieldChanges`.

## Rules

- Presentational only: no `fetch`, no `api.*`, no `useAuth()` inside these files (`Layout` is the one exception: it is the app shell).
- Plain-language text; the owner is not technical.
- No `any`. Props are typed and documented with JSDoc.
- Colours come from the CSS variables in `styles.css` (light and dark).
