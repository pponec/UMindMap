// UMindMap (https://pponec.github.io/UMindMap/) — Apache License 2.0
/*
 * UMindMap — SVG export (Phase 2 add-on, self-contained).
 *
 * Turns the document into a two-sided mind-map drawing and opens it in a new
 * browser tab. Layout rules (see the design notes):
 *
 *   1. Root is centred. Up to 3 branches all go right; with more, the first
 *      floor(N/2) go right and the rest go left, both in source order top to
 *      bottom (the left side is mirrored, not rotated).
 *   2. A node's label is measured and, when it is too long for one line,
 *      wrapped (see fitLabel), so the box grows downwards instead of losing its
 *      end to an ellipsis. A node with nothing to show — no label, no note and
 *      no children — is left out of the picture altogether (pruneEmpty).
 *      Branches are always drawn expanded (`collapsed` is view state and is
 *      ignored here).
 *   3. Connectors are cubic Béziers; the palette is always light so the file
 *      prints and shares well regardless of the app theme.
 *   4. A node's description is drawn as a UML-style note bubble whose *space is
 *      reserved during layout* — that is what guarantees bubbles never overlap
 *      anything, instead of trying to place them afterwards:
 *        - leaf   -> the outer gutter, level with its node, sliding down past
 *                    anything already there (placeBubbles) so free gutter
 *                    space is used instead of reserved in the branch stack;
 *        - parent -> hanging straight below its own node, inside the parent's
 *                    column (never the child column), so the leader is a short
 *                    vertical drop and only the overhang below the subtree
 *                    costs any height; a bubble wider than its node can reach
 *                    into the connector fan, so that case drops the bubble
 *                    just low enough to duck under the crossing connector,
 *                    no lower (hangClearance);
 *        - root   -> the free strip below the root box (branch columns start
 *                    far to the left and right of it).
 *
 * Note bodies are real Markdown: they reuse the app's renderMarkdown() inside
 * an SVG <foreignObject>, and the browser both lays them out and measures them,
 * so the reserved height is exact. Trade-off: <foreignObject> renders in
 * browsers but not in Inkscape/librsvg or when rasterising to PNG.
 *
 * Public API (globals, matching markdown.js style):
 *   documentToSvg(doc, opts)    -> SVG source string; opts.project names the
 *                                  project in the sheet's footer
 *   labelFirstLine(text, opts)  -> the first wrapped line of a node label, for
 *                                  a caller that has room for one line only
 *   whenLogoReady()             -> promise; await it before drawing at page
 *                                  load, or the footer loses its logo
 * Showing or saving that string is the app's business, not this file's.
 */
'use strict';

(function (global) {

  /* -------------------------------------------------------------------- */
  /* Geometry and style constants                                          */
  /* -------------------------------------------------------------------- */

  const FONT_STACK =
    "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

  const PAD = 44;            // margin around the whole drawing
  const SLOT = 46;           // vertical space one plain leaf consumes
  const COL_MIN = [280, 280];// smallest gap into a note-hung depth: NOTE_W (246)
                             // plus ~LEAD clearance, so a parent's hanging bubble
                             // just clears the child column and no more (the
                             // root->1 entry is unused — the root note sits in the
                             // strip below the root, not in a column gap)
  const LINK_MIN = 120;      // shortest connector: columns grow to keep this
  const BOX_H = 34;          // node box height, for a single-line label
  const ROOT_H = 42;         // the same for the root
  const MAX_BOX_W = 460;     // a longer label is wrapped over several lines
  const MAX_LINES = 5;       // …and past this many lines the rest is dropped
                             // with an ellipsis, so no single label can blow up
                             // the whole drawing
  const PAD_Y = 8;           // space above and below a wrapped label
  const MIN_BOX_W = 40;      // width of a box with no label at all (it survives
                             // pruneEmpty only for its note or its children)
  const RADIUS = 8;

  const NOTE_W = 246;        // note bubble width
  const NOTE_MIN_H = 44;
  const NOTE_SLACK = 6;      // spare height, in case the viewer's fonts differ
                             // slightly from ours: foreignObject clips, and a
                             // bubble one line too short would lose that line
  const LEAD = 30;           // leader-line length from node to bubble
  const NOTE_GAP = 10;       // clearance a bubble keeps from anything else
  const FAN_SLICES = 6;      // pieces a connector is reserved in (see fanRects)
  const DOGEAR = 14;         // folded-corner size (always the top-right corner)

  // Sheet footer, in the bottom-right corner: logo, wordmark, the project (its
  // localStorage name) and the export date. It sits at the end of the sheet so
  // it never competes with the page hosting the picture, and it is what tells
  // a saved or forwarded file what it is and when it was made.
  const BRAND_FONT = { weight: 700, size: 17 };   // wordmark
  const META_FONT = { weight: 400, size: 12.5 };  // project / date
  const FOOT_H = 26;         // height of the footer line
  const FOOT_GAP = 18;       // space between the drawing and the footer rule
  const LOGO_PX = 20;        // drawn logo size
  const LOGO_RASTER = 36;    // pixels it is rasterised at, for zoom and print
  const LOGO_SRC = 'images/umindmap-logo.png';

  // Light palette — deliberately independent of the app theme.
  const C = {
    bg: '#ffffff',
    rootFill: '#2563eb', rootText: '#ffffff',
    branchFill: '#eef4ff', branchStroke: '#2563eb',
    leafFill: '#ffffff', leafStroke: '#c7d2e5',
    text: '#1f2328',
    link: '#9db3d6',
    noteFill: '#fffbea', noteStroke: '#e0b400', noteFlap: '#f4e7b0',
    leader: '#d9a400',
    headRule: '#e3e8ef', meta: '#6b7280',
  };

  const NOTE_CSS = `
.umnote { box-sizing: border-box; width: 100%; padding: 8px 12px 10px;
  font: 400 11.5px/1.45 ${FONT_STACK}; color: #3d3a2f;
  display: flow-root;          /* contain child margins without clipping them */
  overflow-wrap: break-word; } /* a long word wraps instead of sticking out */
.umnote .h { display: block; font: 700 9.5px/1.4 ${FONT_STACK};
  letter-spacing: .09em; color: #a07c00; margin: 0 0 4px; }
.umnote p, .umnote ul, .umnote ol, .umnote pre, .umnote blockquote,
.umnote table { margin: 0 0 5px; }
.umnote > :last-child { margin-bottom: 0; }
.umnote h1, .umnote h2, .umnote h3, .umnote h4, .umnote h5, .umnote h6 {
  font-size: 12px; margin: 0 0 4px; }
.umnote ul, .umnote ol { padding-left: 16px; }
.umnote li { margin: 0 0 2px; }
.umnote code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10.5px; background: #f3ecd0; border-radius: 3px; padding: 0 3px;
  overflow-wrap: anywhere; }
/* A pre block does not wrap by default, so a long code line used to run out of
   the bubble and be cut off. pre-wrap keeps the indentation but breaks the
   line. Never write a raw "<" in here: see the CDATA guard in documentToSvg. */
.umnote pre { background: #f3ecd0; border-radius: 4px; padding: 5px 6px;
  white-space: pre-wrap; overflow-wrap: anywhere; }
.umnote pre code { background: none; padding: 0; }
/* Click-to-copy on an inline code span works in the on-screen graph too (the
   listener is app.js's); in a downloaded file this is only a cursor hint. */
.umnote code.copy-code { cursor: pointer; }
.umnote code.copy-code.copied { background: #d7ecd0; outline: 1px solid #4a9a3c; }
.umnote blockquote { padding-left: 8px; border-left: 2px solid #e0cf8a; }
.umnote a { color: #2563eb; }
.umnote img { max-width: 100%; height: auto; }
.umnote table { border-collapse: collapse; font-size: 10.5px; max-width: 100%; }
.umnote th, .umnote td { border: 1px solid #e0cf8a; padding: 1px 4px;
  overflow-wrap: anywhere; }
`;

  /* -------------------------------------------------------------------- */
  /* Text measuring                                                        */
  /* -------------------------------------------------------------------- */

  let measureCtx = null;

  /** Lazily create the 2D context used to measure label widths. */
  function ctx() {
    if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
    return measureCtx;
  }

  /** Font of a node label at the given depth (0 = root). */
  function boxFont(depth) {
    switch (depth) {
      case 0: return { weight: 700, size: 17, padX: 18 };
      case 1: return { weight: 600, size: 15, padX: 14 };
      default: return { weight: 400, size: 14, padX: 12 };
    }
  }

  /** Measure one line of text in the given font. A descriptor may carry a ready
   *  CSS `font` shorthand (`css`) instead of weight/size: that is how a caller
   *  outside the drawing — the app's detail heading — wraps text in *its* own
   *  font rather than in the sheet's. */
  function textWidth(text, f) {
    const c = ctx();
    c.font = f.css || `${f.weight} ${f.size}px ${FONT_STACK}`;
    return c.measureText(text).width;
  }

  /** The font attributes of a <text> element — the same descriptor object that
   *  textWidth measures, so a label can never be drawn in a font it was not
   *  measured in. */
  function fontAttrs(f) {
    return `font-family="${esc(FONT_STACK)}" font-size="${f.size}"`
      + (f.weight === 400 ? '' : ` font-weight="${f.weight}"`);
  }

  /** Distance between two label lines in the given font. */
  function lineH(f) {
    return Math.round(f.size * 1.35);
  }

  /** Height of a node's box: the base height, grown only when the label
   *  actually wrapped — a map with no wrapped label is drawn exactly as before. */
  function boxHeight(lines, f, depth) {
    const base = depth === 0 ? ROOT_H : BOX_H;
    if (lines.length <= 1) return base;
    return Math.max(base, lines.length * lineH(f) + 2 * PAD_Y);
  }

  // A one-character word ("a", "v", "k", "I", "8"…). Czech typesetting leaves
  // none of them at the end of a line.
  const SOLO_RE = /^[\p{L}\p{N}]$/u;

  /** Split a label into the pieces a line break may fall between: words, except
   *  that a one-character word is glued to the word after it. Gluing is what
   *  moves such a word to the start of the next line rather than leaving it
   *  hanging at the end of this one; consecutive ones ("a v tom") glue as a run.
   *  A one-character *last* word has nothing to glue to and simply stays put. */
  function wrapChunks(label) {
    const words = label.split(/\s+/).filter(Boolean);
    const out = [];
    let i = 0;
    while (i < words.length) {
      let chunk = words[i++];
      while (i < words.length && SOLO_RE.test(chunk.slice(chunk.lastIndexOf(' ') + 1))) {
        chunk += ' ' + words[i++];
      }
      out.push(chunk);
    }
    return out;
  }

  /** Break a chunk that fits on no line at all (a long word, a URL) into pieces
   *  of at most `max`. Only ever used when there is no space to break at; every
   *  piece is non-empty, so filling always terminates. */
  function breakChunk(chunk, f, max) {
    const out = [];
    let cur = '';
    for (const ch of chunk) {
      if (cur && textWidth(cur + ch, f) > max) {
        out.push(cur.trim());
        cur = '';
      }
      cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }

  /** Greedily fill chunks into lines no wider than `max`. */
  function fillLines(chunks, f, max) {
    const lines = [];
    let cur = '';
    chunks.forEach((chunk) => {
      if (cur && textWidth(cur + ' ' + chunk, f) <= max) {
        cur += ' ' + chunk;
        return;
      }
      if (cur) lines.push(cur);
      if (textWidth(chunk, f) <= max) {
        cur = chunk;
        return;
      }
      const pieces = breakChunk(chunk, f, max);
      cur = pieces.pop();
      lines.push(...pieces);
    });
    if (cur) lines.push(cur);
    return lines;
  }

  /** The narrowest width that still needs no more than `n` lines. Filling at it
   *  balances the lines: a two-line label becomes two halves instead of one full
   *  line plus a single trailing word. */
  function balanceWidth(chunks, f, max, n) {
    let lo = 0, hi = max;
    for (let i = 0; i < 18 && hi - lo > 0.5; i++) {
      const mid = (lo + hi) / 2;
      if (fillLines(chunks, f, mid).length <= n) hi = mid; else lo = mid;
    }
    return hi;
  }

  /**
   * Fit a label into at most MAX_BOX_W: one line while it fits, otherwise
   * wrapped at spaces (mid-word only when a single word is wider than the box)
   * over at most MAX_LINES lines, the last of which is truncated with an
   * ellipsis if even that is not enough. Returns the lines and the box width.
   */
  function fitLabel(text, f) {
    const label = (text || '').trim();
    if (!label) return { lines: [], w: MIN_BOX_W };
    const max = MAX_BOX_W - 2 * f.padX;
    if (textWidth(label, f) <= max) {
      return { lines: [label], w: Math.round(textWidth(label, f) + 2 * f.padX) };
    }
    const chunks = wrapChunks(label);
    let lines = fillLines(chunks, f, max);
    if (lines.length > MAX_LINES) {
      lines = lines.slice(0, MAX_LINES);
      let cut = lines[MAX_LINES - 1];
      while (cut.length > 1 && textWidth(cut + '…', f) > max) cut = cut.slice(0, -1);
      lines[MAX_LINES - 1] = cut + '…';
    } else {
      lines = fillLines(chunks, f, balanceWidth(chunks, f, max, lines.length));
    }
    const w = lines.reduce((m, l) => Math.max(m, textWidth(l, f)), 0);
    return { lines: lines, w: Math.min(MAX_BOX_W, Math.round(w + 2 * f.padX)) };
  }

  /**
   * The first line this wrapper would produce for `text`, with an ellipsis when
   * there is more — the one-line form of a node's label. The app titles its
   * detail panel with it: that panel is there for the *description*, and a very
   * long node text would otherwise push the description off the screen. The
   * break falls at a space and leaves no one-character word behind, which a
   * plain CSS ellipsis cannot do.
   *
   * `opts.maxWidth` is the width available for the text (default: one node box)
   * and `opts.font` a CSS `font` shorthand to measure in (default: the sheet's
   * own node font), so the caller can wrap in the font it will actually draw.
   */
  function labelFirstLine(text, opts) {
    const label = (text || '').trim();
    if (!label) return '';
    const o = opts || {};
    const node = boxFont(2);
    const f = o.font ? { css: o.font, padX: 0 } : node;
    const max = o.maxWidth > 0 ? o.maxWidth : MAX_BOX_W - 2 * node.padX;
    if (textWidth(label, f) <= max) return label;
    const lines = fillLines(wrapChunks(label), f, max);
    return lines.length > 1 ? lines[0] + ' …' : label;
  }

  /* -------------------------------------------------------------------- */
  /* Note rendering and measuring                                          */
  /* -------------------------------------------------------------------- */

  /** Absolute URL for an asset referenced from a note, so the exported file
   *  (served from a blob: URL) still resolves images and links. */
  function absolute(url) {
    try {
      return new URL(url, document.baseURI).href;
    } catch (e) {
      return url;
    }
  }

  // Intrinsic size of every note image, learned by preloading it. measureNotes()
  // reads offsetHeight synchronously, long before an <img> would decode, so a
  // note image is otherwise measured at height 0 and the <foreignObject> clips
  // it. With width/height attributes carrying the real ratio (set in buildNote),
  // the browser reserves the scaled box up front — but only once the size is
  // known, which is why callers await whenNotesReady() before drawing.
  const noteImgSize = new Map(); // absolute url -> {w, h}, or null when it failed

  /** Preload one image and cache its intrinsic size; never rejects. */
  function loadImgSize(url) {
    if (noteImgSize.has(url)) return Promise.resolve();
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        noteImgSize.set(url, { w: img.naturalWidth, h: img.naturalHeight });
        resolve();
      };
      img.onerror = () => { noteImgSize.set(url, null); resolve(); };
      img.src = url;
    });
  }

  /** Absolute URLs of every Markdown image in a note tree (for preloading).
   *  Uses the real renderer, not a second image-syntax parser, so the URLs
   *  match exactly what buildNote() later looks up in the cache. */
  function noteImageUrls(node, out) {
    if (node.note) {
      const div = document.createElement('div');
      global.renderMarkdownInto(div, node.note);
      div.querySelectorAll('img[src]').forEach(
        (el) => out.push(absolute(el.getAttribute('src'))));
    }
    node.children.forEach((k) => noteImageUrls(k, out));
    return out;
  }

  /** Resolves once every note image is loaded (or has failed), so the following
   *  synchronous measureNotes() can reserve the right height. Never rejects. */
  function whenNotesReady(doc) {
    return Promise.all(noteImageUrls(doc.root, []).map(loadImgSize));
  }

  /**
   * Render one note to XHTML and measure the height it needs at NOTE_W.
   * The markup is produced with XMLSerializer (not innerHTML) because the
   * exported file is parsed as XML, where `<br>` or `<img>` would be fatal.
   */
  function buildNote(markdown, host) {
    const box = document.createElement('div');
    box.className = 'umnote';
    const head = document.createElement('span');
    head.className = 'h';
    head.textContent = '🗒 NOTE';
    box.appendChild(head);
    const body = document.createElement('div');
    global.renderMarkdownInto(body, markdown);
    body.querySelectorAll('img[src]').forEach((el) => {
      const url = absolute(el.getAttribute('src'));
      el.setAttribute('src', url);
      // Width/height attributes give the browser the aspect ratio up front, so
      // the box is reserved before the image decodes (see noteImgSize). With
      // `max-width:100%;height:auto` the height still scales when the bubble is
      // narrower than the image.
      const size = noteImgSize.get(url);
      if (size) {
        el.setAttribute('width', size.w);
        el.setAttribute('height', size.h);
      }
    });
    body.querySelectorAll('a[href]').forEach((el) => {
      el.setAttribute('href', absolute(el.getAttribute('href')));
    });
    while (body.firstChild) box.appendChild(body.firstChild);

    host.appendChild(box);
    // No upper bound: a <foreignObject> clips whatever does not fit, so a
    // capped height would silently drop the end of a long note.
    const h = Math.max(NOTE_MIN_H, Math.ceil(box.offsetHeight) + NOTE_SLACK);
    const xml = new XMLSerializer().serializeToString(box);
    host.removeChild(box);
    return { h: h, xml: xml };
  }

  /** Measure every note of the layout tree, replacing each node's `note`
   *  Markdown with the measured { h, xml } (nodes without one keep null).
   *  The hidden host carries NOTE_CSS so measuring matches the exported file. */
  function measureNotes(root) {
    const host = document.createElement('div');
    host.style.cssText =
      'position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none;' +
      'width:' + NOTE_W + 'px';
    const style = document.createElement('style');
    style.textContent = NOTE_CSS;
    host.appendChild(style);
    document.body.appendChild(host);

    const walk = (node) => {
      if (node.note) node.note = buildNote(node.note, host);
      node.children.forEach(walk);
    };
    try {
      walk(root);
    } finally {
      document.body.removeChild(host);
    }
  }

  /* -------------------------------------------------------------------- */
  /* Layout                                                                */
  /* -------------------------------------------------------------------- */

  /** Copy the document tree into a private layout tree. Layout writes plenty of
   *  scratch fields (x, y, width, side…) and must never touch the live document,
   *  whose nodes end up in undo snapshots and in localStorage. */
  function layoutTree(node) {
    return {
      text: (node.text || ''),
      note: (node.note || '').trim() || null,
      children: (node.children || []).map(layoutTree),
    };
  }

  /** Has this node anything the picture could show? An empty box with nothing
   *  hanging off it is noise, so it is dropped — but a node still counts when it
   *  carries a note, and a node with (kept) children is structure and stays. */
  function worthDrawing(node) {
    return node.text.trim() !== '' || node.note != null || node.children.length > 0;
  }

  /** Drop every node with no label, no note and no children, bottom-up, so a
   *  whole branch of empty nodes goes with them. The root is never pruned: it is
   *  what the drawing hangs from, and an empty one still says the map is empty.
   *  Runs on the private layout tree, so the document itself keeps its nodes. */
  function pruneEmpty(node) {
    node.children.forEach(pruneEmpty);
    node.children = node.children.filter(worthDrawing);
  }

  /** Split the root's branches: up to 3 all go right, otherwise the first
   *  floor(N/2) go right and the remainder left, both kept in source order. */
  function splitBranches(children) {
    const n = children.length;
    if (n <= 3) return { right: children.slice(), left: [] };
    const r = Math.floor(n / 2);
    return { right: children.slice(0, r), left: children.slice(r) };
  }

  /**
   * How far down a bubble hanging under this node must start to duck under
   * every connector that would otherwise run behind it. Only a bubble wider
   * than its node reaches into the fan at all; the cubic of linkPath is then
   * sampled in coordinates relative to the node's outer edge, using the
   * narrowest column gap the drawing can still end up with — the worst case,
   * because a short link descends soonest. A connector only threatens the
   * bubble while its horizontal offset from the node is still inside the
   * bubble's width (`out`); the cubic's x is monotonic, so once a connector
   * has swung past that width it can never re-enter it, and the highest point
   * (largest y) it reaches before that moment is exactly the clearance the
   * bubble needs — no more. Returns null when nothing needs to be dodged.
   */
  function hangClearance(node, depth, widths) {
    const out = NOTE_W - node._w;   // how far the bubble sticks past the node
    if (out <= 0) return null;
    // Same gap `columns()` will use, from the widths known so far; later
    // siblings can only widen it, which makes the link even flatter here.
    const gap = Math.max(COL_MIN[Math.min(depth, COL_MIN.length - 1)],
      (widths[depth] || 0) + LINK_MIN);
    const span = Math.max(gap - node._w, LINK_MIN);
    let clearance = null;
    node.children.forEach((child) => {
      if (child._y <= node._y) return;      // links going up stay clear
      let lastY = node._y;
      for (let i = 1; i <= 40; i++) {
        const t = i / 40;
        const x = span * (1.5 * t * (1 - t) + t * t * t);
        if (x >= out) break;                // past the bubble from here on
        lastY = node._y + (child._y - node._y) * (3 * t * t - 2 * t * t * t);
      }
      clearance = clearance == null ? lastY : Math.max(clearance, lastY);
    });
    return clearance;
  }

  /** First pass: label, width, depth and side for every node, plus the widest
   *  box per depth (which decides the column offsets). */
  function measure(node, depth, side, widths) {
    node._depth = depth;
    node._side = side;
    const f = boxFont(depth);
    const fit = fitLabel(node.text, f);
    node._lines = fit.lines;
    node._w = fit.w;
    node._h = boxHeight(fit.lines, f, depth);
    widths[depth] = Math.max(widths[depth] || 0, fit.w);
    node.children.forEach((k) => measure(k, depth + 1, side, widths));
  }

  /**
   * The area this node's connectors sweep. Reserving it keeps a neighbour's
   * bubble from ending up in the middle of a link. Each connector is cut into
   * FAN_SLICES pieces rather than taken as one bounding box: the cubic is
   * monotone in both axes, so a slice is exactly the curve's own extent there,
   * and the staircase hugs the curve instead of claiming the whole rectangle
   * between the two columns. The node's own bubble belongs to the same group
   * and is never tested against these (that case is hangClearance's job).
   */
  function fanRects(node) {
    const x1 = node._side > 0 ? node._x + node._w : node._x;
    const out = [];
    node.children.forEach((child) => {
      const x2 = node._side > 0 ? child._x : child._x + child._w;
      const span = x2 - x1;
      const drop = child._y - node._y;
      const at = (t) => ({
        x: x1 + span * (1.5 * t * (1 - t) + t * t * t),
        y: node._y + drop * (3 * t * t - 2 * t * t * t),
      });
      let a = at(0);
      for (let i = 1; i <= FAN_SLICES; i++) {
        const b = at(i / FAN_SLICES);
        out.push({
          x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), fan: true,
          w: Math.abs(b.x - a.x), h: Math.max(Math.abs(b.y - a.y), 1),
        });
        a = b;
      }
    });
    return out;
  }

  /** The rectangles a node itself occupies, once its `_y` is known. */
  function attachRects(node) {
    node._boxRect = boxRect(node);
    node._noteRect = node.note ? noteRect(node) : null;
    node._fanRects = fanRects(node);
  }

  /** Every rectangle of a placed subtree (the group that moves as one). */
  function subtreeRects(node, out) {
    const list = out || [];
    if (node._boxRect) list.push(node._boxRect);
    if (node._noteRect) list.push(node._noteRect);
    if (node._fanRects) list.push(...node._fanRects);
    node.children.forEach((k) => subtreeRects(k, list));
    return list;
  }

  /** Move a whole placed subtree down; its rectangles move with it, so the
   *  occupancy list (which holds the same objects) stays correct. */
  function shiftSubtree(node, dy) {
    node._y += dy;
    if (node._boxRect) node._boxRect.y += dy;
    if (node._noteRect) node._noteRect.y += dy;
    if (node._fanRects) node._fanRects.forEach((r) => { r.y += dy; });
    node.children.forEach((k) => shiftSubtree(k, dy));
  }

  /** Slide a freshly positioned group down until none of its rectangles touch
   *  anything already placed. Returns how far it moved. */
  function slideDown(node, placed) {
    const rects = subtreeRects(node);   // mutated in place by shiftSubtree
    const own = new Set(rects);         // the group's own rectangles never count
    let moved = 0;
    for (let guard = 0; guard < 200; guard++) {
      let delta = 0;
      for (const r of rects) {
        for (const p of placed) {
          if (!own.has(p) && collides(r, p)) {
            delta = Math.max(delta, p.y + p.h + NOTE_GAP - r.y);
          }
        }
      }
      if (delta <= 0) break;
      shiftSubtree(node, delta);
      moved += delta;
    }
    return moved;
  }

  /**
   * Second pass: give one side its y positions. Leaves are handed out on a
   * plain SLOT grid (so the reading order is fixed) and a parent sits at the
   * mean of its children — but each node, together with its bubble and its
   * whole subtree, is a rigid group that slides down only as far as a real
   * rectangle collision demands. That is what lets a branch rise into the
   * space beside a tall note instead of below it: a long note costs height
   * only in the column it actually occupies.
   */
  function placeSide(branches, widths) {
    const placed = [];        // every rectangle occupied on this side
    const state = { cursor: 0 };

    const place = (node) => {
      const kids = node.children;
      if (!kids.length) {
        // A wrapped label makes the box taller than one SLOT; the leaf then
        // takes the room it needs, keeping the same air above and below it.
        const slot = Math.max(SLOT, node._h + SLOT - BOX_H);
        node._y = state.cursor + slot / 2;
        attachRects(node);
        slideDown(node, placed);
        state.cursor = node._y + slot / 2;
      } else {
        kids.forEach(place);
        node._y = (kids[0]._y + kids[kids.length - 1]._y) / 2;
        if (node.note) {
          const clearance = hangClearance(node, node._depth, widths);
          if (clearance != null) {
            // A connector would run behind the default position: drop the
            // bubble just low enough to duck under it, instead of pushing it
            // beneath the whole subtree (which includes descendants' own
            // note bubbles, sitting in an entirely different column and thus
            // never a real threat to this one).
            const defaultTop = node._y + node._h / 2 + LEAD;
            const top = Math.max(defaultTop, clearance + NOTE_GAP);
            node._lane = top + node.note.h / 2;
          }
        }
        attachRects(node);
        state.cursor += slideDown(node, placed);
      }
      placed.push(node._boxRect, ...node._fanRects);
      if (node._noteRect) placed.push(node._noteRect);
    };

    branches.forEach(place);
    if (!placed.length) return { top: 0, bottom: 0 };
    return {
      top: placed.reduce((m, r) => Math.min(m, r.y), Infinity),
      bottom: placed.reduce((m, r) => Math.max(m, r.y + r.h), -Infinity),
    };
  }

  /** Column offsets per depth. Each column is pushed out far enough that even
   *  the widest box of the previous depth still leaves a readable connector,
   *  so wide labels stretch the drawing instead of colliding. The wide COL_MIN
   *  floor exists only so a parent's hanging note bubble (width NOTE_W) clears
   *  the child column; on a depth where no parent hangs a note (`hangDepths`)
   *  that reservation is pure wasted gap, so there the column shrinks to the
   *  LINK_MIN connector and the boxes sit close together. */
  function columns(widths, depth, hangDepths) {
    const colX = [0];
    for (let d = 1; d <= depth; d++) {
      const prev = d === 1 ? (widths[0] || 0) / 2 : (widths[d - 1] || 0);
      const min = hangDepths[d - 1] ? COL_MIN[Math.min(d - 1, COL_MIN.length - 1)] : 0;
      colX.push(colX[d - 1] + Math.max(min, prev + LINK_MIN));
    }
    return colX;
  }

  /** Assign x positions: every depth is its own column, mirrored on the left. */
  function assignX(node, colX) {
    const d = node._depth;
    node._x = node._side > 0 ? colX[d] : -colX[d] - node._w;
    node._cx = node._x + node._w / 2;
    node.children.forEach((k) => assignX(k, colX));
  }

  /** Rectangle of a node's note bubble, per placement rules 4a–4c. */
  function noteRect(node) {
    const h = node.note.h;
    if (node._depth === 0) {                       // root: free strip below it
      return { x: -NOTE_W / 2, y: node._y + node._h / 2 + LEAD, w: NOTE_W, h: h, kind: 'root' };
    }
    if (!node.children.length) {                   // leaf: outer gutter
      const x = node._side > 0
        ? node._x + node._w + LEAD
        : node._x - LEAD - NOTE_W;
      return { x: x, y: node._y - h / 2, w: NOTE_W, h: h, kind: 'leaf' };
    }
    // Parent: flush with the node's inner edge, so it never reaches into the
    // corridor the incoming connector arrives through, nor into the child
    // column (COL_MIN > NOTE_W keeps it out of that either way). Normally it
    // hangs right below the node; `_lane` is the fallback for a bubble so much
    // wider than its node that it would sit in the outgoing fan.
    const x = node._side > 0 ? node._x : node._x + node._w - NOTE_W;
    const y = node._lane != null ? node._lane - h / 2 : node._y + node._h / 2 + LEAD;
    return { x: x, y: y, w: NOTE_W, h: h, kind: 'parent' };
  }

  /** Rectangle a node's box occupies. */
  function boxRect(node) {
    return { x: node._x, y: node._y - node._h / 2, w: node._w, h: node._h };
  }

  /** Do two rectangles touch? Drawn shapes keep a clearance between them; a
   *  connector corridor is a bare area, so merely sitting against its edge —
   *  which every bubble flush with a column does — must not count. */
  function collides(a, b) {
    const m = (a.fan || b.fan) ? 0 : NOTE_GAP;
    return a.x < b.x + b.w + m && b.x < a.x + a.w + m
      && a.y < b.y + b.h + m && b.y < a.y + a.h + m;
  }

  /** Lay the (already measured) layout tree out and collect flat draw lists.
   *  Order: labels and widths -> column offsets and x -> y placement, because
   *  the vertical pass tests real rectangles and so needs the x positions. */
  function layout(root) {
    const { right, left } = splitBranches(root.children);
    const widths = [];
    const rootFont = boxFont(0);
    const fit = fitLabel(root.text, rootFont);
    root._depth = 0;
    root._side = 1;
    root._lines = fit.lines;
    root._w = fit.w;
    root._h = boxHeight(fit.lines, rootFont, 0);
    widths[0] = root._w;
    right.forEach((b) => measure(b, 1, 1, widths));
    left.forEach((b) => measure(b, 1, -1, widths));

    // Which depths actually have a parent hanging a note bubble in its own
    // column? Only those depths need the wide COL_MIN gap (see columns()). The
    // root is excluded: its note sits centred in the free strip below it, not
    // in a column gap, so it never needs a wider root->depth-1 column.
    const hangDepths = [];
    const scanHang = (node) => {
      if (node._depth > 0 && node.children.length && node.note) {
        hangDepths[node._depth] = true;
      }
      node.children.forEach(scanHang);
    };
    scanHang(root);

    const colX = columns(widths, widths.length - 1, hangDepths);
    root._x = -root._w / 2;
    root._cx = 0;
    right.forEach((b) => assignX(b, colX));
    left.forEach((b) => assignX(b, colX));

    const spanR = placeSide(right, widths);
    const spanL = placeSide(left, widths);
    const hR = spanR.bottom - spanR.top;
    const hL = spanL.bottom - spanL.top;
    const height = Math.max(hR, hL, SLOT);
    right.forEach((b) => shiftSubtree(b, (height - hR) / 2 - spanR.top));
    left.forEach((b) => shiftSubtree(b, (height - hL) / 2 - spanL.top));

    root._y = height / 2;
    attachRects(root);

    const boxes = [];
    const links = [];
    const bubbles = [];
    const collect = (node) => {
      boxes.push(node);
      if (node._noteRect) bubbles.push({ node: node, note: node.note, rect: node._noteRect });
      node.children.forEach((k) => { links.push([node, k]); collect(k); });
    };
    collect(root);
    return { boxes: boxes, links: links, bubbles: bubbles };
  }

  /* -------------------------------------------------------------------- */
  /* SVG emitting                                                          */
  /* -------------------------------------------------------------------- */

  /** Escape a string for use as XML text or an attribute value. */
  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** Round to 1 decimal — keeps the file small and diff-friendly. */
  function r(n) {
    return Math.round(n * 10) / 10;
  }

  /** Half-height of a node's box (a wrapped label makes it taller). */
  function halfH(node) {
    return node._h / 2;
  }

  /** Cubic Bézier from a parent's side edge to a child's facing edge. */
  function linkPath(parent, child) {
    const right = child._side > 0;
    const x1 = right ? parent._x + parent._w : parent._x;
    const x2 = right ? child._x : child._x + child._w;
    const y1 = parent._y;
    const y2 = child._y;
    const dx = (x2 - x1) / 2;
    return `M${r(x1)},${r(y1)} C${r(x1 + dx)},${r(y1)} ${r(x2 - dx)},${r(y2)} ${r(x2)},${r(y2)}`;
  }

  /** Dashed leader from a node to its bubble: horizontal for a leaf (outer
   *  gutter), a short vertical drop for a parent or the root. */
  function leaderPath(node, rect) {
    if (rect.kind === 'leaf') {
      const right = node._side > 0;
      const x1 = right ? node._x + node._w : node._x;
      const x2 = right ? rect.x : rect.x + rect.w;
      return `M${r(x1)},${r(node._y)} L${r(x2)},${r(rect.y + rect.h / 2)}`;
    }
    return `M${r(node._cx)},${r(node._y + halfH(node))} L${r(node._cx)},${r(rect.y)}`;
  }

  /** Node box: rounded rect plus its label, vertically centred — one <text>
   *  whose lines are <tspan>s, each re-anchored on the same vertical.
   *  A one-line label is centred in its box; a wrapped one is set flush left
   *  (the box is exactly the widest line wide, so the short lines are what a
   *  ragged right edge is made of, and centring them only looks unsettled). */
  function boxSvg(node) {
    const isRoot = node._depth === 0;
    const h = node._h;
    const f = boxFont(node._depth);
    const fill = isRoot ? C.rootFill : node._depth === 1 ? C.branchFill : C.leafFill;
    const stroke = isRoot ? C.rootFill : node._depth === 1 ? C.branchStroke : C.leafStroke;
    const colour = isRoot ? C.rootText : C.text;
    const wrapped = node._lines.length > 1;
    const lh = lineH(f);
    const first = node._y - (node._lines.length - 1) * lh / 2;
    const x = wrapped ? node._x + f.padX : node._cx;
    const spans = node._lines.map((line, i) =>
      `<tspan x="${r(x)}"${i ? ` dy="${lh}"` : ''}>${esc(line)}</tspan>`).join('');
    const label = node._lines.length
      ? `<text x="${r(x)}" y="${r(first)}" text-anchor="${wrapped ? 'start' : 'middle'}" ` +
        `dominant-baseline="central" fill="${colour}" ${fontAttrs(f)}>${spans}</text>`
      : '';
    return (
      `<g><rect x="${r(node._x)}" y="${r(node._y - h / 2)}" width="${r(node._w)}" ` +
      `height="${r(h)}" rx="${isRoot ? RADIUS + 2 : RADIUS}" fill="${fill}" stroke="${stroke}" ` +
      `stroke-width="${node._depth <= 1 ? 1.5 : 1}"/>${label}</g>`
    );
  }

  /** UML-style note bubble: paper with a folded top-right corner, the folded
   *  flap, and the Markdown body in a <foreignObject>. */
  function bubbleSvg(b) {
    const { x, y, w, h } = b.rect;
    const paper =
      `M${r(x)},${r(y)} H${r(x + w - DOGEAR)} L${r(x + w)},${r(y + DOGEAR)} ` +
      `V${r(y + h)} H${r(x)} Z`;
    const flap = `M${r(x + w - DOGEAR)},${r(y)} V${r(y + DOGEAR)} H${r(x + w)} Z`;
    return (
      `<g><path d="${paper}" fill="${C.noteFill}" stroke="${C.noteStroke}" stroke-width="1"/>` +
      `<path d="${flap}" fill="${C.noteFlap}" stroke="${C.noteStroke}" stroke-width="1"/>` +
      `<foreignObject x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}">` +
      `${b.note.xml}</foreignObject></g>`
    );
  }

  /* ---- Sheet footer: logo, wordmark, project, date ---- */

  // The logo is rasterised from the app's own file, so images/umindmap-logo.png
  // stays the single source of truth. Loading starts here and is long finished
  // by the time anyone clicks; if it is not (or the canvas is tainted, as under
  // file://), the footer simply carries no picture. The 1 MB original is never
  // embedded — it is drawn small and re-encoded.
  let logoUri = null;
  const logoLoaded = new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        try {
          const c = document.createElement('canvas');
          c.width = c.height = LOGO_RASTER;
          c.getContext('2d').drawImage(img, 0, 0, LOGO_RASTER, LOGO_RASTER);
          logoUri = c.toDataURL('image/png');
        } catch (e) {
          // Tainted canvas — the usual cause is running from file://. The
          // footer stays text-only; say why, or it looks like a bug.
          logoUri = null;
          console.warn('UMindMap: the picture is signed without the logo '
            + '(the canvas is tainted — serve the app over http):', e);
        }
        resolve();
      };
      img.onerror = () => {
        console.warn('UMindMap: logo not found at ' + LOGO_SRC
          + ' — the picture is signed without it.');
        resolve();
      };
      img.src = LOGO_SRC;
    } catch (e) {
      resolve();
    }
  });

  /** Resolves once the logo is ready — or once it is certain it never will be.
   *  Drawing straight after page load would otherwise race the 1 MB source
   *  image and produce a footer with no logo, which is exactly what the graph
   *  view does. Never rejects, so a caller can always just await it. */
  function whenLogoReady() {
    return logoLoaded;
  }

  /** Today as yyyy-MM-dd, in the exporter's own timezone (not UTC). */
  function isoDate() {
    const d = new Date();
    const pad2 = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  /** The footer's caption: project and date, whichever of them exist. */
  function footerMeta(project) {
    return [project, isoDate()].filter(Boolean).join('  ·  ');
  }

  /** How wide the footer is, so a small map is not narrower than its own credit. */
  function footerWidth(project) {
    const logo = logoUri ? LOGO_PX + 10 : 0;
    return 2 * PAD + logo + textWidth('UMindMap', BRAND_FONT) + 10
      + textWidth(footerMeta(project), META_FONT);
  }

  /**
   * The footer, aligned to the bottom-right corner: logo, "UMindMap", the
   * project's localStorage name and the export date, over a hairline.
   */
  function footerSvg(project, width, height) {
    const meta = footerMeta(project);
    const metaW = textWidth(meta, META_FONT);
    const brandW = textWidth('UMindMap', BRAND_FONT);
    const logoW = logoUri ? LOGO_PX + 10 : 0;
    const right = width - PAD;
    const top = height - PAD - FOOT_H;             // top of the footer band
    const mid = top + FOOT_H / 2;                  // its centre line
    const brandX = right - metaW - 10 - brandW;
    const parts = [
      `<path d="M${PAD},${r(top - FOOT_GAP / 2)} H${r(right)}" stroke="${C.headRule}" ` +
      `stroke-width="1"/>`,
      `<text x="${r(brandX)}" y="${r(mid)}" dominant-baseline="central" ` +
      `fill="${C.rootFill}" ${fontAttrs(BRAND_FONT)}>UMindMap</text>`,
      `<text x="${r(right)}" y="${r(mid)}" text-anchor="end" dominant-baseline="central" ` +
      `fill="${C.meta}" ${fontAttrs(META_FONT)}>${esc(meta)}</text>`,
    ];
    if (logoUri) {
      parts.push(
        `<image x="${r(brandX - logoW)}" y="${r(mid - LOGO_PX / 2)}" width="${LOGO_PX}" ` +
        `height="${LOGO_PX}" href="${logoUri}"/>`);
    }
    return parts.join('\n');
  }

  /**
   * Build the whole SVG document source for the given map.
   * `opts.project` is the project's localStorage name, shown in the header.
   */
  function documentToSvg(doc, opts) {
    const project = (opts && opts.project) || '';
    const root = layoutTree(doc.root);
    pruneEmpty(root);
    measureNotes(root);
    const scene = layout(root);

    // Bounding box over every drawn shape.
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const grow = (x1, y1, x2, y2) => {
      minX = Math.min(minX, x1); maxX = Math.max(maxX, x2);
      minY = Math.min(minY, y1); maxY = Math.max(maxY, y2);
    };
    scene.boxes.forEach((n) => {
      grow(n._x, n._y - halfH(n), n._x + n._w, n._y + halfH(n));
    });
    scene.bubbles.forEach((b) => {
      grow(b.rect.x, b.rect.y, b.rect.x + b.rect.w, b.rect.y + b.rect.h);
    });

    const foot = FOOT_GAP + FOOT_H;                // band reserved at the bottom
    const width = Math.max(Math.ceil(maxX - minX + 2 * PAD), Math.ceil(footerWidth(project)));
    const height = Math.ceil(maxY - minY + 2 * PAD + foot);
    const dx = (width - (maxX - minX)) / 2 - minX; // centre a map narrower than the footer
    const dy = PAD - minY;

    const parts = [];
    parts.push(
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
      `width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`);
    parts.push(`<title>${esc((doc.root.text || 'UMindMap').trim())}</title>`);
    // The file is parsed as XML, where a "<" inside <style> would start a tag,
    // so the CSS is wrapped in CDATA. The markers sit inside CSS comments as
    // well, so that inlining this SVG into an HTML page — where <style> is raw
    // text and CDATA means nothing — leaves valid CSS either way.
    parts.push(`<style>/* <![CDATA[ */${NOTE_CSS}/* ]]> */</style>`);
    parts.push(`<rect width="${width}" height="${height}" fill="${C.bg}"/>`);
    parts.push(footerSvg(project, width, height));
    parts.push(`<g transform="translate(${r(dx)},${r(dy)})">`);

    parts.push(`<g fill="none" stroke="${C.link}" stroke-width="2" stroke-linecap="round">`);
    scene.links.forEach(([p, c]) => parts.push(`<path d="${linkPath(p, c)}"/>`));
    parts.push('</g>');

    parts.push(
      `<g fill="none" stroke="${C.leader}" stroke-width="1.4" stroke-dasharray="4 4">`);
    scene.bubbles.forEach((b) => parts.push(`<path d="${leaderPath(b.node, b.rect)}"/>`));
    parts.push('</g>');

    scene.bubbles.forEach((b) => parts.push(bubbleSvg(b)));
    scene.boxes.forEach((n) => parts.push(boxSvg(n)));

    parts.push('</g></svg>');
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + parts.join('\n') + '\n';
  }

  global.documentToSvg = documentToSvg;
  global.labelFirstLine = labelFirstLine;
  global.whenLogoReady = whenLogoReady;
  global.whenNotesReady = whenNotesReady;

})(window);