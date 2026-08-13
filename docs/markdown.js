// UMindMap (https://pponec.github.io/UMindMap/) — Apache License 2.0
'use strict';

/*
 * A lightweight Markdown → HTML converter for the UMindMap node descriptions.
 *
 * This is a JavaScript port of Ujorm's MarkdownToHtmlConverter (ujo-web). Like
 * the Java original it builds the output directly as DOM nodes, so character
 * escaping is inherited from the DOM (text goes in via textContent / text nodes)
 * and no separate sanitization step is required. A convenience wrapper returns
 * the serialized HTML string so callers can assign it to innerHTML.
 *
 * Supported blocks: headings (1–6), unordered/ordered lists, blockquotes,
 * fenced code blocks (```), four-space/tab indented code, horizontal rules,
 * GFM tables and paragraphs (a trailing "\" forces a <br>). Supported inline:
 * `code`, **bold**, _italic_, [text](url) links and ![alt](src) images.
 *
 * An inline code span and a code block (the <pre>, fenced or indented) are both
 * marked with the class COPY_CLASS ("copy-code") and a hint in their title, so
 * the host page can offer click-to-copy on them (app.js does; the marker is
 * inert wherever nobody listens, e.g. a downloaded SVG). A block copies its
 * whole multi-line text; the fence's info string (the language) is not part of
 * the content and never reaches the output.
 *
 * Intentionally omitted (as in the Java version): nested lists, setext
 * headings, reference links, HTML pass-through, footnotes, task lists and
 * strike-through. Inline emphasis uses one non-greedy regex, so pathological
 * asterisk/underscore combinations may not match CommonMark exactly.
 */
(function (global) {

  // --- Block-level patterns --------------------------------------------
  const HEADING = /^(#{1,6})\s+(.+)$/;
  /** Ordered (1.) or unordered (-, *, +) item; group 1 is digits only for <ol>. */
  const LIST = /^(?:(\d+)\.|[*+\-])\s+(.+)$/;
  const HORIZONTAL_RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;
  const INDENTED_CODE = /^(?: {4}|\t)(.*)$/;
  const TABLE_CELL_SEP = /^:?-+:?$/;

  // --- Inline pattern ---------------------------------------------------
  // 1=backtick delimiter, 2=code, 3=alt, 4=src, 5=text, 6=href, 7=bold, 8=italic
  const INLINE = /(`+)([\s\S]+?)\1|!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]+)\]\(([^)]+)\)|\*\*([\s\S]+?)\*\*|_([\s\S]+?)_/g;

  /** Disallowed URL schemes for hyperlinks (XSS hardening). */
  const UNSAFE_HREF = /^\s*(?:javascript|vbscript|data)\s*:/i;
  /** Disallowed URL schemes for images — data: is kept for inline base64 images. */
  const UNSAFE_SRC = /^\s*(?:javascript|vbscript)\s*:/i;
  const SAFE_FALLBACK_HREF = '#';

  /** The break marker inserted between paragraph lines joined with a hard "\". */
  const BREAK = '\n';

  /** Marker class + tooltip put on every code span and code block (see the header). */
  const COPY_CLASS = 'copy-code';
  const COPY_HINT = 'Click to copy';
  const COPY_HINT_BLOCK = 'Click to copy the whole block';

  // --- DOM helpers ------------------------------------------------------

  /** Create a child element of the given tag, append it and return it. */
  function add(parent, tag) {
    const el = document.createElement(tag);
    parent.appendChild(el);
    return el;
  }

  /** Append escaped text to a parent element. */
  function addText(parent, text) {
    parent.appendChild(document.createTextNode(text));
  }

  // --- Public API -------------------------------------------------------

  /**
   * Render markdown into an existing parent DOM element. A null/empty input is
   * silently ignored. Mirrors the Java render(Element, String) method.
   */
  function renderMarkdownInto(parent, markdown) {
    if (markdown == null || markdown === '') {
      return;
    }
    const lines = String(markdown).split(/\r\n|\r|\n/);
    const st = new State(parent);
    for (let i = 0; i < lines.length; i++) {
      i = step(lines, i, st);
    }
    st.flushAll();
  }

  /** Convert markdown to an HTML string (drop-in for innerHTML assignment). */
  function renderMarkdown(markdown) {
    const container = document.createElement('div');
    renderMarkdownInto(container, markdown);
    return container.innerHTML;
  }

  // --- Line stepping ----------------------------------------------------

  /** Process a single line and return the index of the last consumed line. */
  function step(lines, i, st) {
    const raw = lines[i];
    const line = raw.trim();

    if (st.fence !== null) {
      if (line.startsWith('```')) {
        st.flushFence();
      } else {
        st.fence.push(raw);
      }
      return i;
    }
    if (line.startsWith('```')) {
      st.flushAll();
      st.fence = [];
      return i;
    }

    const indented = INDENTED_CODE.exec(raw);
    if (indented && st.canStartIndentedCode()) {
      st.appendIndentedCode(indented[1]);
      return i;
    }
    st.flushIndentedCode();

    if (line === '') {
      st.flushAll();
      return i;
    }
    if (HORIZONTAL_RULE.test(line)) {
      st.flushAll();
      add(st.parent, 'hr');
      return i;
    }
    let m;
    if ((m = HEADING.exec(line))) {
      st.flushAll();
      appendInline(add(st.parent, 'h' + m[1].length), m[2].trim());
      return i;
    }
    if (line.startsWith('>')) {
      st.appendQuote(line.substring(1).replace(/^\s+/, ''));
      return i;
    }
    st.flushQuote();

    if (line.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const headers = splitTableRow(line);
      if (headers.length) {
        st.flushAll();
        return renderTable(st.parent, headers, lines, i);
      }
    }

    if ((m = LIST.exec(line))) {
      st.appendListItem(m[1] != null ? 'ol' : 'ul', m[2].trim());
      return i;
    }
    st.endList();

    if (st.paragraph !== '') {
      st.paragraph += st.pendingBreak ? BREAK : ' ';
    }
    const hardBreak = line.endsWith('\\');
    st.paragraph += hardBreak ? line.substring(0, line.length - 1) : line;
    st.pendingBreak = hardBreak;
    return i;
  }

  // --- Tables -----------------------------------------------------------

  /** A row like |---|:--:|---:| (with optional alignment colons). */
  function isTableSeparator(row) {
    const cells = splitTableRow(row);
    if (!cells.length) {
      return false;
    }
    return cells.every((c) => TABLE_CELL_SEP.test(c));
  }

  /** Split a pipe-separated table row into trimmed cell strings. */
  function splitTableRow(row) {
    let s = row.trim();
    const start = s.startsWith('|') ? 1 : 0;
    const end = s.endsWith('|') ? s.length - 1 : s.length;
    if (start >= end) {
      return [];
    }
    return s.substring(start, end).split('|').map((p) => p.trim());
  }

  /** Render a GFM table from the header row; return the last consumed line index. */
  function renderTable(parent, headers, lines, start) {
    const table = add(parent, 'table');
    appendTableCells(add(add(table, 'thead'), 'tr'), headers, true);
    const body = add(table, 'tbody');
    let i = start + 2; // skip header + separator rows
    while (i < lines.length && lines[i].includes('|')) {
      const cells = splitTableRow(lines[i]);
      if (cells.length) {
        appendTableCells(add(body, 'tr'), cells, false);
      }
      i++;
    }
    return i - 1;
  }

  /** Append one table row, parsing inline content into <th>/<td> cells. */
  function appendTableCells(tr, cells, header) {
    for (const c of cells) {
      appendInline(add(tr, header ? 'th' : 'td'), c);
    }
  }

  // --- Inline & code rendering ------------------------------------------

  /** Render inline content, turning the BREAK marker into <br> elements. */
  function appendInline(target, text) {
    const segments = text.split(BREAK);
    for (let j = 0; j < segments.length; j++) {
      if (j > 0) {
        add(target, 'br');
      }
      tokenizeSegment(target, segments[j]);
    }
  }

  /** Emit a <pre><code> block preserving raw line breaks (escaped by the DOM).
   *  The marker goes on the <pre>, so a click anywhere in the block — its
   *  padding included — copies the whole text, blank trailing lines and all. */
  function writeCodeBlock(parent, content) {
    const pre = add(parent, 'pre');
    pre.setAttribute('class', COPY_CLASS);
    pre.setAttribute('title', COPY_HINT_BLOCK);
    add(pre, 'code').textContent = content;
  }

  /** Tokenize one inline segment into text, code, image, link, bold and italic nodes. */
  function tokenizeSegment(target, text) {
    INLINE.lastIndex = 0;
    let from = 0;
    let m;
    while ((m = INLINE.exec(text)) !== null) {
      if (m.index > from) {
        addText(target, text.slice(from, m.index));
      }
      if (m[1] != null) {                       // inline code
        const code = add(target, 'code');
        code.setAttribute('class', COPY_CLASS);
        code.setAttribute('title', COPY_HINT);
        code.textContent = normalizeCodeSpan(m[2]);
      } else if (m[3] != null) {                // image ![alt](src)
        const img = add(target, 'img');
        img.setAttribute('src', safeUrl(m[4], UNSAFE_SRC, ''));
        img.setAttribute('alt', m[3]);
      } else if (m[5] != null) {                // link [text](href)
        const a = add(target, 'a');
        a.setAttribute('href', safeUrl(m[6], UNSAFE_HREF, SAFE_FALLBACK_HREF));
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
        a.textContent = m[5];
      } else if (m[7] != null) {                // bold
        add(target, 'strong').textContent = m[7];
      } else {                                  // italic
        add(target, 'em').textContent = m[8];
      }
      from = INLINE.lastIndex;
      if (m.index === INLINE.lastIndex) {       // guard against zero-width match
        INLINE.lastIndex++;
      }
    }
    if (from < text.length) {
      addText(target, text.slice(from));
    }
  }

  /** Return the trimmed URL, or the fallback when it uses an unsafe scheme. */
  function safeUrl(url, unsafe, fallback) {
    return unsafe.test(url) ? fallback : url.trim();
  }

  /** Trim one balanced surrounding space from a code span (the Markdown rule). */
  function normalizeCodeSpan(code) {
    if (code.length > 1 && code.startsWith(' ') && code.endsWith(' ') && code.trim() !== '') {
      return code.substring(1, code.length - 1);
    }
    return code;
  }

  // --- Mutable state holder ---------------------------------------------

  /** Aggregates pending block-level state during a single render call. */
  class State {
    constructor(parent) {
      this.parent = parent;
      this.paragraph = '';
      this.list = null;
      this.listType = null;
      this.quote = null;
      this.quoteBuffer = '';
      this.fence = null;       // array of raw lines, or null
      this.indented = null;    // array of code lines, or null
      this.pendingBreak = false;
    }

    flushAll() {
      this.flushParagraph();
      this.flushQuote();
      this.flushIndentedCode();
      this.flushFence();
      this.endList();
    }

    canStartIndentedCode() {
      return this.paragraph === '' && this.list === null && this.quote === null;
    }

    flushParagraph() {
      if (this.paragraph !== '') {
        appendInline(add(this.parent, 'p'), this.paragraph);
        this.paragraph = '';
      }
      this.pendingBreak = false;
    }

    appendListItem(type, content) {
      this.flushParagraph();
      this.flushQuote();
      this.flushIndentedCode();
      if (type !== this.listType) {
        this.list = add(this.parent, type);
        this.listType = type;
      }
      appendInline(add(this.list, 'li'), content);
    }

    endList() {
      this.list = null;
      this.listType = null;
    }

    appendQuote(content) {
      this.flushParagraph();
      this.flushIndentedCode();
      this.endList();
      if (this.quote === null) {
        this.quote = add(this.parent, 'blockquote');
        this.quoteBuffer = content;
      } else {
        this.quoteBuffer += ' ' + content;
      }
    }

    flushQuote() {
      if (this.quote !== null) {
        appendInline(add(this.quote, 'p'), this.quoteBuffer);
        this.quote = null;
        this.quoteBuffer = '';
      }
    }

    flushFence() {
      if (this.fence !== null) {
        writeCodeBlock(this.parent, this.fence.join('\n'));
        this.fence = null;
      }
    }

    appendIndentedCode(content) {
      if (this.indented === null) {
        this.indented = [content];
      } else {
        this.indented.push(content);
      }
    }

    flushIndentedCode() {
      if (this.indented !== null) {
        writeCodeBlock(this.parent, this.indented.join('\n'));
        this.indented = null;
      }
    }
  }

  global.renderMarkdown = renderMarkdown;
  global.renderMarkdownInto = renderMarkdownInto;
  global.MD_COPY_CLASS = COPY_CLASS;

})(window);
