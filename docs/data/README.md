# Shared maps (`data/`)

Maps in this folder are **shared, read-only** UMindMap maps that anyone can open by
URL. They are plain static files — GitHub Pages serves them as-is, no server code.

## Opening a shared map

Append the **file name (with `.json`)** to the app URL:

```
https://pponec.github.io/UMindMap/?demo.json
```

- A query **with** `.json` → a shared file from this folder, shown as a **picture**
  (graph view), read-only.
- A query **without** `.json` (e.g. `?demo`) → a personal project from the
  visitor's own browser storage, opened in the **editor**.

## Read-only, with a one-click fork

A shared map is never auto-saved. The reader can press **Edit map** to fork a
personal copy into their browser (`?demo`), which is where editing and
auto-save begin — the shared file itself is never modified.

## Publishing a map

1. In the app, build the map and use **Save As** to export a `.json`.
2. Drop the exported file here, e.g. `data/onboarding.json`.
3. Commit and push. It is now live at `?onboarding.json`.

## Naming rules (security)

Only a **bare file name** is accepted after `?`: letters, digits, `.`, `_`, `-`,
ending in `.json`. No path segments (`/`) and no `..`, so a map can only ever be
read from this one folder — never from anywhere else on the server.

## The `demo-*` maps

These are hand-made **stress / showcase maps** for the **Show graph** picture
(`docs/svg-export.js`) — variations on the welcome map, each shaped around one
thing that is easy to get wrong. Open any of them as a graph, e.g.
`?demo-note-sizes.json`, or fork one with **Edit map** to poke at it in the editor.

Like the code and its comments, **every text in these maps is English** — node
titles and descriptions alike. A rule that comes from another language's
typography (a one-character word may not end a line) is described in English and
demonstrated with an English example. The one deliberate exception is the Czech
pangram in the *Emoji and accents* note of `demo-markdown-notes.json`, which is
there precisely because it is a line of dense diacritics.

| File | What it stresses |
|---|---|
| `demo.json` | A short intro to the sharing feature itself. |
| `demo-trip.json` | The showcase map from the project README (`docs/images/graph-example.png`): an ordinary plan whose notes use a table, a numbered list, a block quote, bold, italics, a link, and an image (`train-ticket.png`, in the *Book the train early* note). Re-shoot the screenshot from its graph view if the drawing style changes. |
| `demo-note-sizes.json` | The same branch shape five times over with notes from none to very tall. A tall gutter bubble must **not** push the branches below it down. The last leaf carries a bubble ~425 px high — the regression test for "a note is never cut off". |
| `demo-deep-nesting.json` | The welcome map with **two extra levels** grafted on (nodes down to level 5). Columns are generated per depth — deep levels must line up and connectors stay readable. |
| `demo-tree-shapes.json` | Branches of deliberately different shape: a fan of twelve leaves, a single-child chain, a lopsided branch, a **collapsed** branch (the picture ignores collapse), a long (now wrapped) label, and a childless branch. Short branches must rise into the space beside the tall fan. |
| `demo-notes-everywhere.json` | A note on **every** node, root and branches included — the worst case for placing bubbles, and the one exercising the fallback for a bubble much wider than its node. |
| `demo-label-wrapping.json` | The two label rules: labels from one line up to the five-line maximum (and one long enough to be cut with `…` past it), a URL and a compound word with no space to break at (broken mid-word), and **one-character words** (`a`, `I`, a lone digit), which must never be left at the end of a line. Its *Empty nodes* branch has seven children of which only four may be drawn — a node with no label, no description and no children is left out of the picture, while one with only a description or only children stays. |
| `demo-markdown-notes.json` | Notes full of Markdown: headings, lists, block quotes, a table, fenced code, links, an image (`train-ticket.png`), and characters that must be escaped (`<script>`, `&`, quotes, diacritics, emoji). The bubbles are real HTML inside the SVG, so escaping bugs show here. The *code wider than the bubble* branch must wrap every line and keep its indentation; the *image* branch checks that a note image reserves its height (the layout measures notes synchronously, so an unloaded image would otherwise be clipped). |

The maps share one image asset, **`train-ticket.png`** — a small illustrative
ticket referenced from a note as `![alt](data/train-ticket.png)`. Note images
are resolved to an absolute URL, so a downloaded SVG shows them only while
online (unlike the footer logo, which is embedded).

### What to look for in the picture

- no box or bubble overlapping another one;
- no connector or dashed leader line running underneath a box or a bubble;
- every note next to the node it belongs to;
- the sheet no taller than the content needs.

`<foreignObject>` — which carries the Markdown — renders in browsers but **not**
in Inkscape, librsvg, or when converting the file to PNG. Open the exported
`.svg` in a browser.
