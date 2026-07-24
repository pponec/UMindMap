# UMind <sub><img src="docs/images/umind-logo.png" alt="UMind logo" height="80"></sub>

**Think in an outline. Share it as a picture.**

UMind is a minimalist, self-hosted mind-mapping app built around a simple idea:
your thoughts already have structure—you shouldn't have to fight a canvas to
visualize them.

Write your ideas as a nested outline, then turn them into a clean SVG mind map
with a single click. No account, no cloud, no build step, no dependencies.
Everything runs locally in your browser, and every map is stored as a plain
`.json` file that you fully own.

**▶ Try it live:** **https://pponec.github.io/UMind/?welcome**

[![A map exported by UMind](docs/images/graph-example.png)](docs/images/graph-example.png)

<sup>The image above is an actual UMind export. Every node, every description,
and the entire layout are contained in a single SVG file. Click it to view the
full-size version.</sup>

## Two modes, one document

UMind lets you work in two complementary ways without switching between
different files or views.

### ✍️ Edit — keep your hands on the keyboard

The editor is an **outliner**: a nested list that grows naturally as you type.
There is no canvas to arrange manually, no boxes to drag around, and no layout
to tweak—the outline itself defines the mind map.

| Key | Action |
|---|---|
| <kbd>Enter</kbd> | create a new node below |
| <kbd>Tab</kbd> / <kbd>Shift</kbd>+<kbd>Tab</kbd> | indent / outdent |
| <kbd>↑</kbd> <kbd>↓</kbd> | move between nodes |
| <kbd>Alt</kbd>+<kbd>↑</kbd> / <kbd>Alt</kbd>+<kbd>↓</kbd> | reorder sibling nodes |
| <kbd>Alt</kbd>+<kbd>Enter</kbd> | edit the node **description** (Markdown) |
| <kbd>Backspace</kbd> on an empty node | delete the node while keeping its children |
| <kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> | undo / redo |

Prefer using a mouse? That's supported too. Drag the ⠿ handle to move an entire
branch, or click ▸ / ▾ to collapse and expand parts of the outline.

### 🖼 Present — one click to a picture

**Show graph** transforms the current document into a balanced two-sided mind
map: the root stays in the center, branches grow to both sides, curved
connectors keep the structure readable, and every description appears as a note
next to its node.

Descriptions are rendered as real **Markdown**, preserving lists, tables, code
blocks, links and other formatting.

The rendering engine automatically optimizes the layout:

- Long notes are packed efficiently without disrupting the rest of the map.
- The exported graph always uses a clean light theme for printing and sharing.
- Every image includes the project logo, project name and export date.
- **Download SVG** exports a fully scalable vector graphic with selectable text.

## Why UMind?

- **Your data stays yours.** Everything is stored locally in your browser.
  **Save** and **Open** work with plain `.json` files that you control. Nothing
  is ever sent to a server—because there is no server.
- **Nothing to install.** Copy the `docs/` folder to any static web host or use
  the project directly from GitHub Pages.
- **Nothing new to learn.** If you can write a bulleted list, you already know
  how to use UMind.
- **No lock-in, no bloat.** About 3,000 lines of vanilla JavaScript, zero
  dependencies, Apache 2.0 licensed.

## Desktop first

UMind is designed around keyboard-driven editing, and it shows.

On phones—especially Android devices—the on-screen keyboard appears as soon as
you focus a node, leaving little room for the map itself. Reading a map,
collapsing branches and viewing the generated graph work well on small screens,
but editing a larger outline quickly becomes cramped.

Making mobile editing as comfortable as desktop editing is currently **not**
part of the roadmap.

## Quick start

```bash
python3 run.py       # then open http://localhost:8000/
```

No Python? `java Run.java` does the same (Java&nbsp;17+, no build step
required). Both launchers accept an optional port:

```bash
python3 run.py 9000
```

A plain static web server works as well:

```bash
python3 -m http.server -d docs 8000
```

Opening `docs/index.html` via `file://` also works, but some browsers disable
`localStorage` for local files. In that case, use **Save** and **Open** to keep
your maps as `.json` files instead.

## Where your maps live — and how to share one

**Your maps live in your browser—and nowhere else.**

Every change is automatically saved to the browser's **localStorage** under the
project name. There is no server, no account and no synchronization: nothing
you type ever leaves your machine.

`localStorage` is a standard browser feature, so auto-save requires no browser
extensions, no special permissions and no specific browser. The only
browser-dependent feature is writing changes back to an existing file on disk,
which relies on the File System Access API and is therefore currently available
only in Chromium-based browsers.

Elsewhere, **Save** simply downloads the file, while **Open** lets you select it
again. For the most consistent behaviour, run the app over `http://` rather than
opening it directly via `file://`, where some browsers disable persistent
storage.

A map is therefore **private to a single browser on a single device**. It is
not visible to anyone else, and it does not automatically appear on another
computer, another browser or your phone. Clearing the browser's site data
removes it.

**To share a map—or move it elsewhere—share the file:**

1. Click **Save** (or **Save As…**) to write the entire document to a `.json`
   file.
2. Send the file, place it in a shared folder or commit it to a repository—it
   is plain text.
3. The recipient simply clicks **Open…** and selects the file.

For a read-only version that anyone can view without UMind, use:

**Show graph → Download SVG**

The result is a single self-contained SVG image that opens in any modern
browser.

## The address bar is part of the app

The URL query identifies the current project and can optionally end with
`/graph`. Remove the suffix and you return to editing the same map.

| URL | Opens |
|---|---|
| `…/UMind/` | the project you last opened |
| `…/UMind/?my-map` | the project named `my-map` |
| `…/UMind/?my-map/graph` | its graph view |
| `…/UMind/?demo.json` | a published **shared** read-only map (see below) |
| `…/UMind/?welcome` | the interactive welcome map |

> **A link is not a copy.** `?my-map` refers to a project stored in *your own*
> browser. Sending that URL to someone else opens *their* browser, where no such
> project exists. To share your work, send the `.json` file instead.

`?welcome` is the exception because it contains no user data. It is always safe
to share: the welcome map is only a preview, it is never saved automatically,
your own projects remain untouched, and simply reloading the page returns you to
your work.

**The `.json` suffix changes the behaviour.**

A name **without** the suffix—for example `?my-map`—opens a **private** project
stored in your own browser.

A name **ending with** `.json`—for example `?demo.json`—loads a published file
from the application's `data/` directory:

```text
https://pponec.github.io/UMind/?demo.json
```

A shared map:

- opens as a read-only graph,
- is never auto-saved,
- is reloaded from the published file on every visit.

This is the only kind of URL that can reliably be shared with other people,
because everyone sees exactly the same content.

Clicking **Edit map** creates a private editable copy in the visitor's browser
without modifying the published file.

Publishing your own shared map is as simple as placing a `.json` file into
`docs/data/` (see **Try the demo maps** below).

## Images in node descriptions

Descriptions use standard Markdown, so images can be embedded with
`![alt](src)`. How the `src` path is resolved depends entirely on the browser's
security model.

| `src` value | Result |
|---|---|
| `https://example.com/pic.png` | Loaded from that server. Works everywhere. |
| `images/pic.png` (relative) | Resolved relative to the page origin (for example `https://…github.io/UMind/images/pic.png`). The image must therefore be deployed alongside the application—it is never read from the visitor's local disk. |
| `file:///home/me/pic.png` | **Blocked.** Browsers do not allow a page served over `http` or `https` to load files directly from the local filesystem. |
| `data:image/png;base64,…` | Embedded directly into the document. Works everywhere, but remember that the image becomes part of the JSON document and `localStorage`, so keep it reasonably small. |

**A hosted page cannot reference images from the local filesystem** (`file://`),
including pages served from GitHub Pages.

To use a local image, copy it into the project—for example
`docs/images/logo.png`—start one of the local launchers above, and reference it
from your description:

```markdown
![UMind logo](images/logo.png)
```

The browser will request:

```text
http://localhost:8000/images/logo.png
```

The same relative reference continues to work after deployment, provided the
image is committed to the repository and published together with the app.

## Under the hood

The entire application consists of a handful of static files in **`docs/`**:

- `index.html`
- `app.js`
- `markdown.js`
- `svg-export.js`
- `welcome.js`
- `style.css`

This is exactly what GitHub Pages publishes when configured with
**Deploy from a branch → `/docs`**.

- **Vanilla JavaScript.** Not a version, but an approach: no framework, no
  library, no bundler, no polyfills and no ES modules—just ordinary
  `<script src="…">` tags.

- **ECMAScript 2017.** The newest language feature in use is `async` / `await`.
  No optional chaining or other ES2020+ syntax is required.

- **Runs in all modern evergreen browsers.** Chrome/Edge 105+, Safari 15.4+
  and Firefox 118+. The practical limitations come from CSS masks and
  Pointer Events rather than JavaScript itself.

- **Native file saving where available.** Chromium browsers use the File System
  Access API to write directly back to an existing file. Other browsers fall
  back to downloading the file and reopening it through the file picker.

- **Custom Markdown renderer.** UMind uses its own JavaScript port of Ujorm's
  `MarkdownToHtmlConverter`. It builds DOM nodes directly rather than generating
  HTML strings, so text is escaped safely by construction.

## Security

UMind consists entirely of HTML, CSS and JavaScript running inside the visitor's
browser. That is not a shortcut—it is the security model. Because the
application is designed to run from static hosting such as **GitHub Pages**, it
is worth explaining exactly what it can—and cannot—do.

- **JavaScript cannot access your computer.** Browser sandboxing prevents web
  pages from reading arbitrary files, listing folders or launching programs.
  UMind stores data only in its own `localStorage` area and accesses the disk
  exclusively through the file picker that **you** open with **Save** or
  **Open**. Nothing scans your drive, because browsers simply do not expose such
  an API.

- **Static hosting executes no application code.** GitHub Pages—and any other
  static web host—simply serves files. There is no backend, no database, no
  sessions and no user accounts. Since nothing you type is ever uploaded, the
  server cannot collect or store your data.

- **Shared maps are strictly read-only.** A URL such as `?name.json` loads only
  files from the application's own `data/` directory. The filename must match
  `/^[a-z0-9._-]+\.json$/i`; path traversal (`..`) is rejected and requests are
  restricted to the same origin. Clicking **Edit map** creates a private copy in
  your browser and never modifies the published file.

- **Markdown is rendered, never executed.** Descriptions are converted into DOM
  nodes using `textContent`, not `innerHTML`, so all user text is escaped by
  default. Links using the `javascript:`, `vbscript:` and `data:` schemes are
  rejected (images may still use `data:`). References to `file://` resources are
  blocked by the browser itself.

Because UMind has no server-side logic, the most a hosted instance can do is
display a map—and, just as importantly, it cannot learn anything about the
person viewing it.