"""Capture real screenshots + GIF frames for the README from the live DSH instance."""
import shutil
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ASSETS = Path(__file__).resolve().parent.parent / "docs" / "assets"
GIF_DIR = Path(r"C:\Users\57752\AppData\Local\Temp\dsh-gif")
BASE = "http://127.0.0.1:3080"
PROMPT = "Write an 800-word essay introducing the basic principles and role of attention mechanisms in large language models."


def main():
    ASSETS.mkdir(parents=True, exist_ok=True)
    GIF_DIR.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        ok = False
        for _ in range(30):
            try:
                page.goto(BASE, wait_until="domcontentloaded", timeout=5000)
                ok = True
                break
            except Exception:
                time.sleep(1)
        if not ok:
            print("SERVER NOT READY")
            browser.close()
            raise SystemExit(1)
        page.wait_for_timeout(2500)
        # dismiss the beta notice if this fresh profile still shows it
        try:
            if page.evaluate("!!document.querySelector('._root_15u5s_2 button')"):
                page.evaluate("document.querySelector('._root_15u5s_2 button').click()")
                page.wait_for_timeout(600)
        except Exception:
            pass
        print("plugin pill:", page.evaluate("!!document.querySelector('[data-sticky-disclosure-control]')"))
        # real message -> real think row
        ta = page.locator("textarea").first
        ta.click()
        ta.type(PROMPT, delay=10)
        page.keyboard.press("Enter")
        print("prompt sent")
        for _ in range(150):
            time.sleep(2)
            done = page.evaluate("""(() => {
              const t = document.querySelectorAll('[data-variant=think]');
              return t.length > 0 && [...t].every(x => x.getAttribute('data-state') === 'ok');
            })()""")
            if done:
                break
        print("reply settled, think rows:", page.evaluate("document.querySelectorAll('[data-variant=think]').length"))
        time.sleep(1)
        # expand every think row
        page.evaluate("[...document.querySelectorAll('[data-variant=think] [data-disclosure-row]')].forEach(r => { if (!r.parentElement.hasAttribute('data-open')) r.click(); })")
        page.wait_for_timeout(900)
        page.screenshot(path=str(ASSETS / "screenshot-01-expanded.png"))
        print("f1 saved")
        # scroll off -> chips
        page.evaluate("(() => { const sp = document.querySelector('[data-conversation-scroll]'); sp.scrollTop = sp.scrollHeight; })()")
        try:
            page.wait_for_selector("[data-sticky-disclosure-chip]", timeout=5000)
        except Exception as e:
            print("NO CHIP:", str(e)[:120])
            browser.close()
            raise SystemExit(2)
        page.wait_for_timeout(600)
        page.screenshot(path=str(ASSETS / "screenshot-02-chips.png"))
        print("f2 saved, chips:", page.evaluate("[...document.querySelectorAll('[data-sticky-disclosure-chip]')].map(c => c.querySelector('.dshSd_label').textContent)"))
        # settings panel open
        page.evaluate("document.querySelector('[data-sticky-disclosure-gear]').click()")
        page.wait_for_timeout(400)
        page.screenshot(path=str(ASSETS / "screenshot-03-panel.png"))
        print("f3 saved")
        # capture armed
        page.evaluate("document.querySelector('[data-sticky-disclosure-capture]').click()")
        page.wait_for_timeout(400)
        page.screenshot(path=str(ASSETS / "screenshot-04-capture.png"))
        print("f4 saved")
        # capture a new combo: Ctrl+Shift+K
        page.keyboard.press("Control+Shift+K")
        page.wait_for_timeout(300)
        print("new hotkey:", page.evaluate("window.dshStickyDisclosure.hotkey()"))
        # close panel, press the NEW hotkey -> collapse all
        page.evaluate("document.querySelector('[data-sticky-disclosure-gear]').click()")
        page.wait_for_timeout(200)
        page.keyboard.press("Control+Shift+K")
        page.wait_for_timeout(400)
        print("count after new hotkey:", page.evaluate("document.querySelector('[data-sticky-disclosure-control]').getAttribute('data-count')"))
        page.screenshot(path=str(ASSETS / "screenshot-05-collapsed.png"))
        print("f5 saved")
        # persistence across reload
        page.reload(wait_until="domcontentloaded")
        page.wait_for_timeout(3000)
        print("persisted hotkey:", page.evaluate("window.dshStickyDisclosure && window.dshStickyDisclosure.hotkey()"))
        # GIF frames from the already-taken stills
        for src, dst in [
            ("screenshot-01-expanded.png", "f1.png"),
            ("screenshot-02-chips.png", "f2.png"),
            ("screenshot-05-collapsed.png", "f3.png"),
        ]:
            shutil.copy(str(ASSETS / src), str(GIF_DIR / dst))
        print("gif frames ready")
        browser.close()


if __name__ == "__main__":
    main()
