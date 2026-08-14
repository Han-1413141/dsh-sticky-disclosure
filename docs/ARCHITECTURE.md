# Architecture: dsh-sticky-disclosure

This document explains how the plugin is assembled into DeepSeek Harness Web, the DOM contracts it reads, its internal state model, and why each design decision was made. Written against DSH `0.1.0-rc.6`.

## 1. How a third-party client plugin enters DSH Web

The web surface is itself a composition of plugins, so a third-party package rides the same pipeline the built-in ones use:

```
profile (dsh.profile.bundles)                  $DSH_HOME/profiles/web/package.json
  └─ bundle package declaring dsh.bundle.patch  → cordis.patch.yml (ours: one `insert` row)
       └─ host tree entry `sticky-disclosure`
            └─ scanned by dsh-client-modules (node half) because package.json declares dsh.client
                 └─ window.__DSH_BOOT__.entries  ← { id, url: "/plugins/<id>/client.js?rev=<rev>" }
                      └─ Web shell kernel (ClientModuleSystem) prefetches the bundle script
                           └─ bundle calls window.__ModuleLoader__.load({ id, factory })
                                └─ vendored cordis Loader materializes the module, activates the fiber
                                     └─ apply(ctx) runs with the client root context
```

Key facts discovered while building this plugin:

- **The host scans *loaded* entries.** `dsh-client-modules` only sees packages that appear as entries with a fiber on the host cordis tree. A client-only plugin therefore still needs a host half that loads successfully — ours is an inert marker (`lib/index.js`).
- **The bundle is served verbatim.** `/plugins/<id>/client.js` returns the built artifact from `exports["./client"]` with `cache-control: no-cache` and a content-hash `?rev=` query. There is no runtime bundling for third-party packages: the file must be self-contained, which is why `lib/client.js` has zero imports.
- **`ctx.baseUrl` is anchored at the profile directory**, so a plugin installed into `$DSH_HOME/profiles/<name>/node_modules` (pnpm `link:`/`file:` or a hand-made junction) resolves through Node's ordinary parent-walk. `healProfilesModuleFallback` covers the in-box packages; profile-local ones come from the profile's own node_modules.
- **Plugin-set changes take effect on restart.** Package metadata is cached per name and never expires during a process lifetime; bundle *content* changes are re-hashed only through the HMR rebuild path.

### Package manifest anatomy

```jsonc
{
  "name": "dsh-sticky-disclosure",
  "type": "module",
  "exports": {
    ".": { "default": "./lib/index.js" },        // host half (marker)
    "./client": { "default": "./lib/client.js" } // browser bundle, served verbatim
  },
  "dsh": {
    "client": { "platform": "web", "inject": [] }, // scanned by dsh-client-modules
    "bundle": { "patch": "./cordis.patch.yml" }    // makes `dsh plugin add` reconcile it
  }
}
```

`cordis.patch.yml` adds one host-tree row, which is what puts the package on the scanner's radar:

```yaml
- insert:
    - id: sticky-disclosure
      name: 'dsh-sticky-disclosure'
```

The client bundle's handoff shape (matching the built-in packages exactly):

```js
window.__ModuleLoader__.load({
  id: "dsh-sticky-disclosure",          // must equal the graph row / entry options.name
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    // ... plugin code ...
    exports.name = "sticky-disclosure";
    exports.apply = apply;
    return module.exports;
  }
});
```

The factory runs at materialization (first import); `apply(ctx)` runs when the fiber activates. Lifecycle is the standard cordis surface available in the browser root context: `ctx.effect(fn, label)` where `fn` returns a disposer, plus `ctx.logger`.

## 2. DOM contracts this plugin reads

Both contracts belong to shipped packages (`dsh-client-ui-primitives` / `dsh-client-ui-conversation`). They are internal structure — not a public API — so the "Limitations" section of the README warns that upstream changes must be mirrored here.

### 2.1 DisclosureRow (the collapsible tag)

`DisclosureRow` renders:

```html
<div data-open>              <!-- root: data-open present ⇔ expanded -->
  <div data-disclosure-row>  <!-- header; role=button when expandOnRowClick -->
    <span|button class=leading>…</span|button>   <!-- chevron; a button when row-click disabled -->
    <span class=title>…</span>                    <!-- children[1]: the section title -->
    <span class=summary>…</span>                  <!-- collapsedContent (optional) -->
  </div>
  <div class=body>…</div>     <!-- children only when open -->
</div>
```

Used by (at least): `Think` reasoning rows (`[data-variant="think"]`), tool-call cards (`[data-variant="tool"|…]`, `data-tool`), generic command cards (`data-variant="others"`), and context-injection rows — so one generic selector covers all of them.

Two toggle shapes exist: rows that toggle on row-click carry `data-expandable`; otherwise the leading `button[aria-expanded]` toggles. `toggleTarget()` handles both.

### 2.2 The conversation scrollport

`[data-conversation-scroll]` is the resident scroll container of the chat surface (`overflow-y: auto`), holding the `conversation.session` slot and the `[data-composer-seat]` at its end. The composer's internal collapsibles must never be pinned, hence the `closest("[data-composer-seat]")` exclusion.

## 3. State model and update loop

- **`chips: Map<rowElement, chipElement>`** is the single source of truth for the affix chips; the floating pill is stateless (its count is recomputed from the DOM on every tick). Nothing else holds state.
- `update()` recomputes the world from scratch on every tick:
  1. resolve the scrollport and its rect (`usable` guard: width/height > 1px);
  2. iterate every `[data-disclosure-row]` inside it:
     - expanded ⇔ `row.parentElement` has `data-open`;
     - off-top ⇔ `row.getBoundingClientRect().bottom <= scrollportRect.top + 0.5` and not inside the composer seat;
  3. add missing chips, drop stale ones (header visible again, row collapsed, or row left the tree entirely);
  4. re-append chips in document order (`compareDocumentPosition`) so the dock always reads in reading order;
  5. position the dock at `scrollport.left + 32, scrollport.top + 8`, width `scrollport.width − 64`;
  6. `syncControl()`: keep the collapse-all pill present while the scrollport is usable, stamp its count (`expandedDisclosures().length`), and pin it to `scrollport.bottom-right − 16px`.
- Triggers for `update()` (all funneled through a single `requestAnimationFrame` gate):
  - `scroll` on `document` in capture phase (scroll events don't bubble; capture on document sees every scroller, so no per-element subscription is needed);
  - `MutationObserver` on `document.documentElement` (`childList` + `attributes`, filter `data-open` / `data-disclosure-row` / `aria-expanded`) — React's attribute toggles are the collapse/expand signal;
  - `ResizeObserver` on `document.body` and on the current scrollport element (followed by identity in `trackScrollport()`, since the resident element could in principle be replaced);
  - `window resize`.
- **Collapse = a real `click()`** on the original toggle. This goes through React's synthetic event system, so the app's own state stays the source of truth; the plugin then optimistically removes the chip, and the mutation-triggered `update()` reconciles whatever actually happened.
- **`collapseAll()`** (the pill and the hotkey) collapses every expanded disclosure in the conversation — visible or off-screen — then clears the chips and the dock. Collapsing *all* (rather than only the affixed ones) is deliberate: it makes the action observable even when nothing is off-screen, which is also what turns the hotkey into a reliable "is the plugin alive?" probe.

## 4. Hotkey design

`Ctrl+Alt+C` / `⌘+Option+C`, matched by `event.code === "KeyC"` (layout-independent) with `(ctrlKey || metaKey) && altKey && !shiftKey`. Guards, in order:

1. `event.defaultPrevented` — another handler already consumed it;
2. `event.isComposing` — never interrupt IME composition;
3. `event.getModifierState("AltGraph")` — on some layouts AltGr is reported as Ctrl+Alt; intercepting it would break typing. (This is also why the handler works while inputs are focused: the chord types nothing on US/Chinese layouts, so there is nothing to protect — and the composer holding focus is the *normal* state.)

`Escape` was deliberately avoided: dialogs and popups in the app own it.

The hotkey acts unconditionally (no "are there affixed chips?" gate): it collapses every expanded disclosure, so pressing it always does something visible whenever any section is expanded.

## 5. Stacking design

The shell's z-index ladder (observed in the built frontend CSS): content `0–6`, frame overlay layer `20`, popups `100–101`, dialogs `1000–1100`. The dock takes `15`:

- above every chat element, so nothing in the flow can cover the chips;
- below the frame overlay layer and every dialog, so the plugin never obscures permission prompts, settings, or the first-run mask — verified end-to-end: on a fresh instance the onboarding mask correctly stayed above the chips.

The dock is `position: fixed`, appended to `document.body` (no ancestor transforms/filters can trap it), repositioned on every update tick from the scrollport's live rect, with `pointer-events: none` on the container and `auto` on the chips — the dock row itself never intercepts clicks.

## 6. Styling

Chips and the collapse-all pill are styled exclusively with the app's `--dsw-*` design tokens (`--dsw-specific-tip` background, `--dsw-alias-border-l1` border, `--dsw-shadow-lv2` shadow, `--dsw-font-xxs-12` type, `--ds-ease-in-out` easing, `--dsw-alias-state-business-primary` focus ring). The tokens are defined on `body`, and both elements are children of `body`, so `var()` resolution is always in scope — dark/light themes and font swaps come for free. The pill dims to `opacity: .55` at count 0 (a "nothing expanded" affordance, not a disabled state). Entrance animation is disabled under `prefers-reduced-motion`.

The injected `<style>` follows the platform convention: `data-plugin` = package name (so the HMR driver can remove it by exact attribute match) and a unique `data-plugin-css` id for the loader's style record.

## 7. Testing strategy

Two layers, mirroring the risk profile:

1. **`test/mock.html` + `test/verify.py`** — a static page reproducing the exact DOM contract (DisclosureRow structure, scrollport, composer seat, mock toggle behavior), loading the real bundle through a stub `__ModuleLoader__` and a minimal cordis-like `ctx`. 35 Playwright assertions cover the always-visible pill (presence, count, bottom-right pinning), chip appearance, geometry, z-index, ordering, both toggle shapes, hotkey collapse-all (including visible sections and input-focused), pill click-to-collapse-all, auto-hide, composer exclusion, and full disposal.
2. **Real-instance E2E** (run manually, documented for contributors) — boot an isolated profile (`DSH_HOME` pointed at a scratch dir, different port) with the plugin in its bundles, then assert: the entry appears in `window.__DSH_BOOT__`, `/plugins/<id>/client.js` serves 200, the plugin's style tag exists, and — with a disclosure injected into the live DOM — chips pin, clicks collapse, the pill counts, and the hotkey works with the composer focused.

CI runs layer 1 on every push.
