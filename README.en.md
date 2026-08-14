# dsh-sticky-disclosure

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tests](https://github.com/Han-1413141/dsh-sticky-disclosure/actions/workflows/test.yml/badge.svg)](https://github.com/Han-1413141/dsh-sticky-disclosure/actions/workflows/test.yml)
English | [中文](README.md)

A DeepSeek Harness (DSH) Web client plugin: when an **expanded collapsible tag** — the `Think` reasoning row, tool-call cards, command cards, context-injection rows, i.e. every `DisclosureRow` in the conversation flow — **scrolls out of the top of the chat viewport, its header is pinned to the viewport's top edge**, so you can collapse it at any time. A floating pill with a live count and a hotkey collapse **every** expanded section at once.

![affix chips](test/shot-chips.png)

## Why

The collapse control of a Think row or tool card *is* its header row. When the section is expanded and long, reading further pushes that header off screen — the only collapse control is now out of reach, and you have to scroll all the way back. This plugin detects the moment the header leaves the top edge and materializes a floating **affix chip** at the top of the viewport, keeping "collapse" in front of you. The chip disappears on its own once the section is collapsed (by any means) or the header scrolls back into view.

## Behavior

- **Always-visible "collapse all" pill** at the bottom-right corner of the conversation scrollport, with a live count of expanded sections (`·N`). It appears the moment the plugin loads — if you can see it, the plugin is live. Clicking it collapses every expanded section in the conversation, visible or not.
- For every expanded disclosure (`[data-disclosure-row]` under a `data-open` root) inside the conversation scrollport (`[data-conversation-scroll]`), once its header row fully slides past the scrollport's top edge, an affix chip (a small pill button) appears at the top of the scrollport, labelled with the section title (`Think`, the tool name, …).
- **Clicking a chip collapses the original section** by dispatching a real `click` on the original header — it goes through the app's own React state, exactly as if you clicked the header itself. The chip disappears immediately.
- Scrolling the header **back into view** removes the chip (the content stays expanded).
- Multiple off-screen sections form a row in **document order** (wrapping when needed), never overlapping.
- **Hotkey `Ctrl+Alt+C` (macOS `⌘+Option+C`)** collapses **every** expanded section in the conversation at once — visible ones included, so the effect is always observable on the spot.
- On apply, the plugin logs `console.info("[dsh-sticky-disclosure] applied …")` and exposes `window.dshStickyDisclosure` (`expanded()` / `affixed()`) for support.
- Streaming output, session switches, and expand/collapse state changes are tracked via `MutationObserver` + scroll listening; plugin disposal (HMR/stop) restores everything.

### Stacking

- The dock is fixed to the top edge of the conversation scrollport, horizontally aligned with the content's 32px padding; the collapse-all pill is fixed to the scrollport's bottom-right corner.
- `z-index: 15`: above chat content (0–6), below the app's overlay layer (20) and all dialogs/popups (100/1000-tier) — it never covers permission prompts, settings panels, or onboarding masks.
- Everything uses the app's design tokens (`--dsw-*`: background, border, shadow, type), so it follows dark/light themes and fonts automatically, with an entrance animation that respects `prefers-reduced-motion`.

### Hotkey design

Deliberately **not Escape**: the app's dialogs and popups already own `Escape`. `Ctrl+Alt+C` conflicts with no app shortcut, and:

- it **works while an input is focused** — the most common state, since focus usually stays in the composer;
- it backs off during IME composition (`isComposing`);
- it backs off on AltGr (`getModifierState("AltGraph")` — on some keyboard layouts AltGr is reported as Ctrl+Alt and must never intercept the characters it types).

## Install

> Requires: DeepSeek Harness (dsh CLI) with the Web surface. The plugin activates with `dsh web`.

### Option 1: `dsh plugin` (requires pnpm)

From this repository's **parent directory** (relative paths get anchored to the invoking directory):

```bash
# development (symlink; edit lib/client.js, restart dsh web, done):
dsh plugin --profile web add link:./dsh-sticky-disclosure
# or a fixed install:
# dsh plugin --profile web add file:./dsh-sticky-disclosure
```

### Option 2: manual (no pnpm)

1. In `<DSH_HOME>\profiles\web\package.json` (default `%USERPROFILE%\.dsh\profiles\web\package.json`):
   - add `"dsh-sticky-disclosure": "link:<absolute path of this repo>"` to `dependencies`
   - append `"dsh-sticky-disclosure"` to `dsh.profile.bundles`
2. Create a directory junction in the profile's node_modules (the same shape a pnpm `link:` dependency leaves behind):
   ```powershell
   New-Item -ItemType Junction `
     -Path "$env:USERPROFILE\.dsh\profiles\web\node_modules\dsh-sticky-disclosure" `
     -Target "<absolute path of this repo>"
   ```

### Activate

Plugin-set changes take effect on **restart** (a running server keeps its old graph). **The bundle itself is served `no-cache`**: after editing `lib/client.js`, a page refresh (Ctrl+F5) is enough to pick up the new code — no server restart needed.

```bash
# after the initial install: stop the current dsh web, then start it again
dsh web
```

Verify it entered the plugin graph (expect `id: sticky-disclosure` and `name: dsh-sticky-disclosure`):

```bash
dsh --profile web --dump-config | findstr sticky-disclosure
```

On the page, the "collapse all" pill at the bottom-right of the chat area means the plugin is active.

### Uninstall

- Option 1: `dsh plugin --profile web remove dsh-sticky-disclosure`
- Option 2: remove the entries from `package.json` (`dependencies`/`bundles`) and delete the `profiles\web\node_modules\dsh-sticky-disclosure` junction

Then restart `dsh web`.

## Tuning

All behavior parameters live in the constants block at the top of `lib/client.js`:

| Constant | Default | Meaning |
|---|---|---|
| `HOTKEY_LABEL` | `Ctrl+Alt+C` | Hotkey (label text; the actual check lives in `onKeyDown`) |
| `DOCK_INSET_X` | `32` | Horizontal inset of the chip dock (matches the content's 32px padding) |
| `DOCK_TOP_GAP` | `8` | Gap between the scrollport's top edge and the first chip row |
| `DOCK_Z_INDEX` | `15` | Stacking level (must stay below the app overlay layer at z-20) |
| `CHIP_MAX_WIDTH` | `260` | Max width of one chip (truncated beyond that) |
| `CONTROL_INSET` | `16` | Inset of the collapse-all pill from the scrollport's bottom-right corner |
| `EDGE_TOLERANCE` | `0.5` | Tolerance in px for "fully slid off the top edge" |

To change the hotkey, edit the modifier checks and `event.code` in `onKeyDown` (`lib/client.js`).

## Tests

```bash
python test/verify.py   # needs Python 3 + playwright (python -m playwright install chromium)
```

`test/` contains:

- `mock.html` — a static harness reproducing the DSH DOM contract (`DisclosureRow` structure + the `[data-conversation-scroll]` scrollport);
- `verify.py` — a Playwright verification script (35 assertions).

Coverage: always-visible pill and its count, chip appears after sliding off the top, dock position/gap/z-index (15), document order, click-to-collapse, `Ctrl+Alt+C` collapse-all (including visible sections and input-focused scenarios), pill click-to-collapse-all, chip disappears when the header becomes visible again (content stays expanded), composer panels never pinned, full restore on disposal.

> CI (`.github/workflows/test.yml`) runs the same suite on every push.

## Limitations

- Scoped to the **conversation flow** (inside `[data-conversation-scroll]`). The Trajectory view has its own scroll container and collapse controls and is out of scope.
- Only the "slid off the top" direction is handled (the common case: reading downward pushes the block out of view); off-the-bottom is not.
- It works through the `data-open` / `data-disclosure-row` DOM contract. If the upstream app changes that internal structure across upgrades, the selectors need to follow — see `docs/ARCHITECTURE.md`.

## Repository layout

```
dsh-sticky-disclosure/
├── .github/workflows/test.yml   # CI: Playwright verification suite
├── package.json                 # dsh.client (platform: web) + dsh.bundle declaration
├── cordis.patch.yml             # host-tree entry row (bundle patch)
├── lib/
│   ├── index.js                 # host half: inert marker plugin (no behavior)
│   └── client.js                # browser half: self-contained bundle (__ModuleLoader__ handoff)
├── test/
│   ├── mock.html                # static harness reproducing the DSH DOM contract
│   ├── verify.py                # Playwright verification script (35 assertions)
│   └── shot-chips.png           # screenshot (mock environment)
├── docs/ARCHITECTURE.md         # architecture and implementation details
├── README.md / README.en.md
└── LICENSE
```

## How it works

- Host side: `dsh-client-modules` scans Loader entries whose manifest declares `dsh.client.platform === "web"`, serves the built `exports["./client"]` artifact at `/plugins/<id>/client.js`, and injects the `window.__DSH_BOOT__` entry graph.
- Browser side: the bundle registers a module via `window.__ModuleLoader__.load({ id, factory })`, exports a cordis plugin (`name`/`apply`), and the Web shell's Loader activates it.
- The plugin body is pure DOM: it touches no app code — it reads the `data-open` / `data-disclosure-row` contract and dispatches clicks at the original headers, so it survives app upgrades, themes, and locales.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full pipeline, contracts, state model, and stacking design.

## License

[MIT](LICENSE)
