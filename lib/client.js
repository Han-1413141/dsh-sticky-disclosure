/**
 * dsh-sticky-disclosure — browser half (v1.0).
 *
 * Purpose: when an expanded collapsible tag (the "Think" reasoning row, tool
 * call cards, generic command cards, context-injection rows — every
 * DisclosureRow in the conversation flow) scrolls out of the chat viewport
 * through its top edge, its header is the only control that can collapse it.
 * This plugin pins a small "affix chip" for each such header to the top edge
 * of the conversation scrollport, so the section stays collapsible while its
 * content is off screen.
 *
 * v0.2 added an always-visible presence: a floating "collapse all" pill at the
 * bottom-right of the conversation scrollport with a live expanded count, a
 * hotkey that collapses every expanded section (visible or not), a console
 * info line, and a debug handle.
 *
 * v1.0 adds a customizable hotkey:
 *   - a gear button beside the pill opens a themed settings popover showing the
 *     current shortcut, with one-click capture ("press the new combo"),
 *     reset-to-default, and Escape-to-cancel;
 *   - the hotkey persists in localStorage (key `dsh-sticky-disclosure:hotkey`)
 *     as a JSON spec { ctrl, meta, alt, shift, code } and loads on apply, with
 *     validation falling back to the default (Ctrl+Alt+C / ⌘⌥C);
 *   - `window.dshStickyDisclosure.setHotkey(spec)` / `.hotkey()` expose the
 *     same path programmatically.
 *
 * The bundle is dependency-free on purpose: dsh-client-modules serves the
 * built `./client` artifact verbatim to the browser, and a third-party package
 * cannot import anything the host build pipeline has not inlined. Everything
 * here is plain DOM + the cordis lifecycle the web shell hands to every client
 * plugin (`ctx.effect`, `ctx.logger`).
 *
 * DOM contract (owned by @deepseek-ai/dsh-client-ui-primitives' DisclosureRow):
 *   root[data-open] > div[data-disclosure-row]           (expanded disclosure)
 *   div[data-disclosure-row]                             (header; click toggles
 *                                                         when it carries
 *                                                         `data-expandable`,
 *                                                         else the leading
 *                                                         button[aria-expanded]
 *                                                         inside it toggles)
 * The conversation scrollport is the resident `[data-conversation-scroll]`
 * element of @deepseek-ai/dsh-client-ui-conversation.
 */

// The handoff contract of the web boot protocol: register this bundle's module
// under its package name (must equal the graph row / entry options.name).
window.__ModuleLoader__.load({
  id: "dsh-sticky-disclosure",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    //#region dsh-sticky-disclosure client

    const PACKAGE_ID = "dsh-sticky-disclosure";
    const PLUGIN_NAME = "sticky-disclosure";
    const PLUGIN_VERSION = "1.0.1";
    /** localStorage key holding the JSON hotkey spec. */
    const STORAGE_KEY = "dsh-sticky-disclosure:hotkey";
    /** Fallback hotkey: Ctrl+Alt+C (Cmd+Option+C on macOS). */
    const DEFAULT_HOTKEY = { ctrl: !isMacLike(), meta: isMacLike(), alt: true, shift: false, code: "KeyC" };
    const SCROLLPORT_SELECTOR = "[data-conversation-scroll]";
    const ROW_SELECTOR = "[data-disclosure-row],button[data-turn-process]";
    /** Horizontal inset of the chip dock, mirroring the scrollport's 32px content padding. */
    const DOCK_INSET_X = 32;
    /** Vertical gap between the scrollport's top edge and the first chip row. */
    const DOCK_TOP_GAP = 8;
    /** Pixels of tolerance for "fully slid off the top edge". */
    const EDGE_TOLERANCE = 0.5;
    const CHIP_MAX_WIDTH = 260;
    /** Inset of the floating collapse-all pill from the scrollport's bottom-right corner. */
    const CONTROL_INSET = 16;
    /** Below the frame overlay layer (z-20) and every dialog/popup, above chat content. */
    const DOCK_Z_INDEX = "15";
    /** The settings popover sits above the chips but still below app overlays. */
    const PANEL_Z_INDEX = "16";
    const STYLE_ID = "dsh-sticky-disclosure/styles.css";
    const MESSAGES = {
      zh: {
        collapse: "全部收起", collapseAll: "收起全部展开区块", collapseOne: "收起 ",
        chipHint: "点击收起", settings: "快捷键设置", title: "收起全部快捷键",
        close: "关闭", set: "设置", capture: "请按新组合键…", reset: "恢复默认",
        captureHint: "按下新的组合键（需含 Ctrl/⌘/Alt 之一）… 按 Esc 取消",
        savedHint: "快捷键保存在此浏览器中，刷新后仍然有效。", section: "区块",
      },
      en: {
        collapse: "Collapse all", collapseAll: "Collapse all expanded sections", collapseOne: "Collapse ",
        chipHint: "Click to collapse", settings: "Shortcut settings", title: "Collapse-all shortcut",
        close: "Close", set: "Set", capture: "Press new shortcut…", reset: "Reset to default",
        captureHint: "Press a shortcut with Ctrl, ⌘ or Alt. Press Esc to cancel.",
        savedHint: "Saved in this browser and kept after reloading.", section: "Section",
      },
    };

    function locale() {
      return (document.documentElement.lang || navigator.language || "zh").toLowerCase().startsWith("zh") ? "zh" : "en";
    }

    function t(key) { return MESSAGES[locale()][key]; }

    function setText(el, text) {
      if (el !== null && el.textContent !== text) el.textContent = text;
    }

    /** Whether the platform is macOS-ish (for ⌃⌥⇧⌘ labels). */
    function isMacLike() {
      return document.documentElement.dataset.platform === "darwin" ||
        (typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent || ""));
    }

    /** Human-readable key label from a KeyboardEvent.code. */
    function keyLabel(code) {
      if (/^Key[A-Z]$/.test(code)) return code.slice(3);
      if (/^Digit[0-9]$/.test(code)) return code.slice(5);
      const map = {
        ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→",
        BracketLeft: "[", BracketRight: "]", Backquote: "`", Minus: "-",
        Equal: "=", Semicolon: ";", Quote: "'", Comma: ",", Period: ".",
        Slash: "/", Backslash: "\\", Space: "Space", Enter: "Enter",
        Tab: "Tab", Escape: "Esc", Delete: "Del", Backspace: "⌫",
      };
      if (map[code] !== undefined) return map[code];
      return code;
    }

    /** Display label for a hotkey spec (e.g. "Ctrl+Alt+C", "⌘⌥C"). */
    function labelOfHotkey(spec) {
      const mac = isMacLike();
      const parts = [];
      if (spec.ctrl) parts.push(mac ? "⌃" : "Ctrl");
      if (spec.meta) parts.push(mac ? "⌘" : "Meta");
      if (spec.alt) parts.push(mac ? "⌥" : "Alt");
      if (spec.shift) parts.push(mac ? "⇧" : "Shift");
      parts.push(keyLabel(spec.code));
      return parts.join("+");
    }

    /** Validate a raw spec into a hotkey, or null. */
    function normalizeHotkey(raw) {
      if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
      if (typeof raw.code !== "string" || raw.code === "") return null;
      // Escape is reserved (app dialogs own it), and a combo needs at least
      // one real modifier so it can never collide with typing.
      if (raw.code === "Escape" || raw.code === "Unidentified" || /^(Control|Shift|Alt|Meta)(Left|Right)$/.test(raw.code)) return null;
      if (!(raw.ctrl === true || raw.meta === true || raw.alt === true)) return null;
      return {
        ctrl: raw.ctrl === true,
        meta: raw.meta === true,
        alt: raw.alt === true,
        shift: raw.shift === true,
        code: raw.code,
      };
    }

    /** Load the persisted hotkey, falling back to the default. */
    function loadHotkey() {
      try {
        const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
        const spec = normalizeHotkey(raw);
        if (spec !== null) return spec;
      } catch (_) {
        /* corrupt storage falls back */
      }
      return { ...DEFAULT_HOTKEY };
    }

    /** Persist the hotkey spec (best-effort; private mode may throw). */
    function saveHotkey(spec) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(spec));
      } catch (_) {
        /* non-persistent, still works for this page lifetime */
      }
    }

    /** Human-readable label for a disclosure header (its title text). */
    function labelOf(row) {
      if (row.matches("button[data-turn-process]")) return (row.textContent || t("section")).trim().slice(0, 80);
      const title = row.children[1];
      const text = title && title.textContent ? title.textContent.trim() : "";
      if (text !== "") return text.slice(0, 80);
      const variantHost = row.closest("[data-variant]");
      const variant = variantHost === null ? "" : variantHost.getAttribute("data-variant");
      if (variant !== null && variant !== "" && variant !== "others") return variant;
      return t("section");
    }

    /** The element whose click toggles this disclosure. */
    function toggleTarget(row) {
      if (row.matches("button[data-turn-process]")) return row;
      if (row.hasAttribute("data-expandable")) return row;
      const button = row.querySelector("button[aria-expanded]");
      return button === null ? row : button;
    }

    /** Collapse one disclosure by dispatching a real click to its toggle. */
    function collapseRow(row) {
      const target = toggleTarget(row);
      if (row.isConnected && target !== null && !target.disabled) target.click();
    }

    /** Read the plugin's own CSS into the document once (HMR-safe style record). */
    function installStyles() {
      if (document.querySelector("style[data-plugin-css=" + JSON.stringify(STYLE_ID) + "]") !== null) return null;
      const css = [
        ".dshSd_dock,.dshSd_control,.dshSd_gear,.dshSd_panel{-webkit-app-region:no-drag}",
        ".dshSd_dock{position:fixed;z-index:" + DOCK_Z_INDEX + ";display:flex;flex-wrap:wrap;align-items:flex-start;gap:8px;box-sizing:border-box;pointer-events:none}",
        ".dshSd_chip{pointer-events:auto;display:inline-flex;align-items:center;gap:6px;max-width:" + CHIP_MAX_WIDTH + "px;height:28px;box-sizing:border-box;padding:0 10px 0 8px;",
        "border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:var(--dsw-specific-tip);color:var(--dsw-alias-label-secondary);",
        "box-shadow:var(--dsw-shadow-lv2);font:var(--dsw-font-xxs-12);cursor:pointer;animation:dshSd_chip-in .16s var(--ds-ease-in-out)}",
        ".dshSd_chip:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}",
        ".dshSd_chip:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}",
        ".dshSd_icon{flex:none;place-items:center;display:grid;color:var(--dsw-alias-label-tertiary)}",
        ".dshSd_label{min-width:0;text-overflow:ellipsis;white-space:nowrap;overflow:hidden}",
        ".dshSd_control{position:fixed;z-index:" + DOCK_Z_INDEX + ";pointer-events:auto;display:inline-flex;align-items:center;gap:6px;height:28px;box-sizing:border-box;padding:0 10px 0 8px;",
        "border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:var(--dsw-specific-tip);color:var(--dsw-alias-label-secondary);",
        "box-shadow:var(--dsw-shadow-lv2);font:var(--dsw-font-xxs-12);cursor:pointer;animation:dshSd_chip-in .16s var(--ds-ease-in-out)}",
        ".dshSd_control:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}",
        ".dshSd_control:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}",
        ".dshSd_control[data-count=\"0\"]{opacity:.55}",
        ".dshSd_count{color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}",
        ".dshSd_gear{position:fixed;z-index:" + DOCK_Z_INDEX + ";pointer-events:auto;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;box-sizing:border-box;",
        "border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:var(--dsw-specific-tip);color:var(--dsw-alias-label-secondary);",
        "box-shadow:var(--dsw-shadow-lv2);cursor:pointer;opacity:.75}",
        ".dshSd_gear:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);opacity:1}",
        ".dshSd_gear:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}",
        ".dshSd_panel{position:fixed;z-index:" + PANEL_Z_INDEX + ";pointer-events:auto;width:280px;max-width:calc(100vw - 16px);box-sizing:border-box;padding:12px;",
        "border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-specific-tip);color:var(--dsw-alias-label-secondary);",
        "box-shadow:var(--dsw-shadow-lv2);font:var(--dsw-font-xxs-12);animation:dshSd_chip-in .16s var(--ds-ease-in-out)}",
        ".dshSd_panelTitle{display:flex;align-items:center;justify-content:space-between;gap:8px;color:var(--dsw-alias-label-primary);font-weight:500}",
        ".dshSd_panelRow{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:10px}",
        ".dshSd_panelHint{color:var(--dsw-alias-label-tertiary);margin-top:8px;line-height:16px}",
        ".dshSd_kbd{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);border-radius:6px;padding:1px 7px;",
        "font-family:var(--ds-font-family-code, monospace);color:var(--dsw-alias-label-primary);white-space:nowrap}",
        ".dshSd_btn{height:26px;padding:0 10px;border:none;border-radius:8px;background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary);",
        "font:var(--dsw-font-xxs-12);cursor:pointer}",
        ".dshSd_btn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}",
        ".dshSd_btn:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}",
        ".dshSd_btn[data-armed]{background:var(--dsw-alias-state-business-primary);color:#fff}",
        ".dshSd_close{border:none;background:0 0;color:var(--dsw-alias-label-tertiary);cursor:pointer;font-size:14px;line-height:1;padding:2px 4px;border-radius:6px}",
        ".dshSd_close:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}",
        "@keyframes dshSd_chip-in{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}",
        "@media (prefers-reduced-motion:reduce){.dshSd_chip,.dshSd_control,.dshSd_panel{animation:none}}",
      ].join("");
      const tag = document.createElement("style");
      tag.dataset.plugin = PACKAGE_ID;
      tag.dataset.pluginCss = STYLE_ID;
      tag.textContent = css;
      document.head.appendChild(tag);
      return tag;
    }

    /** Plugin body. */
    function apply(ctx) {
      /** row element -> its live affix chip. */
      const chips = new Map();
      /** Shared chip dock (top edge); created lazily, removed while empty. */
      let dock = null;
      /** Floating collapse-all pill (bottom-right); present while the scrollport exists. */
      let control = null;
      /** Gear button beside the pill. */
      let gear = null;
      /** Settings popover; created lazily, removed while closed. */
      let panel = null;
      /** Active hotkey spec. */
      let hotkey = loadHotkey();
      /** Whether the settings popover is capturing the next combo. */
      let capturing = false;
      let rafPending = false;
      let disposed = false;
      let resizeObserver = null;
      let observedScrollport = null;
      let lastLocale = locale();

      function currentScrollport() {
        for (const el of document.querySelectorAll(SCROLLPORT_SELECTOR)) {
          if (!(el instanceof HTMLElement)) continue;
          const rect = el.getBoundingClientRect();
          if (rect.width > 1 && rect.height > 1) return el;
        }
        return null;
      }

      function ensureDock() {
        if (dock !== null && dock.isConnected) return dock;
        dock = document.createElement("div");
        dock.className = "dshSd_dock";
        dock.setAttribute("data-sticky-disclosure-dock", "");
        document.body.appendChild(dock);
        return dock;
      }

      function removeDock() {
        if (dock === null) return;
        dock.remove();
        dock = null;
      }

      function removeControl() {
        if (control === null) return;
        control.remove();
        control = null;
      }

      function removeGear() {
        if (gear === null) return;
        gear.remove();
        gear = null;
      }

      function removePanel() {
        disarmCapture();
        if (panel === null) return;
        if (panel.contains(document.activeElement) && gear !== null) gear.focus();
        panel.remove();
        panel = null;
        if (gear !== null) gear.setAttribute("aria-expanded", "false");
      }

      /** Every expanded disclosure in the conversation flow (composer excluded). */
      function expandedDisclosures() {
        const sp = currentScrollport();
        if (sp === null) return [];
        const out = [];
        const rows = sp.querySelectorAll(ROW_SELECTOR);
        for (const row of rows) {
          const expanded = row.matches("button[data-turn-process]")
            ? !row.disabled && row.getAttribute("aria-expanded") === "true"
            : row.parentElement !== null && row.parentElement.hasAttribute("data-open");
          if (expanded && row.closest("[data-composer-seat]") === null) out.push(row);
        }
        return out;
      }

      /** Collapse every expanded disclosure in the conversation at once. */
      function collapseAll() {
        const rows = expandedDisclosures();
        // Children first: closing a process group can unmount its inner rows.
        for (const row of rows.reverse()) collapseRow(row);
        for (const chip of chips.values()) chip.remove();
        chips.clear();
        removeDock();
      }

      function createChip(row) {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "dshSd_chip";
        chip.setAttribute("data-sticky-disclosure-chip", "");
        const label = labelOf(row);
        chip.setAttribute("aria-label", t("collapseOne") + label);
        chip.title = t("chipHint") + " · " + labelOfHotkey(hotkey) + " · " + t("collapse");
        const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        icon.setAttribute("width", "14");
        icon.setAttribute("height", "14");
        icon.setAttribute("viewBox", "0 0 14 14");
        icon.setAttribute("fill", "none");
        icon.setAttribute("aria-hidden", "true");
        icon.setAttribute("class", "dshSd_icon");
        icon.innerHTML = '<path d="M10.5 8.75 7 5.25l-3.5 3.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>';
        const text = document.createElement("span");
        text.className = "dshSd_label";
        text.textContent = label;
        chip.append(icon, text);
        chip.addEventListener("click", () => {
          collapseRow(row);
          // Optimistic removal; the MutationObserver reconciles if the app
          // ignored the toggle (e.g. the row was replaced mid-gesture).
          const live = chips.get(row);
          if (live !== undefined) {
            live.remove();
            chips.delete(row);
          }
          if (chips.size === 0) removeDock();
        });
        return chip;
      }

      function createControl() {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "dshSd_control";
        btn.setAttribute("data-sticky-disclosure-control", "");
        btn.title = t("collapseAll") + " · " + labelOfHotkey(hotkey);
        btn.setAttribute("aria-label", t("collapseAll"));
        const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        icon.setAttribute("width", "14");
        icon.setAttribute("height", "14");
        icon.setAttribute("viewBox", "0 0 14 14");
        icon.setAttribute("fill", "none");
        icon.setAttribute("aria-hidden", "true");
        icon.setAttribute("class", "dshSd_icon");
        icon.innerHTML = '<path d="M10.5 8.75 7 5.25l-3.5 3.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>';
        const label = document.createElement("span");
        label.className = "dshSd_label";
        label.textContent = t("collapse");
        const count = document.createElement("span");
        count.className = "dshSd_count";
        btn.append(icon, label, count);
        btn.addEventListener("click", collapseAll);
        return btn;
      }

      function createGear() {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "dshSd_gear";
        btn.setAttribute("data-sticky-disclosure-gear", "");
        btn.title = t("settings");
        btn.setAttribute("aria-label", t("settings"));
        btn.setAttribute("aria-haspopup", "dialog");
        btn.setAttribute("aria-expanded", "false");
        const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        icon.setAttribute("width", "14");
        icon.setAttribute("height", "14");
        icon.setAttribute("viewBox", "0 0 14 14");
        icon.setAttribute("fill", "none");
        icon.setAttribute("aria-hidden", "true");
        icon.innerHTML = '<path d="M2 4.5h10a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="1.1"/><path d="M4 7h.01M6 7h.01M8 7h.01M10 7h.01M5.5 9h3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>';
        btn.append(icon);
        btn.addEventListener("click", () => {
          if (panel !== null && panel.isConnected) {
            removePanel();
            return;
          }
          openPanel();
        });
        return btn;
      }

      /** Rebuild the settings popover content in place. */
      function renderPanel() {
        if (panel === null || !panel.isConnected) return;
        const current = labelOfHotkey(hotkey);
        const focused = panel.contains(document.activeElement) ? document.activeElement.dataset.action : null;
        panel.innerHTML = "";
        const title = document.createElement("div");
        title.className = "dshSd_panelTitle";
        const titleText = document.createElement("span");
        titleText.textContent = t("title");
        const close = document.createElement("button");
        close.type = "button";
        close.className = "dshSd_close";
        close.setAttribute("aria-label", t("close"));
        close.dataset.action = "close";
        close.textContent = "✕";
        close.addEventListener("click", removePanel);
        title.append(titleText, close);
        const row = document.createElement("div");
        row.className = "dshSd_panelRow";
        const kbd = document.createElement("span");
        kbd.className = "dshSd_kbd";
        kbd.setAttribute("data-sticky-disclosure-current", "");
        kbd.textContent = current;
        const captureBtn = document.createElement("button");
        captureBtn.type = "button";
        captureBtn.className = "dshSd_btn";
        captureBtn.setAttribute("data-sticky-disclosure-capture", "");
        captureBtn.textContent = capturing ? t("capture") : t("set");
        captureBtn.dataset.action = "capture";
        if (capturing) captureBtn.dataset.armed = "";
        captureBtn.addEventListener("click", () => {
          if (capturing) disarmCapture();
          else armCapture();
          renderPanel();
        });
        row.append(kbd, captureBtn);
        const resetBtn = document.createElement("button");
        resetBtn.type = "button";
        resetBtn.className = "dshSd_btn";
        resetBtn.setAttribute("data-sticky-disclosure-reset", "");
        resetBtn.textContent = t("reset");
        resetBtn.dataset.action = "reset";
        resetBtn.addEventListener("click", () => {
          disarmCapture();
          applyHotkey({ ...DEFAULT_HOTKEY });
        });
        const hint = document.createElement("div");
        hint.className = "dshSd_panelHint";
        hint.textContent = capturing ? t("captureHint") : t("savedHint");
        panel.append(title, row, resetBtn, hint);
        panel.setAttribute("aria-label", t("title"));
        if (focused) panel.querySelector('[data-action="' + focused + '"]')?.focus();
      }

      function openPanel() {
        removePanel();
        panel = document.createElement("div");
        panel.className = "dshSd_panel";
        panel.setAttribute("data-sticky-disclosure-settings", "");
        panel.setAttribute("role", "dialog");
        document.body.appendChild(panel);
        if (gear !== null) gear.setAttribute("aria-expanded", "true");
        renderPanel();
        positionPanel();
        panel.querySelector("[data-sticky-disclosure-capture]").focus();
      }

      /** Position the settings popover above the pill, right-aligned to it. */
      function positionPanel() {
        if (panel === null || !panel.isConnected) return;
        const p = panel.getBoundingClientRect();
        const anchor = control !== null && control.isConnected ? control.getBoundingClientRect() : null;
        if (anchor === null) {
          const sp = currentScrollport();
          if (sp === null) return;
          const r = sp.getBoundingClientRect();
          panel.style.left = Math.max(0, Math.round(r.right - CONTROL_INSET - p.width)) + "px";
          panel.style.top = Math.max(0, Math.round(r.bottom - CONTROL_INSET - 28 - p.height - 8)) + "px";
          return;
        }
        panel.style.left = Math.max(0, Math.round(anchor.right - p.width)) + "px";
        panel.style.top = Math.max(0, Math.round(anchor.top - p.height - 8)) + "px";
      }

      /** Keydown handler while capture is armed. */
      function onCaptureKey(event) {
        if (!capturing || event.isComposing || event.repeat || event.getModifierState?.("AltGraph")) return;
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          disarmCapture();
          renderPanel();
          return;
        }
        // Modifier-only presses (the first press of Ctrl, then Shift, …) are
        // part of forming the combo — wait for a real key.
        if (event.key === "Control" || event.key === "Shift" || event.key === "Alt" || event.key === "Meta") return;
        if (!(event.ctrlKey || event.metaKey || event.altKey)) return;
        event.preventDefault();
        event.stopPropagation();
        applyHotkey({
          ctrl: event.ctrlKey,
          meta: event.metaKey,
          alt: event.altKey,
          shift: event.shiftKey,
          code: event.code,
        });
        disarmCapture();
        renderPanel();
      }

      function armCapture() {
        if (capturing) return;
        capturing = true;
        document.addEventListener("keydown", onCaptureKey, true);
      }

      function disarmCapture() {
        if (!capturing) return;
        capturing = false;
        document.removeEventListener("keydown", onCaptureKey, true);
      }

      /** Adopt a new hotkey spec: validate, persist, and refresh the UI text. */
      function applyHotkey(spec) {
        const next = normalizeHotkey(spec);
        if (next === null) return false;
        hotkey = next;
        saveHotkey(next);
        syncLabels();
        renderPanel();
        return true;
      }

      function syncLabels() {
        if (control !== null) {
          control.title = t("collapseAll") + " · " + labelOfHotkey(hotkey);
          control.setAttribute("aria-label", t("collapseAll"));
          setText(control.querySelector(".dshSd_label"), t("collapse"));
        }
        if (gear !== null) {
          gear.title = t("settings");
          gear.setAttribute("aria-label", t("settings"));
        }
        for (const [row, chip] of chips) {
          const label = labelOf(row);
          setText(chip.querySelector(".dshSd_label"), label);
          chip.setAttribute("aria-label", t("collapseOne") + label);
          chip.title = t("chipHint") + " · " + labelOfHotkey(hotkey) + " · " + t("collapse");
        }
      }

      /** Keep the floating pill + gear present, counted, and pinned to the scrollport's bottom-right corner. */
      function syncControl(expandedCount) {
        const sp = currentScrollport();
        const spRect = sp === null ? null : sp.getBoundingClientRect();
        const usable = spRect !== null && spRect.width > 1 && spRect.height > 1;
        if (!usable) {
          removeControl();
          removeGear();
          removePanel();
          return;
        }
        if (control === null || !control.isConnected) {
          control = createControl();
          document.body.appendChild(control);
        }
        if (gear === null || !gear.isConnected) {
          gear = createGear();
          document.body.appendChild(gear);
        }
        const n = expandedCount;
        const count = String(n);
        if (control.dataset.count !== count) control.dataset.count = count;
        const countEl = control.querySelector(".dshSd_count");
        if (countEl !== null) {
          const countText = n > 0 ? "·" + n : "";
          // Avoid rewriting the same text node: textContent replacement is a
          // childList mutation, which this plugin's own MutationObserver would
          // observe and reschedule into an endless update/flash loop.
          if (countEl.textContent !== countText) countEl.textContent = countText;
        }
        const w = control.offsetWidth;
        const h = control.offsetHeight;
        const left = Math.max(0, Math.round(spRect.right - CONTROL_INSET - w - 36));
        const top = Math.max(0, Math.round(spRect.bottom - CONTROL_INSET - h));
        control.style.left = left + "px";
        control.style.top = top + "px";
        if (gear !== null) {
          gear.style.left = Math.round(left + w + 8) + "px";
          gear.style.top = top + "px";
        }
        positionPanel();
      }

      /** Follow the scrollport's element identity for size observation. */
      function trackScrollport() {
        if (resizeObserver === null) return;
        const sp = currentScrollport();
        if (sp === observedScrollport) return;
        if (observedScrollport !== null) resizeObserver.unobserve(observedScrollport);
        if (sp !== null) resizeObserver.observe(sp);
        observedScrollport = sp;
      }

      /** Recompute which expanded headers are off-screen and sync the dock + pill. */
      function update() {
        trackScrollport();
        const sp = currentScrollport();
        const spRect = sp === null ? null : sp.getBoundingClientRect();
        const usable = spRect !== null && spRect.width > 1 && spRect.height > 1;
        const rows = expandedDisclosures();
        const seen = new Set(rows);
        if (sp !== null) {
          for (const row of rows) {
            let offTop = false;
            if (usable) {
              const r = row.getBoundingClientRect();
              offTop = r.bottom <= spRect.top + EDGE_TOLERANCE;
            }
            const chip = chips.get(row);
            if (offTop && chip === undefined) chips.set(row, createChip(row));
            else if (!offTop && chip !== undefined) {
              chip.remove();
              chips.delete(row);
            }
          }
        }
        // Drop chips whose rows left the tree entirely.
        for (const [row, chip] of chips) {
          if (!seen.has(row)) {
            chip.remove();
            chips.delete(row);
          }
        }
        if (chips.size === 0) {
          removeDock();
        } else {
          const d = ensureDock();
          // Keep chips in document order, not first-pinned order.
          const ordered = [...chips.keys()].sort((a, b) => {
            if (a === b) return 0;
            return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 ? -1 : 1;
          });
          const desired = ordered.map((row) => chips.get(row));
          // Sync the dock with minimal DOM moves. Re-appending already-ordered
          // chips on every update would fire childList mutations, which this
          // plugin's own MutationObserver would observe and reschedule, causing
          // an endless update/flash loop.
          let index = 0;
          for (const chip of desired) {
            const at = d.children[index] ?? null;
            if (at !== chip) d.insertBefore(chip, at);
            index++;
          }
          while (d.children.length > desired.length) d.removeChild(d.lastChild);
          if (usable) {
            d.style.left = Math.round(spRect.left + DOCK_INSET_X) + "px";
            d.style.top = Math.round(spRect.top + DOCK_TOP_GAP) + "px";
            d.style.width = Math.max(0, Math.round(spRect.width - DOCK_INSET_X * 2)) + "px";
          } else {
            d.style.left = "0px";
            d.style.top = "0px";
            d.style.width = "0px";
          }
        }
        syncLabels();
        if (lastLocale !== locale()) {
          lastLocale = locale();
          renderPanel();
        }
        syncControl(rows.length);
      }

      function scheduleUpdate() {
        if (rafPending || disposed) return;
        rafPending = true;
        requestAnimationFrame(() => {
          rafPending = false;
          if (!disposed) update();
        });
      }

      function onScroll() {
        scheduleUpdate();
      }

      function onResize() {
        scheduleUpdate();
      }

      function onKeyDown(event) {
        if (event.defaultPrevented || event.isComposing || event.repeat || capturing) return;
        if (event.key === "Escape" && panel !== null) {
          event.preventDefault();
          event.stopPropagation();
          removePanel();
          return;
        }
        if (event.code !== hotkey.code) return;
        if (event.ctrlKey !== hotkey.ctrl || event.metaKey !== hotkey.meta || event.altKey !== hotkey.alt || event.shiftKey !== hotkey.shift) return;
        // AltGr (reported as Ctrl+Alt on some keyboard layouts) types characters;
        // never intercept it, even inside text fields.
        if (typeof event.getModifierState === "function" && event.getModifierState("AltGraph")) return;
        event.preventDefault();
        collapseAll();
      }

      function onPointerDown(event) {
        if (panel === null || panel.contains(event.target) || gear?.contains(event.target)) return;
        removePanel();
      }

      ctx.effect(() => {
        const styleTag = installStyles();
        const observer = new MutationObserver((mutations) => {
          if (mutations.some((mutation) => {
            const el = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
            return !el?.closest(".dshSd_dock,.dshSd_control,.dshSd_panel,.dshSd_gear");
          })) scheduleUpdate();
        });
        observer.observe(document.documentElement, {
          childList: true,
          subtree: true,
          characterData: true,
          attributes: true,
          attributeFilter: ["data-open", "data-disclosure-row", "data-turn-process", "aria-expanded", "disabled", "lang"],
        });
        resizeObserver = new ResizeObserver(scheduleUpdate);
        resizeObserver.observe(document.body);
        document.addEventListener("scroll", onScroll, { capture: true, passive: true });
        window.addEventListener("resize", onResize);
        document.addEventListener("keydown", onKeyDown, true);
        document.addEventListener("pointerdown", onPointerDown, true);
        window.dshStickyDisclosure = {
          version: PLUGIN_VERSION,
          expanded: () => expandedDisclosures().length,
          affixed: () => chips.size,
          hotkey: () => labelOfHotkey(hotkey),
          setHotkey: applyHotkey,
        };
        try {
          console.info("[dsh-sticky-disclosure] applied v" + PLUGIN_VERSION + " — " + labelOfHotkey(hotkey) + " collapses all expanded sections");
        } catch (_) {
          /* console may be unavailable in exotic embeds */
        }
        scheduleUpdate();
        return () => {
          disposed = true;
          disarmCapture();
          observer.disconnect();
          if (resizeObserver !== null) resizeObserver.disconnect();
          resizeObserver = null;
          observedScrollport = null;
          document.removeEventListener("scroll", onScroll, true);
          window.removeEventListener("resize", onResize);
          document.removeEventListener("keydown", onKeyDown, true);
          document.removeEventListener("pointerdown", onPointerDown, true);
          for (const chip of chips.values()) chip.remove();
          chips.clear();
          removeDock();
          removeControl();
          removeGear();
          removePanel();
          if (window.dshStickyDisclosure !== undefined) {
            try {
              delete window.dshStickyDisclosure;
            } catch (_) {
              window.dshStickyDisclosure = undefined;
            }
          }
          if (styleTag !== null) styleTag.remove();
        };
      }, "sticky-disclosure: off-screen disclosure affix");
    }

    exports.name = PLUGIN_NAME;
    exports.apply = apply;

    //#endregion

    return module.exports;
  },
});
