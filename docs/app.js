// UMindMap (https://pponec.github.io/UMindMap/) — Apache License 2.0
/*
 * UMindMap — Phase 0 outliner prototype (vanilla JS, no dependencies).
 *
 * Single source of truth: the `doc` object. `render()` is a pure function of
 * state that rebuilds the DOM. Structural edits mutate `doc`, snapshot for
 * undo, then re-render. Plain typing syncs text into `doc` without a re-render
 * so the caret is never disturbed.
 *
 * See assignment.md §3 (data model), §4 (keys), §5 (edge cases).
 */
'use strict';

/* ---------------------------------------------------------------------- */
/* Application identity                                                   */
/* ---------------------------------------------------------------------- */

// Stamped into every exported document (see serialise). Bump APP_VERSION when
// the released app changes; APP_HOME is the project's home page — the GitHub
// repository, which carries the app's documentation and a link to run it live,
// and which the toolbar wordmark links to.
const APP_NAME = 'UMindMap';
const APP_VERSION = '1.0.1';
const APP_HOME = 'https://github.com/pponec/UMindMap';

/* ---------------------------------------------------------------------- */
/* Data model                                                             */
/* ---------------------------------------------------------------------- */

/** Generate a short, client-side node id, e.g. "n_3f9k". */
function genId() {
  return 'n_' + Math.random().toString(36).slice(2, 8);
}

/** Create a fresh node with the given text (empty by default). */
function makeNode(text) {
  return { id: genId(), text: text || '', note: '', collapsed: false, children: [] };
}

/** Wrap a freshly-built tree as a document: keep the root's (already
 *  generated, by makeNode) id at hand as `rootId`, which is session-local
 *  only and never written to the file — see serialise(). */
function wrapDocument(root) {
  return { rootId: root.id, root: root };
}

/** Build the initial empty document. The root text doubles as the human
 *  project name and the suggested file name. */
function newDocument() {
  return wrapDocument(makeNode('Untitled'));
}

/** Assign a fresh, session-local id to every node in the tree (recursively),
 *  the same way makeNode() does for a brand-new node. Node ids are never part
 *  of the saved JSON (see serialise) — they only bind DOM elements to data
 *  during the current editing session — so a loaded file's own ids (if an
 *  older, v1 file even has any) are never trusted, just overwritten. */
function assignNodeIds(node) {
  node.id = genId();
  node.children.forEach(assignNodeIds);
  return node;
}

/** Normalize a just-loaded document: drop the file header (`meta`) — it
 *  describes the export, not the map, and is written fresh on every save —
 *  drop the old project `id` if the file still carries one, and hand every
 *  node a fresh id, recomputing `rootId` from it. There is no schema version
 *  to check: past format changes have all been detectable from the shape of
 *  the data itself (a field present or missing), and the same approach is
 *  meant to cover future ones too. */
function normalizeLoadedDoc(d) {
  if (d) { delete d.meta; delete d.id; }
  if (d && d.root) {
    assignNodeIds(d.root);
    d.rootId = d.root.id;
  }
  return d;
}

/** Fill the placeholders a data file may use for the running app's identity:
 *  {{app}}, {{version}}, {{home}}. welcome.js is loaded before app.js, so it
 *  cannot read the constants directly — it writes the placeholder instead. */
function fillAppPlaceholders(text) {
  return text
    .replace(/\{\{app\}\}/g, APP_NAME)
    .replace(/\{\{version\}\}/g, APP_VERSION)
    .replace(/\{\{home\}\}/g, APP_HOME);
}

/** Build a document from a plain { text, note, children } tree spec (see
 *  welcome.js). Node ids are assigned here so the data file stays id-free. */
function buildDocFromTree(spec) {
  const build = (n) => {
    const node = makeNode(fillAppPlaceholders(n.text || ''));
    node.note = fillAppPlaceholders(n.note || '');
    node.collapsed = Boolean(n.collapsed);
    node.children = (n.children || []).map(build);
    return node;
  };
  return wrapDocument(build(spec));
}

/** The document a brand-new visitor starts on: the welcome/instructions map
 *  when welcome.js is present, otherwise a blank project.
 *  The welcome map is ephemeral — it carries a non-serialised `isWelcome` flag
 *  so auto-save skips it (scheduleSave); it therefore re-seeds fresh from
 *  welcome.js on every visit until the user picks New/Open or names it via
 *  Save As (which clears the flag). This keeps welcome.js the single source of
 *  truth and never leaves a stale greeting in localStorage. */
function starterDocument() {
  if (typeof window.WELCOME_TREE === 'undefined') return newDocument();
  const doc = buildDocFromTree(window.WELCOME_TREE);
  doc.isWelcome = true; // never persisted; re-seeded each boot (see scheduleSave)
  return doc;
}

/** Deep clone a plain-data value (used for undo snapshots). */
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * Depth-first search returning the path of nodes from root to the node with
 * the given id, inclusive. Returns null when not found. The parent is
 * path[path.length - 2] and the grandparent path[path.length - 3].
 */
function findPath(root, id) {
  if (root.id === id) return [root];
  for (const child of root.children) {
    const sub = findPath(child, id);
    if (sub) return [root, ...sub];
  }
  return null;
}

/** The node with the given id, or null. Use findPath directly when the parent
 *  or grandparent is also needed. */
function nodeById(id) {
  const path = findPath(doc.root, id);
  return path ? path[path.length - 1] : null;
}

/* ---------------------------------------------------------------------- */
/* State                                                                  */
/* ---------------------------------------------------------------------- */

let doc = newDocument();
const undoStack = [];
const redoStack = [];

let currentId = doc.rootId;   // id of the node that should hold focus
let currentOffset = 0;        // caret offset to restore after a re-render

// Text-edit coalescing: a burst of typing produces a single undo entry.
let textBurst = false;
let textBurstTimer = null;

// Set true once the initial load+render is done, so auto-save doesn't fire
// while restoring state at startup.
let booted = false;

// Feature flag for drag-and-drop reordering. Set to false to disable, or
// delete it together with the grip block in buildNodeLi, the "Drag and drop"
// section near the bottom, and the .drag-grip/.drop-* CSS to remove entirely.
const DND_ENABLED = true;

const outlineEl = document.getElementById('outline');
const statusEl = document.getElementById('status');
const fileInput = document.getElementById('file-input');
const fileNameEl = document.getElementById('file-name');

/* ---------------------------------------------------------------------- */
/* Text sanitising (assignment §5)                                        */
/* ---------------------------------------------------------------------- */

/** Read the plain text of a contenteditable node. Never trust innerHTML. */
function readNodeText(el) {
  // innerText already flattens <br>/<div> into newlines; nodes are single
  // logical lines, so collapse any stray newlines and normalise nbsp.
  return el.innerText.replace(/\u00a0/g, ' ').replace(/\n/g, '');
}

/* ---------------------------------------------------------------------- */
/* Undo / redo                                                            */
/* ---------------------------------------------------------------------- */

/** Push the current document state so it can be restored by undo. */
function snapshot() {
  undoStack.push(clone(doc));
  redoStack.length = 0;
  endTextBurst();
}

function endTextBurst() {
  textBurst = false;
  clearTimeout(textBurstTimer);
}

function undo() {
  if (!undoStack.length) return;
  endTextBurst();
  redoStack.push(clone(doc));
  doc = undoStack.pop();
  ensureCurrentExists();
  currentOffset = Infinity;
  render();
}

function redo() {
  if (!redoStack.length) return;
  endTextBurst();
  undoStack.push(clone(doc));
  doc = redoStack.pop();
  ensureCurrentExists();
  currentOffset = Infinity;
  render();
}

/** After undo/redo the focused node may be gone; fall back to the root. */
function ensureCurrentExists() {
  if (!findPath(doc.root, currentId)) currentId = doc.rootId;
}

/* ---------------------------------------------------------------------- */
/* Rendering (pure function of `doc`)                                     */
/* ---------------------------------------------------------------------- */

function buildNodeLi(node, isRoot) {
  const li = document.createElement('li');
  const hasChildren = node.children.length > 0;
  const hasNote = !!(node.note && node.note.trim());
  if (node.collapsed) li.classList.add('collapsed');

  // Collapse/expand toggle, shown only for branches that have children.
  if (hasChildren) {
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'toggle';
    toggle.dataset.toggle = node.id;
    toggle.textContent = node.collapsed ? '▸' : '▾';
    toggle.setAttribute('aria-expanded', String(!node.collapsed));
    toggle.setAttribute('aria-label', node.collapsed ? 'Expand branch' : 'Collapse branch');
    li.appendChild(toggle);
  }

  // The node text and its (optional) description marker share a flex row.
  // The marker is a separate, non-editable element kept OUT of the
  // contenteditable, so editing the title never disturbs or displaces it.
  const row = document.createElement('div');
  row.className = 'row';

  const div = document.createElement('div');
  div.className = 'node' + (isRoot ? ' root' : '') + (hasChildren ? ' has-children' : '');
  div.contentEditable = 'true';
  div.dataset.id = node.id;
  div.textContent = node.text;
  row.appendChild(div);

  if (hasNote) {
    const mark = document.createElement('span');
    mark.className = 'note-mark';
    mark.textContent = String.fromCodePoint(0x1f5d2) + '\uFE0E'; // 🗒 text-presentation
    mark.contentEditable = 'false';
    mark.title = 'Has a description — click to edit';
    mark.setAttribute('aria-label', 'Has a description');
    row.appendChild(mark);
  }

  // Drag handle in the gutter (removable: see DND_ENABLED). Root is not
  // draggable — it has no siblings or parent.
  if (DND_ENABLED && !isRoot) {
    const grip = document.createElement('span');
    grip.className = 'drag-grip';
    grip.draggable = true;
    grip.textContent = '⠿'; // ⠿ braille grip
    grip.title = 'Drag to move';
    grip.setAttribute('aria-hidden', 'true');
    row.appendChild(grip);
  }

  li.appendChild(row);

  if (!node.collapsed && hasChildren) {
    const ul = document.createElement('ul');
    for (const child of node.children) ul.appendChild(buildNodeLi(child, false));
    li.appendChild(ul);
  }
  return li;
}

function render() {
  const rootUl = document.createElement('ul');
  rootUl.className = 'outline-root';
  rootUl.appendChild(buildNodeLi(doc.root, true));
  outlineEl.replaceChildren(rootUl);
  restoreFocus();
  updateDetail();
  if (booted) scheduleSave(); // every structural change persists
}

/** Focus the node identified by `currentId` and place the caret. */
function restoreFocus() {
  const el = nodeEl(currentId) || nodeEl(doc.rootId);
  if (!el) return;
  el.focus();
  placeCaret(el, currentOffset);
}

/* ---------------------------------------------------------------------- */
/* Caret / selection helpers                                              */
/* ---------------------------------------------------------------------- */

function nodeEl(id) {
  return outlineEl.querySelector('.node[data-id="' + id + '"]');
}

/** Character offset of the caret inside the currently focused node. */
function caretOffset() {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return 0;
  return sel.getRangeAt(0).startOffset;
}

/** True when the caret sits at the very start of a non-empty node. */
function caretAtStart(el) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount || !sel.isCollapsed) return false;
  if (readNodeText(el) === '') return false; // empty node: never "at start"
  // Measure the text between the node's start and the caret, so a node split
  // into several text nodes (after a paste) cannot report a false start.
  const before = sel.getRangeAt(0).cloneRange();
  before.setStart(el, 0);
  return before.toString().length === 0;
}

/** Place the caret inside `el` at `offset` (clamped to the text length). */
function placeCaret(el, offset) {
  const sel = window.getSelection();
  const range = document.createRange();
  const textNode = el.firstChild;
  if (textNode && textNode.nodeType === Node.TEXT_NODE) {
    const pos = Math.min(offset, textNode.textContent.length);
    range.setStart(textNode, pos);
  } else {
    range.setStart(el, 0); // empty node
  }
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

/** All currently visible node elements, in top-to-bottom document order. */
function visibleNodes() {
  return Array.from(outlineEl.querySelectorAll('.node'));
}

/* ---------------------------------------------------------------------- */
/* Structural operations (assignment §4 & §5)                             */
/* ---------------------------------------------------------------------- */

/**
 * Enter: create an empty node next to `id` and focus it. Where it lands
 * follows the caret and what the user can actually see:
 *   - caret at the very start of a non-empty node (`atStart`) -> a sibling
 *     *above* it, which reads as "I need an item here";
 *   - a node whose children are on display -> its new first child, since a
 *     sibling would sit past the whole subtree and look unrelated;
 *   - anything else (a leaf, a collapsed parent, an empty node) -> a sibling
 *     below. A collapsed parent behaves exactly like a leaf: its children are
 *     invisible, so putting the new node inside them would be a surprise.
 * The root has no sibling list (§2), so there a child is the only option.
 */
function insertNode(id, atStart) {
  const path = findPath(doc.root, id);
  const node = path[path.length - 1];
  const parent = path[path.length - 2];
  const showsChildren = node.children.length > 0 && !node.collapsed;
  snapshot();
  const fresh = makeNode('');
  if (atStart && parent) {
    parent.children.splice(parent.children.indexOf(node), 0, fresh);
  } else if (showsChildren) {
    node.children.unshift(fresh);
  } else if (parent) {
    parent.children.splice(parent.children.indexOf(node) + 1, 0, fresh);
  } else {
    // The root with nothing on display: a new branch it is, and it has to be
    // visible, so a collapsed root opens up.
    node.children.push(fresh);
    node.collapsed = false;
  }
  currentId = fresh.id;
  currentOffset = 0;
  render();
}

/** Tab: make `id` a child of its previous sibling. No-op on the first child. */
function indent(id) {
  const path = findPath(doc.root, id);
  const parent = path[path.length - 2];
  if (!parent) return; // root cannot be indented
  const node = path[path.length - 1];
  const index = parent.children.indexOf(node);
  if (index === 0) return; // §5: no previous sibling -> no-op
  snapshot();
  const prev = parent.children[index - 1];
  parent.children.splice(index, 1);
  prev.collapsed = false;
  prev.children.push(node);
  currentId = id;
  render();
}

/** Shift+Tab: move `id` up a level, becoming a sibling of its parent. */
function outdent(id) {
  const path = findPath(doc.root, id);
  const parent = path[path.length - 2];
  const grandparent = path[path.length - 3];
  // §5: a node directly under the root has no grandparent -> no-op.
  if (!parent || !grandparent) return;
  snapshot();
  const node = path[path.length - 1];
  const parentIndex = grandparent.children.indexOf(parent);
  parent.children.splice(parent.children.indexOf(node), 1);
  grandparent.children.splice(parentIndex + 1, 0, node);
  currentId = id;
  render();
}

/** Alt+Arrow: reorder `id` among its siblings by `delta` (-1 up, +1 down). */
function moveSibling(id, delta) {
  const path = findPath(doc.root, id);
  const parent = path[path.length - 2];
  if (!parent) return; // root has no siblings
  const node = path[path.length - 1];
  const i = parent.children.indexOf(node);
  const j = i + delta;
  if (j < 0 || j >= parent.children.length) return; // at an end -> no-op
  currentOffset = caretOffset(); // keep the caret column across the move
  snapshot();
  parent.children.splice(i, 1);
  parent.children.splice(j, 0, node);
  currentId = id;
  render();
}

/** Backspace on an empty node: delete it, reparent its children, move focus. */
function deleteEmptyNode(id) {
  const path = findPath(doc.root, id);
  const parent = path[path.length - 2];
  if (!parent) return; // §5: the root may never be deleted
  const node = path[path.length - 1];

  // Focus target = the visually previous node (fall back to the parent).
  const order = visibleNodes().map((el) => el.dataset.id);
  const pos = order.indexOf(id);
  const focusTarget = pos > 0 ? order[pos - 1] : parent.id;

  snapshot();
  const index = parent.children.indexOf(node);
  // Splice the node's children into its place, preserving order.
  parent.children.splice(index, 1, ...node.children);
  currentId = focusTarget;
  currentOffset = Infinity;
  render();
}

/* ---------------------------------------------------------------------- */
/* Focus navigation (no state change, no re-render)                       */
/* ---------------------------------------------------------------------- */

function moveFocus(id, delta) {
  const els = visibleNodes();
  const pos = els.findIndex((el) => el.dataset.id === id);
  const target = els[pos + delta];
  if (!target) return;
  currentId = target.dataset.id;
  target.focus();
  placeCaret(target, Infinity); // caret at end of the target node
  updateDetail();
}

/* ---------------------------------------------------------------------- */
/* Event handling                                                         */
/* ---------------------------------------------------------------------- */

outlineEl.addEventListener('keydown', (e) => {
  // Do not interfere with IME composition (§5).
  if (e.isComposing) return;

  const el = e.target.closest('.node');
  if (!el) return;
  const id = el.dataset.id;

  switch (e.key) {
    case 'Enter':
      e.preventDefault();
      // Alt+Enter edits the node's description instead of adding a node.
      if (e.altKey) enterNoteEdit(id);
      else insertNode(id, caretAtStart(el));
      return;

    case 'Tab':
      e.preventDefault();
      currentOffset = caretOffset(); // preserve caret column across the move
      if (e.shiftKey) outdent(id);
      else indent(id);
      return;

    case 'ArrowUp':
      e.preventDefault();
      if (e.altKey) moveSibling(id, -1); // reorder among siblings
      else moveFocus(id, -1);
      return;

    case 'ArrowDown':
      e.preventDefault();
      if (e.altKey) moveSibling(id, +1);
      else moveFocus(id, +1);
      return;

    case 'Backspace':
      // Only intercept when the node is empty; otherwise let the browser
      // delete a character (the input handler will sync the text).
      if (readNodeText(el) === '') {
        e.preventDefault();
        deleteEmptyNode(id);
      }
      return;

    case 'z':
    case 'Z':
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
      return;

    case 'y':
    case 'Y':
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        redo();
      }
      return;

    default:
      return;
  }
});

// Live text sync. The first input of a typing burst snapshots the pre-edit
// state so undo rewinds a word/burst, not a single keystroke.
outlineEl.addEventListener('input', (e) => {
  const el = e.target.closest('.node');
  if (!el) return;
  const id = el.dataset.id;

  if (!textBurst) {
    undoStack.push(clone(doc)); // pre-edit state (doc still holds old text)
    redoStack.length = 0;
    textBurst = true;
  }
  clearTimeout(textBurstTimer);
  textBurstTimer = setTimeout(endTextBurst, 700);

  const text = readNodeText(el);
  const node = nodeById(id);
  if (node) node.text = text;
  currentId = id;
  // Keep the detail panel's heading in sync while the title is edited.
  detailTitleEl.textContent = text.trim();
  scheduleSave();
});

// Track the focused node so operations always act on the real caret target.
outlineEl.addEventListener('focusin', (e) => {
  const el = e.target.closest('.node');
  if (el) {
    currentId = el.dataset.id;
    updateDetail();
  }
});

// Clicks in the outline: toggle collapse, open a node's description via its
// marker, or focus the node when the empty part of its row is clicked.
outlineEl.addEventListener('click', (e) => {
  const toggle = e.target.closest('.toggle');
  if (toggle) {
    // Collapse/expand is view state, so it is not pushed onto the undo stack.
    const node = nodeById(toggle.dataset.toggle);
    if (!node) return;
    node.collapsed = !node.collapsed;
    currentId = node.id;
    currentOffset = Infinity;
    render();
    return;
  }

  const mark = e.target.closest('.note-mark');
  if (mark) {
    const nodeDiv = mark.parentElement.querySelector('.node');
    if (nodeDiv) {
      // Move focus to the marked row and show its note (rendered) in the
      // detail panel. Editing is a deliberate step (Edit button / Alt+Enter).
      currentId = nodeDiv.dataset.id;
      nodeDiv.focus();
      placeCaret(nodeDiv, Infinity);
      updateDetail();
    }
    return;
  }

  // Clicking the empty area of a row focuses its node (full-row target).
  if (e.target.classList.contains('row')) {
    const nodeDiv = e.target.querySelector('.node');
    if (nodeDiv) {
      nodeDiv.focus();
      placeCaret(nodeDiv, Infinity);
    }
  }
});


// Paste plain text only (§5): strip any HTML from the clipboard.
outlineEl.addEventListener('paste', (e) => {
  if (!e.target.closest('.node')) return;
  e.preventDefault();
  const text = (e.clipboardData || window.clipboardData)
    .getData('text/plain')
    .replace(/\r?\n/g, ' '); // keep nodes single-line
  document.execCommand('insertText', false, text);
});

/* ---------------------------------------------------------------------- */
/* Node description — inline editor inside the detail panel                */
/*                                                                        */
/* The description is edited in place in the detail panel (no modal). The */
/* panel swaps its rendered-Markdown body for a textarea while editing.   */
/* Robustness: the outline's keyboard shortcuts only fire on a focused    */
/* `.node`, so nothing in the tree reacts while the textarea has focus.   */
/* Leaving the textarea (blur — via Save, a click elsewhere, or focusing  */
/* another node) is the single commit signal; Cancel/Esc set a flag first */
/* so the same blur discards instead of saves.                            */
/* ---------------------------------------------------------------------- */

const detailEditBtn = document.getElementById('detail-edit');
const detailEditor = document.getElementById('detail-editor');
const detailNoteText = document.getElementById('detail-note-text');
const detailSaveBtn = document.getElementById('detail-save');
const detailCancelBtn = document.getElementById('detail-cancel');

let editingNoteId = null;   // node whose description is being edited in place
let cancelRequested = false; // set before blur when the user chose Cancel/Esc

/** Switch the detail panel into edit mode for the given node. */
function enterNoteEdit(id) {
  const node = nodeById(id);
  if (!node) return;
  editingNoteId = id;
  currentId = id;
  cancelRequested = false;
  detailTitleEl.textContent = node.text.trim() || '(untitled node)';
  detailBodyEl.hidden = true;
  detailEditBtn.hidden = true;
  detailEditor.hidden = false;
  // On mobile the .editing class grows the sheet (85vh) so the textarea and
  // keyboard have room; on desktop it is inert.
  detailEl.classList.add('editing');
  detailEl.classList.remove('collapsed', 'expanded');
  lastDetailId = id; // editing counts as "already shown", don't auto-collapse
  detailNoteText.value = node.note || '';
  detailNoteText.focus();
}

/** Restore the view-mode UI (shared by commit and cancel). */
function exitNoteEditUI() {
  editingNoteId = null;
  detailEditor.hidden = true;
  detailBodyEl.hidden = false;
  detailEditBtn.hidden = false;
  detailEl.classList.remove('editing');
}

/** Persist the edited note (when changed) and return to view mode. */
function commitNoteEdit() {
  if (editingNoteId === null) return;
  const id = editingNoteId;
  const node = nodeById(id);
  const next = detailNoteText.value.replace(/\r/g, '');
  exitNoteEditUI();
  if (node && (node.note || '') !== next) {
    endTextBurst();
    snapshot();
    node.note = next;
  }
  currentId = id;
  render(); // refresh the outline marker + detail view, focus the node
}

/** Discard edits and return to view mode. */
function cancelNoteEdit() {
  if (editingNoteId === null) return;
  const id = editingNoteId;
  exitNoteEditUI();
  currentId = id;
  render();
}

// Leaving the textarea is the universal commit signal — it fires whether the
// user clicked Save, tabbed away, clicked another node, or clicked a toolbar
// button. Cancel/Esc set cancelRequested first so this discards instead.
detailNoteText.addEventListener('blur', () => {
  if (editingNoteId === null) return;
  if (cancelRequested) { cancelRequested = false; cancelNoteEdit(); }
  else commitNoteEdit();
});

detailNoteText.addEventListener('keydown', (e) => {
  if (e.isComposing) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    cancelRequested = true;
    detailNoteText.blur(); // triggers cancelNoteEdit via the blur handler
  } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    detailNoteText.blur(); // triggers commitNoteEdit via the blur handler
  }
});

// pointerdown fires before the textarea's blur, so it can flag the intent.
detailCancelBtn.addEventListener('pointerdown', () => { cancelRequested = true; });
detailCancelBtn.addEventListener('click', () => { if (editingNoteId !== null) cancelNoteEdit(); });
detailSaveBtn.addEventListener('click', () => { if (editingNoteId !== null) commitNoteEdit(); });

/* ---------------------------------------------------------------------- */
/* Detail panel — renders the focused node's description as Markdown       */
/* ---------------------------------------------------------------------- */

/*
 * Markdown rendering lives in markdown.js (a JS port of Ujorm's
 * MarkdownToHtmlConverter), loaded before this file. It exposes the global
 * renderMarkdown(md) \u2192 HTML string; the DOM-based renderer escapes all text,
 * so note content can never inject markup.
 */

const detailEl = document.getElementById('detail');
const detailTitleEl = document.getElementById('detail-title');
const detailBodyEl = document.getElementById('detail-body');

// Mobile: the detail panel is a bottom bar that expands into a full sheet.
// It is ALWAYS present for the focused node — collapsed it is a thin title bar
// carrying the Add/Edit button (so a note can always be started); expanded it
// shows the rendered note. On desktop these classes are inert: the side panel
// always shows everything.
const mobileSheetQuery = window.matchMedia('(max-width: 760px)');
function isMobileSheet() { return mobileSheetQuery.matches; }

let lastDetailId = null; // last node shown, so we only collapse on real moves

/** Refresh the detail panel for the focused node's description. */
function updateDetail() {
  // While the inline editor is open, never overwrite it (a stray render would
  // otherwise wipe the in-progress textarea).
  if (editingNoteId !== null) return;
  const node = nodeById(currentId) || doc.root;
  detailTitleEl.textContent = (node.text || '').trim();
  const note = (node.note || '').trim();
  if (note) {
    detailBodyEl.innerHTML = renderMarkdown(note);
    detailBodyEl.classList.remove('empty');
  } else {
    detailBodyEl.innerHTML =
      '<p class="hint">No description yet — press ' +
      '<strong>＋ Add</strong> or <kbd>Alt</kbd>+<kbd>Enter</kbd>.</p>';
    detailBodyEl.classList.add('empty');
  }
  // One button both adds (when empty) and edits (when a note exists).
  detailEditBtn.textContent = note ? 'Edit' : '＋ Add';
  // Reset the sheet to its content-fitting default when focus actually moves to
  // another node (drop any manual expand/collapse). Re-renders of the SAME node
  // (e.g. right after saving) keep whatever height state the user set.
  if (currentId !== lastDetailId) {
    detailEl.classList.remove('expanded', 'collapsed');
    lastDetailId = currentId;
    revealFocusedRow();
  }
}

/** On mobile, nudge the focused row up if it would sit behind the sheet. The
 *  browser's own focus scroll treats a row hidden behind the fixed sheet as
 *  "visible" and won't move it, so we do it explicitly — but only when the row
 *  actually overlaps the sheet, and by the minimum amount, so it never jumps.
 *  Uses the sheet's live top, so it tracks whatever height the content gives. */
function revealFocusedRow() {
  if (!isMobileSheet()) return;
  const el = nodeEl(currentId);
  if (!el) return;
  const sheetTop = detailEl.getBoundingClientRect().top - 8; // small gap
  const overlap = el.getBoundingClientRect().bottom - sheetTop;
  if (overlap > 0) window.scrollBy(0, Math.ceil(overlap));
}

/** Collapse the sheet to a bar, or restore it to the content-fitting default
 *  (inert on desktop). Used by a plain tap on the grip or title. */
function toggleDetail() {
  if (detailEl.classList.contains('collapsed')) {
    detailEl.classList.remove('collapsed');
  } else {
    detailEl.classList.add('collapsed');
    detailEl.classList.remove('expanded');
  }
}

// Tapping the title collapses/restores the sheet on mobile (a quick way to get
// the tree back, and to bring the note back again).
detailTitleEl.addEventListener('click', () => { if (isMobileSheet()) toggleDetail(); });

// The grip drags the sheet's height: up to grow (read a long note / edit), down
// to shrink to a bar; a plain tap collapses/restores. On release it snaps to
// the nearest of collapsed / content-default / expanded. Pointer events unify
// mouse and touch; capture + preventDefault stop the drag from selecting text.
const detailGrip = document.getElementById('detail-grip');
const COLLAPSED_H = 64; // px height of the collapsed bar (matches CSS)
let gripStartY = null, gripStartH = 0, gripHeight = 0, gripMoved = false;

detailGrip.addEventListener('pointerdown', (e) => {
  gripStartY = e.clientY;
  gripStartH = detailEl.offsetHeight;
  gripHeight = gripStartH;
  gripMoved = false;
  try { detailGrip.setPointerCapture(e.pointerId); } catch (_) { /* non-fatal */ }
  detailEl.style.transition = 'none'; // follow the finger with no lag
  e.preventDefault(); // no text selection while dragging the handle
});
detailGrip.addEventListener('pointermove', (e) => {
  if (gripStartY === null) return;
  const dy = gripStartY - e.clientY; // dragging up grows the sheet
  if (Math.abs(dy) > 6) gripMoved = true;
  const maxPx = Math.round(window.innerHeight * 0.85);
  gripHeight = Math.min(maxPx, Math.max(COLLAPSED_H, gripStartH + dy));
  // Drive an explicit height (not just max-height): the sheet is content-fit
  // (height: auto), so raising max-height alone would never grow it past the
  // note. Setting height makes the box follow the finger up beyond the content.
  detailEl.style.height = gripHeight + 'px';
  detailEl.style.maxHeight = gripHeight + 'px';
});
detailGrip.addEventListener('pointerup', () => {
  if (gripStartY === null) return;
  gripStartY = null;
  detailEl.style.transition = ''; // restore the CSS snap animation
  detailEl.style.height = '';     // hand height back to the CSS classes
  detailEl.style.maxHeight = '';
  if (!gripMoved) { toggleDetail(); return; } // a tap collapses/restores
  // A real drag snaps to the nearest of collapsed / default (content, ≤50vh) /
  // expanded, starting from a clean slate.
  detailEl.classList.remove('collapsed', 'expanded');
  const vh = window.innerHeight;
  if (gripHeight <= vh * 0.22) detailEl.classList.add('collapsed');
  else if (gripHeight >= vh * 0.6) detailEl.classList.add('expanded');
  // else: leave both off → the content-fitting default.
});

/* ---------------------------------------------------------------------- */
/* Persistence (Phase 0 stand-in for the server)                          */
/*                                                                        */
/* Two layers:                                                            */
/*   1. Auto-save to localStorage (debounced) so state survives a restart */
/*      with zero user effort. Reliable when served over http(s) or       */
/*      localhost; under file:// the origin is opaque and it may not      */
/*      persist, hence the file layer below.                              */
/*   2. Explicit Open/Save of a real umindmap.json file for backup and for   */
/*      moving a map between machines. Uses the File System Access API on  */
/*      Chromium; elsewhere (and under file://) it falls back to a         */
/*      download and a file picker.                                        */
/* ---------------------------------------------------------------------- */

/** Now as "yyyy-MM-DD HH:mm" in the exporter's own timezone (not UTC). */
function exportStamp() {
  const d = new Date();
  const pad2 = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate())
    + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

/** The file's header: what wrote it, in which version, where its reader lives,
 *  which project it is (its localStorage name) and when it was written. JSON
 *  has no comments, so it is data — a block a human reads first and a loader
 *  ignores. It is rebuilt on every save, so a file never carries the stamp of
 *  the app that wrote its previous version. Named `meta` rather than the older
 *  `generator`, because it now also carries the project name, which describes
 *  the document, not the tool that produced it. `project` is omitted while the
 *  map is still unnamed (a fresh untitled doc, or the ephemeral welcome map). */
function fileMeta() {
  const m = { app: APP_NAME, version: APP_VERSION, home: APP_HOME };
  if (currentFileName) m.project = currentFileName;
  m.exported = exportStamp();
  return m;
}

/** Serialise the document, trimming node text (§5: trim on serialisation).
 *  Node ids and `rootId` are session-local (see assignNodeIds) and are never
 *  written to the file — the file has no schema version either, see
 *  normalizeLoadedDoc(). */
function serialise() {
  const trimTree = (node) => ({
    text: node.text.trim(),
    note: (node.note || '').trim(),
    collapsed: node.collapsed,
    children: node.children.map(trimTree),
  });
  return JSON.stringify(
    {
      meta: fileMeta(),
      root: trimTree(doc.root),
    },
    null,
    2,
  );
}

/** Replace the current document from a JSON string (file or storage). */
function loadDocFromText(text, source) {
  try {
    const parsed = JSON.parse(text);
    if (!parsed.root) throw new Error('missing root');
    endTextBurst();
    doc = normalizeLoadedDoc(parsed);
    undoStack.length = 0; // history belongs to the previous document
    redoStack.length = 0;
    currentId = doc.rootId;
    currentOffset = 0;
    render(); // also schedules a localStorage save
    updateFileLabel();
    setStatus('opened' + (source ? ' ' + source : ''));
    return true;
  } catch (err) {
    setStatus('invalid file');
    console.warn('Open failed:', err);
    return false;
  }
}

/* ---- localStorage auto-save ---- */

// localStorage is the continuous working store (like an online image editor:
// your work is always kept in the browser). The project's name is the key
// identifier — or 'untitled' when it has none yet. Save / Save As are a
// separate concern: they EXPORT the project to a file on disk. LAST_KEY records
// which project to restore on the next visit.
const PROJECT_PREFIX = 'umindmap:project:';
const LAST_KEY = 'umindmap:last';
let storageOk = false;
let saveTimer = null;

/** Detect whether localStorage is usable (may be blocked under file://). */
function storageAvailable() {
  try {
    const k = '__umindmap_test__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch (e) {
    return false;
  }
}

/** localStorage key for the active project (its name, or 'untitled'). */
function activeStorageKey() {
  return PROJECT_PREFIX + (currentFileName || 'untitled');
}

/** Persist the document to its project key immediately (used by Save). The
 *  welcome map is ephemeral and must never land in storage — that invariant
 *  lives here rather than in each caller, so nobody can save it by accident.
 *  Save As clears the flag first, which is what turns it into a real project. */
function persistProject() {
  if (!storageOk || doc.isWelcome || doc.isShared) return;
  try {
    localStorage.setItem(activeStorageKey(), serialise());
    localStorage.setItem(LAST_KEY, currentFileName || '');
  } catch (e) {
    console.warn('localStorage save failed:', e);
  }
}

/** Debounced auto-save of the whole document to its project key. */
function scheduleSave() {
  if (!storageOk) return;
  // The welcome/instructions map is ephemeral: edits to it are a preview, not a
  // project, so they are not persisted. It becomes a real (saved) project only
  // via New/Open or Save As (which clears isWelcome). Until then it re-seeds
  // fresh from welcome.js on every visit.
  // The welcome greeting and a shared read-only file are both ephemeral: edits
  // are a preview and are not persisted. A shared file becomes saveable only
  // once its "Edit map" fork clears isShared (see leaveGraph).
  if (doc.isWelcome || doc.isShared) {
    setStatus(doc.isShared ? 'shared' : 'preview');
    return;
  }
  setStatus('editing…');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    persistProject();
    setStatus('saved');
  }, 500);
}

/** Read a stored document by localStorage key, or null when absent/invalid. */
function readStoredDoc(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.root) return parsed;
  } catch (e) {
    console.warn('localStorage load failed:', e);
  }
  return null;
}

/* ---- Projects & export: New / Open / Save / Save As ----
   Persistence is automatic (localStorage, above). These actions manage the
   project name and EXPORT a .json file to the user's disk:
     New     — start a fresh, unnamed project (kept in localStorage as untitled)
     Save As — name the project (its identifier) and export a file
     Save    — re-export using the current name; if unnamed, do Save As
     Open    — load a .json file as the current project
   Export uses the File System Access API when available (a real file on disk);
   otherwise it downloads the file. Naming still works everywhere (it only
   changes the localStorage key), even where disk export is blocked (sandbox). */

const canFsAccess = 'showSaveFilePicker' in window; // secure context only
let fileHandle = null; // real-file handle when available (null in fallback)
let currentFileName = null; // the project's name / identifier (localStorage key)

// Running inside a cross-origin iframe (e.g. the published artifact preview)?
// There, disk export is blocked no matter what, so we say so honestly.
const inIframe = (() => {
  try {
    return window.self !== window.top;
  } catch (e) {
    return true; // cross-origin access threw -> we are framed
  }
})();

const FILE_TYPES = [
  { description: 'UMindMap file', accept: { 'application/json': ['.json'] } },
];

/** ASCII slug of the project title, used as the default file name. */
function slugify(s) {
  const base = (s || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'untitled';
}

/** Drop a trailing ".json": a file on disk carries the extension, but the
 *  project name — the localStorage key, the URL query and meta.project — does
 *  not. Only names derived from a real file name are stripped; a name that is
 *  already a project key (from the URL or LAST_KEY) is used verbatim. */
function baseName(name) {
  return (name || '').replace(/\.json$/i, '');
}

/** The project name to offer when naming a map: the current one, or a slug of
 *  the root text. Extension-free — callers append ".json" only for a disk file. */
function suggestedName() {
  return currentFileName || slugify(doc.root.text);
}

/** Show the current project's file name (or that it is not named yet). It is
 *  also the moment the project's identity can change, so the address follows. */
function updateFileLabel() {
  syncUrlToProject();
  if (!fileNameEl) return;
  fileNameEl.textContent = currentFileName || '(unsaved)';
  fileNameEl.classList.toggle('unbound', !currentFileName);
  fileNameEl.title = currentFileName
    ? 'Project "' + currentFileName + '" — auto-saved in this browser. ' +
      'Save / Save As export a .json file to disk.'
    : 'Untitled — auto-saved in this browser. Use Save As to name and export it.';
}

async function writeHandle(handle, json) {
  const writable = await handle.createWritable();
  await writable.write(json);
  await writable.close();
}

/* In-app name prompt (window.prompt is blocked in sandboxed iframes such as
   the published artifact). Resolves to the entered name, or null if cancelled. */
const nameDialog = document.getElementById('name-dialog');
const nameInput = document.getElementById('name-input');
document
  .getElementById('name-cancel')
  .addEventListener('click', () => nameDialog.close('cancel'));

function askName(def) {
  return new Promise((resolve) => {
    nameInput.value = def || '';
    const onClose = () => {
      nameDialog.removeEventListener('close', onClose);
      resolve(nameDialog.returnValue === 'ok' ? nameInput.value : null);
    };
    nameDialog.addEventListener('close', onClose);
    nameDialog.showModal();
    nameInput.focus();
    nameInput.select();
  });
}

/** Export the current project to disk under its name; if unnamed, do Save As. */
async function saveFile() {
  if (!currentFileName) return saveFileAs();
  const json = serialise();
  if (canFsAccess && fileHandle) {
    try {
      await writeHandle(fileHandle, json);
      setStatus('exported to file');
      return;
    } catch (e) {
      console.warn('Export failed:', e);
    }
  }
  exportDownload(json, currentFileName + '.json');
}

/** Save As: name the project (its extension-free identifier) and export a file.
 *  The project name never carries ".json" — that belongs only on the disk file,
 *  so it is stripped from whatever the picker or the dialog returns. */
async function saveFileAs() {
  let projectName = null; // extension-free identifier / localStorage key
  let handle = null;

  if (canFsAccess) {
    try {
      handle = await window.showSaveFilePicker({
        suggestedName: suggestedName() + '.json', // the disk file keeps .json
        types: FILE_TYPES,
      });
      projectName = baseName(handle.name);
    } catch (e) {
      if (e.name === 'AbortError') return; // user cancelled
      console.warn('Save As picker failed, falling back to a name dialog:', e);
    }
  }
  if (!projectName) {
    // In-app name dialog (window.prompt is blocked in sandboxed iframes).
    const entered = await askName(suggestedName());
    if (entered === null) return; // cancelled
    projectName = baseName(entered.trim()); // tolerate a typed ".json"
    if (!projectName) return;
  }

  currentFileName = projectName; // the identifier (also the localStorage key)
  fileHandle = handle; // may be null (fallback)
  delete doc.isWelcome; // naming it makes it a real project: enable persistence
  delete doc.isShared;  // (defensive) a named project is never a read-only file
  persistProject(); // move the working copy to the new name's key immediately
  updateFileLabel();

  const json = serialise();
  if (handle) {
    await writeHandle(handle, json);
    setStatus('exported to file');
  } else {
    exportDownload(json, projectName + '.json');
  }
}

/** Download a file and report honestly (blocked inside the artifact preview). */
function exportDownload(json, name) {
  if (inIframe) {
    // Sandboxed preview: downloads are blocked. Don't pretend otherwise.
    setStatus('open in a tab to export');
    return;
  }
  downloadJson(json, name);
  setStatus('downloaded');
}

/** Fallback export: hand the project's JSON to the browser as a download. */
function downloadJson(json, name) {
  downloadBlob(json, 'application/json', name || 'untitled.json');
}

/** Hand a generated file to the browser as a download. The anchor has to be in
 *  the DOM (Firefox) and the object URL must be revoked *later* — revoking it
 *  straight away cancels the download in some browsers. */
function downloadBlob(text, type, name) {
  const url = URL.createObjectURL(new Blob([text], { type: type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/** Open a file, switching to it as the current project. */
async function openFile() {
  if (canFsAccess) {
    try {
      const [handle] = await window.showOpenFilePicker({ types: FILE_TYPES });
      fileHandle = handle;
      currentFileName = baseName(handle.name); // file name (minus .json) = key
      const file = await handle.getFile();
      loadDocFromText(await file.text(), 'from file');
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
      console.warn('File open failed, falling back to picker:', e);
    }
  }
  fileInput.click(); // fallback: hidden <input type="file">
}

/** New: start a fresh, unnamed project. The current project is already kept
 *  in localStorage under its own key, so nothing saved is lost. */
function newFile() {
  endTextBurst();
  doc = newDocument();
  fileHandle = null;
  currentFileName = null; // unnamed until Save As
  undoStack.length = 0;
  redoStack.length = 0;
  currentId = doc.rootId;
  currentOffset = 0;
  render();
  updateFileLabel();
  setStatus('new project');
}

/* ---------------------------------------------------------------------- */
/* URL: which map to open, and in which view                              */
/*                                                                        */
/* The address is a single, valueless query key. The ".json" ending picks  */
/* the source and the default view:                                        */
/*   - no ".json": a localStorage project, opened in the EDITOR. A "/graph" */
/*     tail asks for its picture instead; deleting the tail returns to the  */
/*     editor of the same map.                                             */
/*   - ends ".json": a shared, read-only map file from the data/ folder,   */
/*     opened as a GRAPH (a picture). It is never auto-saved; editing it    */
/*     (the graph's "Edit map" button) forks a personal copy into           */
/*     localStorage under the extension-free name and opens that — so the   */
/*     first save happens only when the reader chooses to edit.            */
/*                                                                        */
/*   .../               the last project used here (editor)              */
/*   .../?my-map        the project stored under "my-map" (editor)        */
/*   .../?my-map/graph  its graph view                                    */
/*   .../?demo.json     the shared file data/demo.json, as a picture      */
/*   .../?welcome       the greeting: always fresh, never saved (reserved)*/
/*   .../?welcome/graph the greeting as a picture                         */
/*                                                                        */
/* Only a bare file name is honoured after "?": no slashes and no "..", so */
/* a shared map can only ever be read from that one data/ folder.         */
/* ---------------------------------------------------------------------- */

const WELCOME_KEY = 'welcome'; // reserved: the greeting, not a stored project
const GRAPH_SUFFIX = '/graph';
const SVG_TYPE = 'image/svg+xml';
const SHARED_DIR = 'data';                       // the only folder shared maps load from
const SHARED_NAME_RE = /^[a-z0-9._-]+\.json$/i;  // a bare file name — no path segments

/** Read the address: { name, graph, shared }. `name` is '' when nothing was
 *  asked for; `shared` is true for a ".json" file served from the data/ folder,
 *  which opens as a graph. */
function readUrlTarget() {
  const keys = [...new URLSearchParams(location.search).keys()];
  // Keep honouring ?welcome wherever it appears; otherwise the first key wins.
  const raw = keys.find((k) => k === WELCOME_KEY || k === WELCOME_KEY + GRAPH_SUFFIX)
    || keys[0] || '';
  const graph = raw.toLowerCase().endsWith(GRAPH_SUFFIX);
  const name = graph ? raw.slice(0, -GRAPH_SUFFIX.length) : raw;
  const shared = /\.json$/i.test(name); // a real file name -> the shared data/ dir
  return { name: name, graph: graph, shared: shared };
}

/** This page's address for a project, in either view. An empty name gives the
 *  bare page, which is what "no project named in the URL" looks like. */
function projectUrl(name, graph) {
  const url = new URL(location.href);
  url.search = name ? '?' + encodeURIComponent(name) + (graph ? GRAPH_SUFFIX : '') : '';
  return url;
}

/** Keep the address pointing at the project actually open, so a reload or a
 *  shared link opens this map and not the one named before it was renamed.
 *  Never touches ?welcome, which cleans itself up at boot (see below). */
function syncUrlToProject() {
  if (graphView) return; // the graph URL is set by whoever navigated here
  try {
    const target = readUrlTarget();
    if (!target.name || target.name === WELCOME_KEY) return; // nothing to keep in sync
    const url = projectUrl(currentFileName, false);
    history.replaceState(null, '', url.pathname + url.search + url.hash);
  } catch (e) {
    console.warn('Could not update the project URL:', e);
  }
}

/* ---------------------------------------------------------------------- */
/* Graph view                                                             */
/* ---------------------------------------------------------------------- */

let graphView = false; // true when this page shows the picture, not the tree

/** The project name shown in the picture's footer and used in its URL. */
function projectLabel() {
  if (doc.isWelcome) return WELCOME_KEY;
  return currentFileName || 'untitled';
}

/** The picture of the map currently open, as SVG source. */
function currentSvg() {
  return documentToSvg(doc, { project: projectLabel() });
}

/** Can the graph view rebuild this map from the address alone? The greeting can
 *  always be re-seeded from welcome.js; anything else has to be read back out
 *  of localStorage, which is not always there (file://). */
function addressableMap() {
  return doc.isWelcome || storageOk;
}

/** Show graph: open the picture of this map in a new tab. The tab gets a real
 *  address (".../?project/graph") rather than a throw-away blob, so it can be
 *  reloaded, bookmarked and shared, and deleting "/graph" opens the editor.
 *  Only a map the address cannot rebuild falls back to handing the finished
 *  SVG straight to a new tab — which must stay synchronous inside the click
 *  handler, or the popup blocker kills it. */
function exportSvgFile() {
  try {
    if (addressableMap()) {
      persistProject(); // flush the debounced save so the new tab sees this text
      if (window.open(projectUrl(projectLabel(), true).href, '_blank')) {
        setStatus('graph opened in a new tab');
        return;
      }
    }
    const url = URL.createObjectURL(new Blob([currentSvg()], { type: SVG_TYPE }));
    const tab = window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000); // let the tab load it first
    if (tab) {
      setStatus('graph opened in a new tab');
    } else {
      downloadSvgFile(); // popups blocked (sandboxed preview, strict settings)
    }
  } catch (e) {
    console.warn('SVG export failed:', e);
    setStatus('svg export failed');
  }
}

/** Everything the picture needs before it can be drawn: the footer logo and any
 *  images embedded in the notes. Drawing first would race the logo's source
 *  image and sign the sheet blank; and because the layout measures note height
 *  synchronously, a note image that has not loaded yet would be reserved no
 *  space and then clipped. */
function whenGraphAssets() {
  return Promise.all([whenLogoReady(), whenNotesReady(doc)]);
}

/** Render the picture into the page and switch to viewing mode; which controls
 *  belong to which mode is spelled out once, in the CSS (body.graph-view).
 *  This runs at page load, so it waits for the assets the drawing needs (see
 *  whenGraphAssets). */
async function showGraph() {
  graphView = true; // already true when the address asked for it (see boot)
  document.body.classList.add('graph-view');
  document.querySelector('.workspace').hidden = true;
  document.querySelector('.help').hidden = true;
  document.getElementById('graph').hidden = false;
  document.title = (doc.root.text || 'UMindMap').trim() + ' — graph';
  await whenGraphAssets();
  // The prolog belongs to a standalone file; here the markup is inlined.
  document.getElementById('graph-canvas').innerHTML =
    currentSvg().replace(/^<\?xml[^>]*\?>\s*/, '');
}

/** Back to the editor. For a normal project this is just the address without
 *  the "/graph" tail. A shared map has no editor of its own: editing it forks a
 *  personal copy into localStorage under its extension-free name and opens that
 *  — which is the point where the first save is finally allowed to happen. */
function leaveGraph() {
  if (doc.isShared) {
    delete doc.isShared; // it is now an ordinary, saveable project
    persistProject();    // write the fork before the address changes to it
  }
  location.href = projectUrl(projectLabel(), false).href;
}

/** New from the graph view: start a fresh, unnamed project in the editor
 *  WITHOUT forking the current map into localStorage. Reaching the editor the
 *  usual way ("Edit map" then New) first persists the open map — including a
 *  shared, read-only file — under its own key; New here skips that, so opening
 *  a shared map only to start your own leaves no copy of the source behind.
 *  Done in place (the reverse of showGraph), because navigating would reboot
 *  and restore the last project instead of the fresh one. */
function newFromGraph() {
  graphView = false;
  document.body.classList.remove('graph-view');
  document.getElementById('graph').hidden = true;
  document.querySelector('.workspace').hidden = false;
  document.querySelector('.help').hidden = false;
  document.title = 'UMindMap — self-hosted mind map outliner';
  history.replaceState(null, '', location.pathname); // drop ?<map>[/graph]
  newFile();
}

/** Save the picture as an .svg file on disk. Nothing here is popup-blocked, so
 *  it can wait for the drawing's assets (see whenGraphAssets) rather than draw
 *  the sheet without them. */
async function downloadSvgFile() {
  try {
    await whenGraphAssets();
    downloadBlob(currentSvg(), SVG_TYPE, slugify(doc.root.text) + '.svg');
    setStatus('svg downloaded');
  } catch (e) {
    console.warn('SVG download failed:', e);
    setStatus('svg export failed');
  }
}

// Fallback file-input change handler (no File System Access API).
fileInput.addEventListener('change', () => {
  const file = fileInput.files && fileInput.files[0];
  if (!file) return;
  fileHandle = null; // fallback mode can't keep a writable handle
  currentFileName = baseName(file.name); // drop .json for the project key
  const reader = new FileReader();
  reader.onload = () => loadDocFromText(String(reader.result), 'from file');
  reader.readAsText(file);
  fileInput.value = ''; // allow re-opening the same file later
});

/* ---------------------------------------------------------------------- */
/* Status line                                                            */
/* ---------------------------------------------------------------------- */

function setStatus(text) {
  statusEl.textContent = text;
}

/* ---------------------------------------------------------------------- */
/* Drag and drop (optional — gated entirely by DND_ENABLED)               */
/*                                                                        */
/* Drag a node by the gutter grip and drop it before/after another node   */
/* (any level), re-parenting as needed. Dropping onto the node itself,    */
/* into its own subtree, or as a sibling of the root is disallowed. To    */
/* remove the feature: delete this whole block, the grip block in         */
/* buildNodeLi, the DND_ENABLED flag, and the .drag-grip/.drop-* CSS.     */
/* ---------------------------------------------------------------------- */

if (DND_ENABLED) {
  let draggedId = null;
  let draggedNode = null;
  let markedRow = null; // row currently showing a drop indicator
  let dropPos = null; // 'before' | 'after'

  const containsId = (node, id) =>
    node.id === id || node.children.some((c) => containsId(c, id));

  const clearMark = () => {
    if (markedRow) markedRow.classList.remove('drop-before', 'drop-after', 'drop-into');
    markedRow = null;
    dropPos = null;
  };

  /** True when `targetId` cannot receive the dragged node. */
  const invalidTarget = (targetId) =>
    !targetId ||
    targetId === draggedId ||
    targetId === doc.rootId || // can't become a sibling of the root
    (draggedNode && containsId(draggedNode, targetId)); // no dropping into self

  outlineEl.addEventListener('dragstart', (e) => {
    const grip = e.target.closest('.drag-grip');
    if (!grip) return;
    const row = grip.closest('.row');
    draggedId = row.querySelector('.node').dataset.id;
    draggedNode = nodeById(draggedId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', draggedId);
    row.classList.add('dragging');
  });

  outlineEl.addEventListener('dragover', (e) => {
    if (!draggedId) return;
    const row = e.target.closest('.row');
    if (!row) return clearMark();
    const targetId = row.querySelector('.node').dataset.id;
    if (invalidTarget(targetId)) return clearMark();

    e.preventDefault(); // permit the drop
    e.dataTransfer.dropEffect = 'move';
    const rect = row.getBoundingClientRect();
    const pos = e.clientY - rect.top < rect.height / 2 ? 'before' : 'after';
    if (row !== markedRow || pos !== dropPos) {
      clearMark();
      markedRow = row;
      dropPos = pos;
      row.classList.add(pos === 'before' ? 'drop-before' : 'drop-after');
      // "after" an expanded branch drops as its first child — indent the hint.
      const targetNode = nodeById(targetId);
      if (pos === 'after' && targetNode && !targetNode.collapsed && targetNode.children.length) {
        row.classList.add('drop-into');
      }
    }
  });

  outlineEl.addEventListener('drop', (e) => {
    if (!draggedId || !markedRow) return clearMark();
    e.preventDefault();
    const targetId = markedRow.querySelector('.node').dataset.id;
    const pos = dropPos;
    clearMark();
    moveByDrop(draggedId, targetId, pos);
  });

  outlineEl.addEventListener('dragend', () => {
    const dragging = outlineEl.querySelector('.row.dragging');
    if (dragging) dragging.classList.remove('dragging');
    clearMark();
    draggedId = null;
    draggedNode = null;
  });

  /** Move `dragId` to just before/after `targetId` in the target's parent. */
  function moveByDrop(dragId, targetId, pos) {
    if (invalidTarget(targetId)) return;
    const dragPath = findPath(doc.root, dragId);
    const targetPath = findPath(doc.root, targetId);
    if (!dragPath || !targetPath) return;
    const dragged = dragPath[dragPath.length - 1];
    const dragParent = dragPath[dragPath.length - 2];
    const target = targetPath[targetPath.length - 1];
    const targetParent = targetPath[targetPath.length - 2];
    if (!dragParent || !targetParent) return;

    snapshot();
    dragParent.children.splice(dragParent.children.indexOf(dragged), 1);
    if (pos === 'after' && !target.collapsed && target.children.length) {
      // Dropping just below an expanded branch means "become its first child"
      // (visually the same spot as "before its first child").
      target.children.unshift(dragged);
    } else {
      // Recompute the index after removal (matters when parents are the same).
      let idx = targetParent.children.indexOf(target);
      if (pos === 'after') idx += 1;
      targetParent.children.splice(idx, 0, dragged);
    }
    currentId = dragId;
    currentOffset = Infinity;
    render();
  }
}

/* ---------------------------------------------------------------------- */
/* Wire up the toolbar and boot                                           */
/* ---------------------------------------------------------------------- */

document.getElementById('btn-undo').addEventListener('click', undo);
document.getElementById('btn-redo').addEventListener('click', redo);
document.getElementById('btn-new').addEventListener('click', newFile);
document.getElementById('btn-open').addEventListener('click', openFile);
document.getElementById('btn-save').addEventListener('click', saveFile);
document.getElementById('btn-saveas').addEventListener('click', saveFileAs);
document.getElementById('btn-svg').addEventListener('click', exportSvgFile);
document.getElementById('btn-edit').addEventListener('click', leaveGraph);
document.getElementById('btn-graph-new').addEventListener('click', newFromGraph);
document.getElementById('btn-svg-save').addEventListener('click', downloadSvgFile);
detailEditBtn.addEventListener('click', () => enterNoteEdit(currentId));

// The wordmark links to the project's home page (same in edit and graph view,
// since the header's .brand is shared by both). href and tooltip come from
// APP_HOME so it stays the single source of truth.
const brandHome = document.getElementById('brand-home');
brandHome.href = APP_HOME;
brandHome.title = 'Go to the ' + APP_NAME + ' home page (' + APP_HOME + ')';

// Clicking the toolbar logo opens it at full size; a click anywhere on the
// dialog (image or backdrop) or Esc closes it.
const logoDialog = document.getElementById('logo-dialog');
document.querySelector('.brand-logo').addEventListener('click', () => logoDialog.showModal());
logoDialog.addEventListener('click', () => logoDialog.close());

// Boot: restore the last-open project from localStorage (if any), else seed the
// welcome map for first-time visitors, then render.
storageOk = storageAvailable();

// URL flag: ?welcome (re)loads a fresh welcome map. It is non-destructive —
// the welcome map is ephemeral (not persisted), so the visitor's saved
// projects stay untouched and a plain reload returns to their work, which
// makes ?welcome safe to link publicly (e.g. from the README). The flag is
// stripped from the address bar so a later reload (e.g. after a Save As) does
// not re-trigger it.
const urlTarget = readUrlTarget();
graphView = urlTarget.graph || urlTarget.shared; // a shared file opens as a picture
const forceWelcome = urlTarget.name === WELCOME_KEY;

/**
 * Load a shared, read-only map file from the data/ folder and show its picture.
 * Only a bare file name is accepted (SHARED_NAME_RE, and no ".."), so a map can
 * never be read from anywhere but that single folder. It is flagged isShared —
 * ephemeral, never auto-saved; editing forks a copy (see leaveGraph). Any
 * failure (bad name, 404, not a map, file://) falls back to the normal boot and
 * reports the miss.
 */
async function bootSharedFile(fileName) {
  const bad = (why) => {
    console.warn('UMindMap: shared map "' + fileName + '" ' + why);
    graphView = false;
    document.body.classList.remove('graph-view');
    bootLocal();
    setStatus('no shared map "' + fileName + '"');
  };
  if (!SHARED_NAME_RE.test(fileName) || fileName.includes('..')) {
    return bad('refused (only a bare file name from the data/ folder is allowed)');
  }
  try {
    const res = await fetch(SHARED_DIR + '/' + encodeURIComponent(fileName),
      { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const parsed = JSON.parse(await res.text());
    if (!parsed.root) throw new Error('not a UMindMap document');
    doc = normalizeLoadedDoc(parsed);
    doc.isShared = true;                  // read-only preview, never persisted
    currentFileName = baseName(fileName); // the name a fork would take on Edit
    currentId = doc.rootId;
    booted = true;
    await showGraph();
    setStatus('shared');
  } catch (e) {
    bad('could not be loaded: ' + e);
  }
}

/** The normal boot: open a localStorage project (or the greeting) from the
 *  address, falling back to the last project used, in the editor or graph. */
function bootLocal() {
  // ?welcome is self-cleaning, so a later reload or Save As does not re-trigger
  // the greeting. The graph URL keeps its address: it is a view of a map, and
  // dropping "/graph" from it is how you get to the editor.
  if (forceWelcome && !urlTarget.graph) {
    try {
      const url = new URL(location.href);
      url.searchParams.delete(WELCOME_KEY);
      history.replaceState(null, '', url.pathname + url.search + url.hash);
    } catch (e) {
      console.warn('Could not clean the ?welcome URL:', e);
    }
  }

  // A name in the address opens that project instead of the last one used. It is
  // only a starting point: when the project is missing we fall back to the normal
  // restore rather than inventing an empty map under someone else's name.
  let urlMissing = false;
  if (!forceWelcome && urlTarget.name && storageOk) {
    const wanted = readStoredDoc(PROJECT_PREFIX + urlTarget.name);
    if (wanted) {
      doc = normalizeLoadedDoc(wanted);
      currentFileName = urlTarget.name === 'untitled' ? null : urlTarget.name;
      currentId = doc.rootId;
    } else {
      urlMissing = true;
    }
  }

  if (forceWelcome) {
    // Forced greeting: ephemeral, re-seeded from welcome.js (see starterDocument).
    doc = starterDocument();
    currentId = doc.rootId;
  } else if (urlTarget.name && !urlMissing) {
    // Already loaded from the address above.
  } else if (storageOk) {
    const lastName = localStorage.getItem(LAST_KEY); // null = never saved here
    const restored = readStoredDoc(PROJECT_PREFIX + (lastName || 'untitled'));
    if (restored) {
      doc = normalizeLoadedDoc(restored);
      currentFileName = lastName || null;
      currentId = doc.rootId;
    } else if (lastName === null) {
      // First-ever visit: greet with the instructions map instead of a blank one.
      // The welcome map is ephemeral (isWelcome flag) — not auto-saved, so it
      // re-seeds each visit until the user picks New/Open or names it via Save As.
      doc = starterDocument();
      currentId = doc.rootId;
    }
  } else {
    // No persistence (e.g. file://): every load is fresh, so greet with the map.
    doc = starterDocument();
    currentId = doc.rootId;
  }
  if (urlTarget.graph) {
    updateFileLabel();
    booted = true;
    showGraph();
  } else {
    render();
    updateFileLabel();
    booted = true;
    if (!storageOk) {
      setStatus('autosave off');
      statusEl.title = 'localStorage is unavailable (e.g. opened via file://). ' +
        'Use Save As to keep a .json file, or serve over http for autosave.';
    } else if (urlMissing) {
      setStatus('no project "' + urlTarget.name + '"');
    } else if (doc.isWelcome) {
      setStatus('preview'); // welcome map is not persisted (see scheduleSave)
    } else {
      setStatus(currentFileName ? 'loaded' : 'ready');
    }
  }
}

if (urlTarget.shared) {
  bootSharedFile(urlTarget.name);
} else {
  bootLocal();
}
