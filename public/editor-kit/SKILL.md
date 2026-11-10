---
name: be-guided-screenshots
description: Take and mark up screenshots for Be Guided guide pages in the house look (sharp 2x, orange numbered boxes that match the step's legend, optional fade around them). Use whenever you add or retake a screenshot for a Be Guided guide, together with the be-guided connector.
---

# Be Guided screenshots

Every screenshot in a guide page looks the same: a sharp crop of the real screen, the parts the step talks about framed in orange with a number, and the numbers matching the step's `:::legend` list. This skill gives you the tool that draws that look: `annotate.mjs` in this folder.

## Rules

- Real screens of the running app only (test environment). Never invent a screen.
- Do not blur anything. It is all test data.
- Sharp: capture at 2x (device scale factor 2).
- Crop to the area of the task, not the whole window. Wide lists: about 1200 to 1440 CSS px wide. Close-ups (one form section, one menu): as small as makes sense.
- Number only what the step mentions, in the order the text mentions it. 1 to 5 marks per picture.
- File names: short and descriptive, lower-case with dashes, e.g. `invoice-new-button.webp`.

## 1. Capture (2x)

Use whichever browser tool you have:

- **Playwright:** `browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })`, then `page.screenshot({ path: 'raw/<name>.png' })`.
- **Claude in Chrome:** the `zoom` action with `scale: 1` and `save_to_disk` returns a lossless 2x PNG of a region (up to about 720 x 320 CSS px per tile). For a bigger area, take tiles and join them (Python with Pillow: paste each tile at `(tile_x - x0) * 2, (tile_y - y0) * 2`).
- Anything else: a 2x screenshot of the browser window, then `"scale": 2` below.

Keep raw files in a scratch folder. They are not uploaded.

## 2. Measure the boxes

Boxes are in CSS pixels of the full screenshot (before cropping). In the page, run:

```js
[...document.querySelectorAll('<css selector>')].map((e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; })
```

If the screenshot was taken scrolled, use the values at the moment of the screenshot.

## 3. Write the spec (one per picture)

`<name>.json`, next to the raw file:

```json
{
  "source": "raw/invoice-new.png",
  "output": "out/invoice-new-button.webp",
  "scale": 2,
  "crop": { "x": 0, "y": 60, "w": 1440, "h": 520 },
  "dim": false,
  "marks": [
    { "n": 1, "box": { "x": 72, "y": 268, "w": 184, "h": 32 }, "pad": 3, "badge": "r" },
    { "n": 2, "box": { "x": 1249, "y": 178, "w": 159, "h": 34 }, "pad": 3, "badge": "l" }
  ]
}
```

- `crop` (optional): the part of the screenshot to keep, CSS px.
- `dim: true` fades everything outside the boxes. Use it for busy screens with one or two marks.
- `marks`: `n` is the legend number (leave it out for a frame without a number). `pad` is the space around the box (default 6, use 2 to 3 when boxes touch). `badge` is where the number sits: `tr` (default), `tl`, `l`, `r`. Use `l`/`r` for items stacked in a column so numbers never overlap.

## 4. Render

```bash
node ~/.claude/skills/be-guided-screenshots/annotate.mjs <name>.json
```

(Codex: `~/.codex/skills/be-guided-screenshots/annotate.mjs`.) It writes the WebP and prints its size. Open the result and look at it: every number sits on the right thing, nothing is cut off, text is readable. Fix the spec and render again if not.

## 5. Upload and use

1. Call the connector's `get_upload_link` (kind `image`, the file name), and send the WebP with the curl command it returns.
2. In the page body, under the step: `![What the picture shows, with the parts marked](images/<file name it returned>)`
3. Right after it, the legend with one line per number:

```
:::legend
1. The **New** button
2. The **Status** filter
:::
```
