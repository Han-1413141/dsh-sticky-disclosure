/**
 * dsh-sticky-disclosure — browser half.
 *
 * Purpose: when an expanded collapsible tag (the "Think" reasoning row, tool
 * call cards, generic command cards, context-injection rows — every
 * DisclosureRow in the conversation flow) scrolls out of the chat viewport
 * through its top edge, its header is the only control that can collapse it.
 * This plugin pins a small "affix chip" for each such header to the top edge
 * of the conversation scrollport, so the section stays collapsible while its
 * content is off screen. Chips disappear on their own as soon as the header
 * scrolls back into view (or the section is collapsed by any means), and a
 * hotkey collapses every off-screen expanded section at once.
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
    /** Collapse-all hotkey: Ctrl+Alt+C (Cmd+Option+C on macOS). */
    const HOTKEY_LABEL = "Ctrl+Alt+C";
    const SCROLLPORT_SELECTOR = "[data-conversation-scroll]";
    const ROW_SELECTOR = "[data-disclosure-row]";
    /** Horizontal inset of the chip dock, mirroring the scrollport's 32px content padding. */
    const DOCK_INSET_X = 32;
    /** Vertical gap between the scrollport's top edge and the first chip row. */
    const DOCK_TOP_GAP = 8;
    /** Pixels of tolerance for "fully slid off the top edge". */
    const EDGE_TOLERANCE = 0.5;
    const CHIP_MAX_WIDTH = 260;
    /** Below the frame overlay layer (z-20) and every dialog/popup, above chat content. */
    const DOCK_Z_INDEX = "15";
    const STYLE_ID = "dsh-sticky-disclosure/styles.css";

    /** Human-readable label for a disclosure header (its title text). */
    function labelOf(row) {
      const title = row.children[1];
      const text = title && title.textContent ? title.textContent.trim() : "";
      if (text !== "") return text.slice(0, 80);
      const variantHost = row.closest("[data-variant]");
      const variant = variantHost === null ? "" : variantHost.getAttribute("data-variant");
      if (variant !== null && variant !== "" && variant !== "others") return variant;
      return "Section";
    }

    /** The element whose click toggles this disclosure. */
    function toggleTarget(row) {
      if (row.hasAttribute("data-expandable")) return row;
      const button = row.querySelector("button[aria-expanded]");
      return button === null ? row : button;
    }

    /** Collapse one disclosure by dispatching a real click to its toggle. */
    function collapseRow(row) {
      const target = toggleTarget(row);
      if (target !== null) target.click();
    }

    /** Read the plugin's own CSS into the document once (HMR-safe style record). */
    function installStyles() {
      if (document.querySelector("style[data-plugin-css=" + JSON.stringify(STYLE_ID) + "]") !== null) return null;
      const css = [
        ".dshSd_dock{position:fixed;z-index:" + DOCK_Z_INDEX + ";display:flex;flex-wrap:wrap;align-items:flex-start;gap:8px;box-sizing:border-box;pointer-events:none}",
        ".dshSd_chip{pointer-events:auto;display:inline-flex;align-items:center;gap:6px;max-width:" + CHIP_MAX_WIDTH + "px;height:28px;box-sizing:border-box;padding:0 10px 0 8px;",
        "border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:var(--dsw-specific-tip);color:var(--dsw-alias-label-secondary);",
        "box-shadow:var(--dsw-shadow-lv2);font:var(--dsw-font-xxs-12);cursor:pointer;animation:dshSd_chip-in .16s var(--ds-ease-in-out)}",
        ".dshSd_chip:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}",
        ".dshSd_chip:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}",
        ".dshSd_icon{flex:none;place-items:center;display:grid;color:var(--dsw-alias-label-tertiary)}",
        ".dshSd_label{min-width:0;text-overflow:ellipsis;white-space:nowrap;overflow:hidden}",
        "@keyframes dshSd_chip-in{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}",
        "@media (prefers-reduced-motion:reduce){.dshSd_chip{animation:none}}",
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
      /** Shared dock; created lazily, removed while empty. */
      let dock = null;
      let rafPending = false;
      let disposed = false;
      let resizeObserver = null;
      let observedScrollport = null;

      function currentScrollport() {
        const el = document.querySelector(SCROLLPORT_SELECTOR);
        return el instanceof HTMLElement ? el : null;
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

      function collapseAllAffixed() {
        const rows = [...chips.keys()];
        for (const row of rows) collapseRow(row);
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
        chip.setAttribute("aria-label", "收起 " + label);
        chip.title = "点击收起 · " + HOTKEY_LABEL + " 收起全部";
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

      /** Follow the scrollport's element identity for size observation. */
      function trackScrollport() {
        if (resizeObserver === null) return;
        const sp = currentScrollport();
        if (sp === observedScrollport) return;
        if (observedScrollport !== null) resizeObserver.unobserve(observedScrollport);
        if (sp !== null) resizeObserver.observe(sp);
        observedScrollport = sp;
      }

      /** Recompute which expanded headers are off-screen and sync the dock. */
      function update() {
        trackScrollport();
        const sp = currentScrollport();
        const spRect = sp === null ? null : sp.getBoundingClientRect();
        const usable = spRect !== null && spRect.width > 1 && spRect.height > 1;
        const seen = new Set();
        if (sp !== null) {
          const rows = sp.querySelectorAll(ROW_SELECTOR);
          for (const row of rows) {
            seen.add(row);
            const expanded = row.parentElement !== null && row.parentElement.hasAttribute("data-open");
            const inComposer = row.closest("[data-composer-seat]") !== null;
            let offTop = false;
            if (expanded && !inComposer && usable) {
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
          return;
        }
        const d = ensureDock();
        // Keep chips in document order, not first-pinned order.
        const ordered = [...chips.keys()].sort((a, b) => {
          if (a === b) return 0;
          return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 ? -1 : 1;
        });
        for (const row of ordered) d.appendChild(chips.get(row));
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
        if (event.defaultPrevented) return;
        if (event.isComposing) return;
        if (!(event.ctrlKey || event.metaKey) || !event.altKey || event.shiftKey) return;
        if (event.code !== "KeyC") return;
        // AltGr (reported as Ctrl+Alt on some keyboard layouts) types characters;
        // never intercept it, even inside text fields.
        if (typeof event.getModifierState === "function" && event.getModifierState("AltGraph")) return;
        if (chips.size === 0) return;
        event.preventDefault();
        collapseAllAffixed();
      }

      ctx.effect(() => {
        const styleTag = installStyles();
        const observer = new MutationObserver(scheduleUpdate);
        observer.observe(document.documentElement, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ["data-open", "data-disclosure-row", "aria-expanded"],
        });
        resizeObserver = new ResizeObserver(scheduleUpdate);
        resizeObserver.observe(document.body);
        document.addEventListener("scroll", onScroll, { capture: true, passive: true });
        window.addEventListener("resize", onResize);
        document.addEventListener("keydown", onKeyDown, true);
        scheduleUpdate();
        return () => {
          disposed = true;
          observer.disconnect();
          if (resizeObserver !== null) resizeObserver.disconnect();
          resizeObserver = null;
          observedScrollport = null;
          document.removeEventListener("scroll", onScroll, true);
          window.removeEventListener("resize", onResize);
          document.removeEventListener("keydown", onKeyDown, true);
          for (const chip of chips.values()) chip.remove();
          chips.clear();
          removeDock();
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
