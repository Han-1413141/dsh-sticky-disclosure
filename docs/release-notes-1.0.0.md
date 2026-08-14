# dsh-sticky-disclosure v1.0.0

Pin off-screen expanded collapsible tags (Think rows, tool cards, command cards) to the top of the conversation viewport — collapse them anytime, with a **customizable hotkey**.

## What's new in 1.0.0

- **Customizable collapse hotkey**
  - A gear button beside the collapse-all pill opens a themed settings popover showing the current shortcut.
  - One-click capture: press the new combo to set it. `Esc` cancels; one click restores the default `Ctrl+Alt+C` (macOS `⌘⌥C`).
  - Persisted in the browser's `localStorage` (`dsh-sticky-disclosure:hotkey`) — validated on load, `Escape` reserved, at least one of Ctrl/⌘/Alt required. Nothing leaves your machine.
  - Programmatic access: `window.dshStickyDisclosure.setHotkey({ ctrl: true, shift: true, code: "KeyK" })` / `.hotkey()`.

- **Illustrated docs**: real-instance screenshots and an animated demo GIF embedded in the READMEs (中文 / English), plus the architecture deep-dive.

- **Tests**: 48 Playwright assertions covering the full customization flow (capture, cancel, persistence, reset, invalid specs) — run on every push via GitHub Actions.

## Feature set (since 0.1)

- 🧲 Affix chips: expanded sections that slide off the top get their header pinned at the viewport top — click to collapse, auto-hides on scroll-back.
- 🔘 Always-visible collapse-all pill at the bottom-right of the chat, with a live expanded count (`·N`).
- ⌨️ Collapse-all hotkey (customizable), active even while the composer input is focused, IME/AltGr-safe.
- 🎨 Pure `--dsw-*` design-token styling — follows the app's themes and fonts; z-index 15 stays below dialogs and overlays.
- 🪶 Pure DOM implementation over the `DisclosureRow` contract; full cleanup on unload.

See [README](https://github.com/Han-1413141/dsh-sticky-disclosure#readme) for install, behavior, and screenshots.
