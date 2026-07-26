# UMindMap <sub><img src="docs/images/umindmap-logo.png" alt="UMindMap logo" height="80"></sub>

**Think in an outline, share as a picture.**

UMindMap is a minimalist, self-hosted mind-mapping application where you **write the map as a nested list instead of drawing it on a canvas**.
Although UMindMap allows you to share diagrams, it is primarily designed for personal use.
The outline directly represents the tree structure: every node has a title and an optional Markdown description.
From this textual representation, UMindMap automatically generates a balanced graphical mind map while preserving the order of the nodes.
One HTML file, plain JavaScript, no build step, no account, no cloud.
Your maps live in your browser and in `.json` files you own.

**▶ Try it live:** **https://pponec.github.io/UMindMap/?welcome**

[![A map exported by UMindMap](docs/images/graph-example.png)](docs/images/graph-example.png)

<sup>The picture above is real UMindMap output — every node, every description, one SVG file.
Click it for full size.</sup>

## Two modes, one document

### ✍️ Edit — hands stay on the keyboard

The editor is an **outliner**: a nested list you grow by typing.
Unlike traditional mind-map editors, you never position nodes manually.
The text structure is the source of truth, and the graphical layout is generated automatically.

| Key | Does |
|---|---|
| <kbd>Enter</kbd> | new node below |
| <kbd>Tab</kbd> / <kbd>Shift</kbd>+<kbd>Tab</kbd> | indent / outdent |
| <kbd>↑</kbd> <kbd>↓</kbd> | move between nodes |
| <kbd>Alt</kbd>+<kbd>↑</kbd> / <kbd>Alt</kbd>+<kbd>↓</kbd> | reorder among siblings |
| <kbd>Alt</kbd>+<kbd>Enter</kbd> | write a **description** (Markdown) |
| <kbd>Backspace</kbd> on an empty node | delete it, keep its children |
| <kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> | undo / redo |

The mouse is welcome too: drag the ⠿ grip to move a branch anywhere, click ▸ / ▾ to fold one away.

### 🖼 Present — one click to a picture

**Show graph** transforms the outline into a graphical mind map: the root in the middle, branches fanning left and right, curved connectors, and every description drawn as a note beside the node it belongs to — **rendered Markdown**, with lists, tables, code and links intact.

- The layout is computed for you, and packs itself so a long note never pushes the rest of the map down.
- Always light, whatever your theme, so it prints and shares well.
- The picture signs itself: logo, project name and export date in the corner.
- **Download SVG** saves it; text stays text, so it scales to any size.

## Why you might like it

- **Write first, arrange never.**
  Focus on your ideas in a keyboard-friendly outline while UMindMap takes care of the visual layout.
- **Your data stays yours.**
  Everything is auto-saved in your browser; *Save* and *Open* move plain `.json` files to and from your disk.
  Nothing is ever sent to a server — there is no server.
  (Which also means sharing is a deliberate act: [send the file](#where-your-maps-live--and-how-to-share-one).)
- **Nothing to install.**
  Copy `docs/` onto any static host — or open it straight from GitHub Pages, as above.
- **Nothing to learn.**
  If you can write a bullet list, you can use it.
- **No lock-in and no bloat.**
  Around 3 000 lines of vanilla JavaScript, zero dependencies, Apache License 2.0.

## Desktop first

UMindMap is built around a keyboard, and it shows.
On a phone — Android in particular — the on-screen keyboard opens as soon as you touch a node and covers a good part of the screen, which leaves little room for the map you are editing.
Reading a map, folding branches and looking at the picture are fine on a small screen; typing into one is cramped.
Making the phone a comfortable place to *write* a map is not on the roadmap.

## Quick start

Open the `run.html` page in your browser from the project root directory.
You can also run the application on a local server.