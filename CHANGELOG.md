# Changelog

All notable changes to this project will be documented in this file.

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
