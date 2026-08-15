"""Verify dsh-sticky-disclosure against the mock DSH DOM harness.

Run: python test/verify.py
Uses Playwright chromium (headless) over a file:// mock page that reproduces
the DisclosureRow / [data-conversation-scroll] DOM contract of the DSH web UI.
"""
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

MOCK = Path(__file__).resolve().parent / "mock.html"
FAILED = []


def check(name, cond, detail=""):
    status = "PASS" if cond else "FAIL"
    line = f"[{status}] {name}" + (f" -- {detail}" if detail else "")
    print(line)
    if not cond:
        FAILED.append(name)


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 800})
        page.goto(MOCK.as_uri())
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(100)

        # --- helpers --------------------------------------------------------
        def eval_js(expr):
            return page.evaluate(expr)

        def chip_labels():
            return eval_js("[...document.querySelectorAll('[data-sticky-disclosure-chip]')].map(c => c.querySelector('.dshSd_label').textContent)")

        def dock_count():
            return eval_js("document.querySelectorAll('[data-sticky-disclosure-dock]').length")

        def row_status(block_id):
            return eval_js(f"""(() => {{
              const row = document.querySelector('#{block_id} [data-disclosure-row]');
              const root = row.parentElement;
              const sp = document.querySelector('[data-conversation-scroll]');
              const r = row.getBoundingClientRect(), s = sp.getBoundingClientRect();
              return {{ expanded: root.hasAttribute('data-open'), offTop: r.bottom <= s.top + 0.5 }};
            }})()""")

        def set_scroll(top):
            eval_js(f"document.querySelector('[data-conversation-scroll]').scrollTop = {top}")

        # --- 1. initial state ----------------------------------------------
        check("no dock initially", dock_count() == 0)
        check("plugin registered", eval_js("window.__plugin && window.__plugin.name") == "sticky-disclosure")
        check("style tag injected with data-plugin", eval_js(
            "!!document.querySelector('style[data-plugin=\"dsh-sticky-disclosure\"]')"))
        initial_control = eval_js("""(() => {
          const c = document.querySelector('[data-sticky-disclosure-control]');
          return c ? { count: c.getAttribute('data-count'), text: c.textContent.trim() } : null;
        })()""")
        check("control pill visible on load", initial_control is not None, str(initial_control))
        check("control count = expanded rows (4)", initial_control is not None and initial_control["count"] == "4", str(initial_control))
        check("gear button visible on load", eval_js("!!document.querySelector('[data-sticky-disclosure-gear]')"))
        check("debug handle exposed", eval_js("window.dshStickyDisclosure && window.dshStickyDisclosure.version") == "1.0.0")

        # --- 2. scroll the first expanded block off the top -----------------
        set_scroll(400)
        page.wait_for_timeout(120)
        s1 = row_status("b1")
        check("b1 header slid off top after scroll", s1["offTop"], str(s1))
        page.wait_for_function("document.querySelectorAll('[data-sticky-disclosure-chip]').length === 1", timeout=2000)
        labels = chip_labels()
        check("one chip for b1 labelled Think", labels == ["Think"], str(labels))
        geom = eval_js("""(() => {
          const sp = document.querySelector('[data-conversation-scroll]').getBoundingClientRect();
          const d = document.querySelector('[data-sticky-disclosure-dock]');
          const z = getComputedStyle(d).zIndex;
          return { dLeft: Math.round(d.getBoundingClientRect().left - sp.left),
                   dTop: Math.round(d.getBoundingClientRect().top - sp.top), z };
        })()""")
        check("dock inset left = 32px", geom["dLeft"] == 32, str(geom))
        check("dock top gap = 8px", geom["dTop"] == 8, str(geom))
        check("dock z-index = 15", geom["z"] == "15", str(geom))
        chip_style = eval_js("""(() => {
          const c = document.querySelector('[data-sticky-disclosure-chip]');
          const s = getComputedStyle(c);
          return { radius: s.borderRadius, height: s.height, cursor: s.cursor,
                   bg: s.backgroundColor, border: s.borderTopWidth + ' ' + s.borderTopStyle,
                   dockPointer: getComputedStyle(c.parentElement).pointerEvents };
        })()""")
        check("chip is a 28px pill", chip_style["height"] == "28px" and chip_style["radius"] == "999px", str(chip_style))
        check("chip interactive, dock click-through", chip_style["cursor"] == "pointer" and chip_style["dockPointer"] == "none", str(chip_style))
        check("chip themed via design tokens", chip_style["bg"] == "rgb(255, 255, 255)" and chip_style["border"] == "1px solid", str(chip_style))
        check("collapsed b2 got no chip", chip_labels() == ["Think"])

        # --- 3. more blocks off-screen: order follows document order --------
        set_scroll(2200)
        page.wait_for_function("document.querySelectorAll('[data-sticky-disclosure-chip]').length === 3", timeout=2000)
        labels = chip_labels()
        check("three chips, document order", labels == ["Think", "pwsh", "compact"], str(labels))
        check("composer panel never pinned", "ComposerPanel" not in labels, str(labels))

        # --- 3b. no update loop while idle ---------------------------------
        eval_js("""(() => {
          window.__dshSdLoopCount = 0;
          window.__dshSdLoopObserver = new MutationObserver(() => { window.__dshSdLoopCount++ });
          window.__dshSdLoopObserver.observe(document.body, { childList: true, subtree: true });
        })()""")
        page.wait_for_timeout(500)
        loop_count = eval_js("window.__dshSdLoopCount")
        eval_js("window.__dshSdLoopObserver.disconnect()")
        check("no continuous DOM mutations while chips are pinned", loop_count == 0, str(loop_count))

        # --- 4. click a chip collapses the original row ---------------------
        before = row_status("b1")
        page.click('[data-sticky-disclosure-chip] >> nth=0')
        page.wait_for_function(
            "!document.querySelector('#b1 [data-disclosure-row]').parentElement.hasAttribute('data-open')",
            timeout=2000)
        after = row_status("b1")
        check("chip click collapsed b1", before["expanded"] and not after["expanded"], f"{before} -> {after}")
        check("exactly one chip removed after collapse", len(chip_labels()) == 2, str(chip_labels()))

        # --- 5. hotkey collapses EVERY expanded section (visible included) --
        page.keyboard.press("Control+Alt+C")
        page.wait_for_timeout(150)
        b3, b4, b5h = row_status("b3"), row_status("b4"), row_status("b5")
        check("hotkey collapsed b3", not b3["expanded"], str(b3))
        check("hotkey collapsed b4 (button-toggle row)", not b4["expanded"], str(b4))
        check("hotkey collapsed visible b5 too", not b5h["expanded"], str(b5h))
        check("no chips remain after hotkey", dock_count() == 0 and len(chip_labels()) == 0)

        # --- 5b. hotkey works while the composer input is focused -----------
        eval_js("""(() => {
          const row = document.querySelector('#b3 [data-disclosure-row]');
          if (!row.parentElement.hasAttribute('data-open')) row.click();
        })()""")
        page.wait_for_timeout(120)
        set_scroll(350)
        page.wait_for_function(
            "[...document.querySelectorAll('[data-sticky-disclosure-chip]')].some(c => c.querySelector('.dshSd_label').textContent === 'pwsh')",
            timeout=2000)
        eval_js("document.querySelector('#composer-input').focus()")
        page.keyboard.press("Control+Alt+C")
        page.wait_for_timeout(150)
        b3f = row_status("b3")
        after_labels = chip_labels()
        check("hotkey collapses even with input focused", not b3f["expanded"], str(b3f))
        check("no pwsh chip remains", "pwsh" not in after_labels, str(after_labels))

        # --- 6. chip appears/disappears with visibility ---------------------
        eval_js("""(() => {
          const row = document.querySelector('#b5 [data-disclosure-row]');
          if (!row.parentElement.hasAttribute('data-open')) row.click();
        })()""")  # ensure b5 expanded
        page.wait_for_timeout(120)
        set_scroll(2700)
        page.wait_for_function("document.querySelectorAll('[data-sticky-disclosure-chip]').length === 1", timeout=2000)
        check("re-expanded b5 pins when slid off", chip_labels() == ["Think"], str(chip_labels()))
        set_scroll(0)
        page.wait_for_function("document.querySelectorAll('[data-sticky-disclosure-chip]').length === 0", timeout=2000)
        b5 = row_status("b5")
        check("chip disappears when header visible again, content stays expanded",
              b5["expanded"] and not b5["offTop"], str(b5))

        # --- 7. floating collapse-all pill -----------------------------------
        ctrl = eval_js("""(() => {
          const c = document.querySelector('[data-sticky-disclosure-control]');
          if (!c) return null;
          const s = c.getBoundingClientRect();
          const sp = document.querySelector('[data-conversation-scroll]').getBoundingClientRect();
          return { text: c.textContent.trim(), count: c.getAttribute('data-count'),
                   atBottomRight: Math.abs((sp.bottom - 16) - s.bottom) < 20 };
        })()""")
        check("control pill present, count matches expanded rows", ctrl is not None and ctrl["count"] == "1", str(ctrl))
        check("control pill pinned to scrollport bottom-right", ctrl is not None and ctrl["atBottomRight"], str(ctrl))
        eval_js("document.querySelector('[data-sticky-disclosure-control]').click()")
        page.wait_for_timeout(200)
        b5c = row_status("b5")
        check("control pill collapses all expanded", not b5c["expanded"], str(b5c))
        check("control count resets to 0", eval_js(
            "document.querySelector('[data-sticky-disclosure-control]').getAttribute('data-count')") == "0")

        # --- 7b. customizable hotkey ------------------------------------------
        default_title = eval_js("document.querySelector('[data-sticky-disclosure-control]').title")
        check("default hotkey in pill tooltip", "Ctrl+Alt+C" in default_title, str(default_title))
        ok_invalid = eval_js("window.dshStickyDisclosure.setHotkey({ code: 'KeyZ' })")
        check("setHotkey rejects modifier-less spec", ok_invalid is False, str(ok_invalid))
        ok_valid = eval_js("window.dshStickyDisclosure.setHotkey({ ctrl: true, shift: true, code: 'KeyK' })")
        check("setHotkey accepts valid spec", ok_valid is True)
        eval_js("""(() => {
          const row = document.querySelector('#b5 [data-disclosure-row]');
          if (!row.parentElement.hasAttribute('data-open')) row.click();
        })()""")
        page.wait_for_timeout(150)
        page.keyboard.press("Control+Alt+C")
        page.wait_for_timeout(150)
        check("old hotkey no longer collapses", row_status("b5")["expanded"] is True)
        page.keyboard.press("Control+Shift+K")
        page.wait_for_timeout(150)
        check("custom hotkey collapses", row_status("b5")["expanded"] is False)
        page.reload(wait_until="load")
        page.wait_for_timeout(400)
        check("custom hotkey persists after reload", eval_js(
            "window.dshStickyDisclosure && window.dshStickyDisclosure.hotkey()") == "Ctrl+Shift+K")
        eval_js("document.querySelector('[data-sticky-disclosure-gear]').click()")
        page.wait_for_timeout(150)
        check("settings panel opens", eval_js("!!document.querySelector('[data-sticky-disclosure-settings]')"))
        check("panel shows current hotkey", eval_js(
            "document.querySelector('[data-sticky-disclosure-current]').textContent") == "Ctrl+Shift+K")
        eval_js("document.querySelector('[data-sticky-disclosure-capture]').click()")
        page.wait_for_timeout(100)
        check("capture armed state", eval_js(
            "document.querySelector('[data-sticky-disclosure-capture]').hasAttribute('data-armed')"))
        page.keyboard.press("Escape")
        page.wait_for_timeout(100)
        check("escape cancels capture", not eval_js(
            "document.querySelector('[data-sticky-disclosure-capture]').hasAttribute('data-armed')"))
        check("hotkey unchanged after cancel", eval_js(
            "window.dshStickyDisclosure.hotkey()") == "Ctrl+Shift+K")
        eval_js("document.querySelector('[data-sticky-disclosure-capture]').click()")
        page.wait_for_timeout(100)
        page.keyboard.press("Control+Alt+J")
        page.wait_for_timeout(150)
        check("capture records new combo", eval_js(
            "window.dshStickyDisclosure.hotkey()") == "Ctrl+Alt+J")
        eval_js("document.querySelector('[data-sticky-disclosure-reset]').click()")
        page.wait_for_timeout(150)
        check("reset restores default", eval_js(
            "window.dshStickyDisclosure.hotkey()") == "Ctrl+Alt+C")
        eval_js("document.querySelector('[data-sticky-disclosure-gear]').click()")
        page.wait_for_timeout(100)
        check("panel closes", not eval_js("!!document.querySelector('[data-sticky-disclosure-settings]')"))

        # --- 8. disposal restores everything --------------------------------
        page.keyboard.press("Control+Alt+C")  # default restored: collapse the fresh post-reload DOM
        page.wait_for_timeout(150)
        eval_js("""(() => {
          const row = document.querySelector('#b5 [data-disclosure-row]');
          if (!row.parentElement.hasAttribute('data-open')) row.click();
        })()""")  # re-expand so a chip exists at disposal time
        page.wait_for_timeout(120)
        set_scroll(2700)
        page.wait_for_function("document.querySelectorAll('[data-sticky-disclosure-chip]').length === 1", timeout=2000)
        eval_js("window.__effectHandle.dispose()")
        page.wait_for_timeout(120)
        check("dispose removes dock and chips", dock_count() == 0)
        check("dispose removes control pill", eval_js(
            "!document.querySelector('[data-sticky-disclosure-control]')"))
        check("dispose removes gear and panel", eval_js(
            "!document.querySelector('[data-sticky-disclosure-gear]') && !document.querySelector('[data-sticky-disclosure-settings]')"))
        check("dispose removes injected style", eval_js(
            "!document.querySelector('style[data-plugin=\"dsh-sticky-disclosure\"]')"))

        page.screenshot(path=str(Path(__file__).resolve().parent / "shot-final.png"))
        browser.close()

    print("-" * 60)
    if FAILED:
        print(f"{len(FAILED)} FAILED: {FAILED}")
        sys.exit(1)
    print("ALL CHECKS PASSED")


if __name__ == "__main__":
    main()
