<!--
English version of the article about UMind, told through one example: planning a trip.

The two pictures live next to this file:

  img-edit.png    — editing mode
  img-graph.png   — presentation mode

Before publishing, upload both with the dev.to image button and replace the
paths with the URLs dev.to returns.

Suggested tags: #showdev #javascript #productivity #opensource
-->

<div style="margin-top: 10px; margin-left: 10px; width: 800px;">

# UMind: Write mind maps as a list

**UMind** is a minimalist web app for building mind maps. You write your ideas as a plain nested outline and turn them into a clean SVG mind map with a single click. Everything runs locally in your browser—no account, no dependencies—and your data never leaves your local browser.

Many mind-mapping apps are built around drawing and dragging nodes around by hand. UMind takes the opposite path. You focus on the content and the structure first, and only then does the app build the graph for you automatically. There's no node placement to fuss over and no styling to tweak. As a walkthrough, let's plan a simple example: a weekend trip.

---

A mind map is a visual tool for organizing ideas, planning, and learning more effectively. Instead of long, linear prose, it uses a tree structure. Everything starts with a central topic, out of which grow the main branches that stand for the key areas, and those in turn split into specific notes, ideas, or examples. This way of working closely matches how we naturally think—through connections and associations—so it's easier to keep the big picture in view and to remember the information.

**UMind** is a small app for building exactly these kinds of tree structures. Each node holds a short title and, optionally, a longer description as well: a paragraph of notes, a table, a link, a checklist, or anything else that would otherwise end up in a separate document or a sticky note.

The whole application is a static web page made of a handful of HTML, JavaScript, and CSS files. It needs no build step, no dependencies, and no server backend. There's no telemetry, and everything happens locally in your browser, so nothing you type ever leaves your computer.

Because of that, there's nothing to install. You can use the publicly hosted version, or copy the app onto your own website, a company server, or a USB drive. It works without an internet connection too. And since there's no server, there's no account to create and no passwords or sign-ups to deal with.

Maps are saved continuously into `localStorage`, so they stay in one specific browser on one specific computer. The **Save** button writes the whole document into a plain `.json` file that you can archive, share, or open on another device with the **Open** button.

The app can also be run locally. The project includes two simple helper scripts that start a small web server—one uses Python 3 (`python3 run.py`), the other Java 17+ (`java Run.java`). Both serve the app at `http://localhost:8000/`. Opening `index.html` directly over `file://` often works, but some browsers restrict `localStorage` in that mode, so using a local server is more reliable.

When you work, the keyboard comes first. You create a new node at the same level with <kbd>Enter</kbd>, go one level deeper with <kbd>Tab</kbd>, and come back up with <kbd>Shift</kbd>+<kbd>Tab</kbd>. You open the dialog with the detailed description using <kbd>Alt</kbd>+<kbd>Enter</kbd>. The mouse is mainly for moving branches around or collapsing them. Content is created in editing mode, and a single click on **Show graph** turns it into a picture. The app's interface is in English, as you can see in the images below.

## Editing mode: how a plan takes shape

![UMind in editing mode: the trip outline on the left, the description of the selected node on the right](img-edit.png)

Imagine we're planning a weekend trip with the team, but none of the details are settled yet. The destination becomes the root of the map. Right under it we add the basic questions: how do we get there, where do we sleep, what do we want to see, where do we eat, and what needs to be arranged before we leave. In just a few minutes we have the skeleton of the whole map, and every other piece of information now has its place.

Answers arrive gradually, and often in random order. A colleague recommends the old bridge at sunrise, so a new node appears under *What to see*, and its description captures the reason it's worth seeing in the morning specifically.

A comparison of the train, the night bus, and the flight can live as a small table in the description of the *Getting there* node, together with a short conclusion: the train wins because it runs city center to city center. A week later, nobody has to reopen a bunch of tabs to remember why the other option was rejected.

Meanwhile, the outline can keep changing. *Beer garden by the river* first shows up among the sights and later moves under *Food & drink*. The keys <kbd>Alt</kbd>+<kbd>↑</kbd> and <kbd>Alt</kbd>+<kbd>↓</kbd> let you reorder nodes, finished branches can be collapsed, and you can focus only on the parts still in progress. The titles stay easy to scan, all the related information is in one place, and the plan doesn't scatter across several different documents.

## Presentation mode: the same document as a clean graph

![The same map in presentation mode: the root in the center, branches to both sides, descriptions drawn as notes](img-graph.png)

With a single click, the text outline turns into a clean mind map. The main topic stays in the center, the branches are laid out automatically on both sides, and the detailed notes appear next to their nodes—formatted with basic Markdown.

The layout is computed by the app, so there's no need to move individual nodes by hand. The resulting map can be downloaded as a single SVG file that opens without any trouble in a regular browser or on a phone.

With colleagues, you can share either the finished picture or the source JSON file directly, which each person can open and edit in their own copy of the app. The file can be emailed or stored in a Git repository.

If you host UMind yourself—for free on GitHub Pages, for example—you just drop the map file into the `data/` folder next to the app. The map can then be opened directly through the address `...?name.json`, with nothing for the visitor to install. That's exactly how the sample trip map from this article works; you can open it at `https://pponec.github.io/UMind/?demo-trip.json`.

Sharing is safe by the very way the app works. UMind is only HTML, CSS, and JavaScript running in a browser. It has no access to other files and runs no programs on the visitor's computer. On top of that, a static host such as GitHub Pages runs no code on the server—it only serves static files. So a shared map can do exactly one thing: display its content. If someone wants to edit it, they click **Edit map** and get their own copy in their browser.

## Summary

The goal isn't to make a pretty picture, but to reach a better decision.

UMind is built on a simple idea: the outline is where ideas take shape, and the graph is how you present them. Both are files that stay in your hands. No account, no cloud service, no installation, and no dependence on whether some online service still exists a few years from now.

If you'd like to try UMind, the ready-made welcome map is at:

https://pponec.github.io/UMind/?welcome

The project's source code (plain JavaScript, no frameworks or build step, Apache 2.0 license) is on GitHub:

https://github.com/pponec/UMind

Try using it to plan your next trip, prepare a talk, or do some research. You might find that, for once, a single document is all you need instead of a pile of open tabs.

</div>
