# Changelog

All notable changes to this project will be documented in this file.

## [1.0.1] - 2026-08-14

### Added

- **One-click install**: in-repo `install.ps1` — `irm … | iex` remote install that auto-provisions pnpm, auto-detects git (tarball fallback), and updates on re-run.
- **Remote install forms** in the READMEs: `dsh plugin --profile web add github:Han-1413141/dsh-sticky-disclosure` and the GitHub archive tarball — no clone required.
- CI: `install-smoke` workflow verifying the one-click install path on Windows and Linux runners.

### Fixed

- **Off-screen affix chips no longer flash or ignore clicks**: the update loop kept re-appending already-ordered chips and rewriting the same pill count text, which triggered the plugin's own `MutationObserver` and caused endless DOM churn. The dock is now only touched when its order actually changes, and the pill count text is only rewritten when it differs.

## [1.0.0] - 2026-08-14

### Added

- **Customizable collapse hotkey**:
  - gear button beside the collapse-all pill opens a themed settings popover showing the current shortcut;
  - one-click capture ("press the new combo"), Escape-to-cancel, reset-to-default;
  - persisted in `localStorage` (`dsh-sticky-disclosure:hotkey`), validated on load with fallback to `Ctrl+Alt+C`; at least one of Ctrl/⌘/Alt is required, Escape is reserved;
  - programmatic surface: `window.dshStickyDisclosure.setHotkey(spec)` / `.hotkey()`.
- Demo assets: real-instance screenshots (`docs/assets/screenshot-01…05.png`) and an animated demo (`docs/assets/demo.gif`) embedded in the READMEs.
- Test coverage for the whole customization flow (capture, cancel, persistence, reset, invalid specs) — 48 assertions total.

### Changed

- Hotkey matching is now spec-driven (exact modifier match + `KeyboardEvent.code`), tooltips always render the active shortcut.

## [0.2.0] - 2026-08-14

### Changed

- **Always-visible presence**: a floating "collapse all" pill now sits at the bottom-right corner of the conversation scrollport with a live count of expanded sections. It appears the moment the plugin loads, making "is the plugin active?" answerable at a glance — no scrolling required.
- **Hotkey semantics**: `Ctrl+Alt+C` (and the pill) now collapse **every** expanded section in the conversation — visible ones included — so pressing the hotkey always has an immediately observable effect.
- `console.info("[dsh-sticky-disclosure] applied …")` on apply, for instant verification in DevTools.
- Debug handle `window.dshStickyDisclosure` (`version`, `expanded()`, `affixed()`).

### Fixed

- Hotkey previously did nothing while the composer input held focus (the default state); it now works there, remaining IME/AltGr-safe.

## [0.1.0] - 2026-06-17

Initial release.

### Added

- Affix chips for expanded disclosures (`Think` rows, tool cards, command cards, context rows) that slide out of the top of the conversation viewport:
  - pinned at the top edge of the chat scrollport, aligned with the content padding;
  - labelled with the section title, ordered by document position, wrapping when needed;
  - click a chip to collapse the original section through its real toggle (app-owned React state);
  - chips disappear automatically when the header returns into view or the section is collapsed by any means.
- Collapse-all hotkey `Ctrl+Alt+C` (macOS `⌘+Option+C`), active even while the composer input is focused; IME (`isComposing`) and AltGr (`AltGraph`) safe.
- Stacking: `z-index: 15` — above chat content, below the app overlay layer and every dialog; fully themed with `--dsw-*` design tokens, `prefers-reduced-motion` aware.
- Full lifecycle cleanup on plugin disposal (HMR/stop).
- Test harness (`test/mock.html` + `test/verify.py`, 27 Playwright assertions) and CI (`test.yml`).
- Documentation: `README.md` / `README.en.md` / `docs/ARCHITECTURE.md`.
