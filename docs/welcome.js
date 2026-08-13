// UMindMap (https://pponec.github.io/UMindMap/) — Apache License 2.0
'use strict';

/*
 * First-run starter map.
 *
 * On the very first visit (nothing saved in this browser yet) the app seeds
 * this instructional tree instead of an empty project, so newcomers land on a
 * short interactive guide. It is plain data — a nested tree of
 * { text, note, children } — that app.js turns into a real document (assigning
 * node ids). `note` is an optional Markdown description shown in the right-hand
 * panel; nodes that have one display a 🗒 marker. Text and notes may use the
 * placeholders {{app}}, {{version}} and {{home}}; app.js fills them in while
 * building the document, because this file is loaded before the constants exist.
 *
 * This starter is ephemeral: app.js marks it with a non-serialised `isWelcome`
 * flag so it is never auto-saved, and it re-seeds fresh from this file on every
 * visit. Editing it is just a preview; it becomes a real, saved project only
 * when the user clicks New/Open or names it via Save As — at which
 * point this starter is gone. Nothing here is special; it is just the initial
 * content, and changes to this file always show on the next reload.
 */
(function (global) {

  global.WELCOME_TREE = {
    text: 'Welcome to UMindMap 🌀',
    note:
      '**UMindMap** is a keyboard-first outliner / mind map — a nested list of ' +
      'editable nodes.\n\n' +
      'This is a starter map. Explore the branches below, then press **New** ' +
      'for a blank project or **Open** to load a saved `.json` file. ' +
      'Everything here is editable — delete these nodes whenever you are ready.\n\n' +
      '_You are running {{app}} {{version}}._',
    children: [
      {
        text: 'Add & structure nodes ⌨️',
        note: 'Every action is a keystroke on the **focused** node. Click a node to focus it, then try these:',
        children: [
          {
            text: 'Enter — new node',
            note:
              'The new node lands where you are looking:\n\n' +
              '- normally **below** the focused node;\n' +
              '- as its **first child** when its children are expanded, ' +
              'since a sibling would end up past the whole branch;\n' +
              '- **above** it when the caret sits at the very start of the text.\n\n' +
              'A **collapsed** node counts as a leaf: its hidden children stay ' +
              'untouched and the new node becomes a sibling below.',
            children: [],
          },
          { text: 'Tab — indent (become a child of the node above)', note: '', children: [] },
          { text: 'Shift+Tab — outdent (become a sibling of the parent)', note: '', children: [] },
          { text: '↑ / ↓ — move focus between nodes', note: '', children: [] },
          { text: 'Alt+↑ / Alt+↓ — reorder among siblings', note: '', children: [] },
          {
            text: 'Backspace on an empty node — delete it',
            note: 'Deleting an empty node keeps its children: they are re-attached to the parent.',
            children: [],
          },
          { text: 'Ctrl+Z / Ctrl+Shift+Z — undo / redo', note: '', children: [] },
        ],
      },
      {
        text: 'Descriptions ✏️',
        note:
          'Any node can carry a longer **description** written in Markdown — ' +
          'shown right here in this panel.\n\n' +
          'Press **Alt+Enter** on a node (or click its 🗒 marker) to edit it. ' +
          'Try editing this one!\n\n' +
          '### Markdown you can use\n\n' +
          '- **bold**, _italic_ and `inline code`\n' +
          '- bullet or numbered lists\n' +
          '- > block quotes\n' +
          '- [links](https://ujorm.org) and images\n' +
          '- tables and fenced code blocks\n\n' +
          '```js\n' +
          'function greet(name) {\n' +
          '  const text = "Hello, " + name;   // escaped & preserved\n' +
          '  return text;\n' +
          '}\n' +
          '```\n\n' +
          'One click on an `inline code` span copies it to the clipboard — ' +
          'and one click anywhere in the block above copies all of it, ' +
          'line breaks and indentation included. The `js` after the opening ' +
          'fence only names the language: it is neither shown nor copied.',
        children: [
          {
            text: 'Nodes with a description show a 🗒 — click it to open',
            note: 'See? This node has its own description. The 🗒 after the text opens it.',
            children: [],
          },
        ],
      },
      {
        text: 'Collapse & expand ▸',
        note: 'Click the ▸ / ▾ toggle in the left gutter to fold a branch. Folding is a view setting — the hidden nodes and their data are kept.',
        children: [
          { text: 'A child node', note: '', children: [] },
          { text: 'Another child — fold this branch to tidy up', note: '', children: [] },
        ],
      },
      {
        text: 'Move nodes with the mouse ⠿',
        note:
          'Prefer dragging? Grab the ⠿ grip on the left of a node and drop it ' +
          'before or after another node — at any level — to reorder or ' +
          're-parent it.\n\n' +
          'Dropping it **on the middle of a node that has children** makes it ' +
          'the last child of that branch. A folded branch (one showing ▸) ' +
          'stays folded, so this files the node away out of sight. The thin ' +
          'top and bottom edges of such a row still mean before / after.',
        children: [],
      },
      {
        text: 'Saving your work 💾',
        note:
          'Your map is **auto-saved in this browser** (localStorage), so it ' +
          'survives a reload with zero effort.\n\n' +
          '- **Save / Save As** — export a `.json` file to disk (backup, or move between machines)\n' +
          '- **Open** — load a `.json` file back\n' +
          '- **New** — start a fresh, empty project\n\n' +
          'Want this guide back? Open [?welcome](?welcome) ' +
          '(e.g. `http://localhost:8000/?welcome`) — it shows this guide again ' +
          'and leaves your own maps untouched.',
        children: [],
      },
      {
        text: 'About UMindMap ℹ️',
        note:
          'UMindMap is a **free, open-source, self-hosted** mind-mapping app — ' +
          'no account, no cloud, no lock-in.',
        children: [
          {
            text: 'Open source — Apache License 2.0',
            note:
              'UMindMap is licensed under the **Apache License 2.0**: you are free ' +
              'to use, modify and self-host it, with an explicit patent grant. ' +
              'The full text is in the `LICENSE` file in the repository.',
            children: [],
          },
          {
            text: 'Source code, issues & contributions',
            note:
              'Browse the code, report a bug or contribute at ' +
              '[github.com/pponec/UMindMap](https://github.com/pponec/UMindMap).',
            children: [],
          },
          {
            text: 'Your data stays private 🔒',
            note:
              'Everything you type is stored **locally in this browser** ' +
              '(localStorage) and in the `.json` files you choose to export. ' +
              'Nothing is ever sent to a server.',
            children: [],
          },
        ],
      },
      {
        text: 'Ready? Start here 🚀',
        note:
          'Click **New** for an empty project, or **Open** to load a saved ' +
          '`.json`. Or simply start editing this map — as soon as you change ' +
          'anything it becomes your own auto-saved project.',
        children: [],
      },
    ],
  };

})(window);
