"""Regression coverage for DSH 0.2.0-rc.2 Web and Desktop DOM contracts.

Desktop cases emulate the documented preload markers; they are not native-shell E2E tests.
Reference: deepseek-ai/deepseek-harness@639ed015397290b3745d163aafe02ffee4aa3f84.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright

MOCK = Path(__file__).with_name("mock.html").resolve().as_uri()


def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for platform in ("web", "win32", "darwin"):
            context = browser.new_context(user_agent=("Mozilla/5.0 (Macintosh; Intel Mac OS X)" if platform == "darwin" else "Mozilla/5.0 (Windows NT 10.0)"))
            page = context.new_page()
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.goto(MOCK + "?platform=" + platform)
            page.wait_for_selector("[data-sticky-disclosure-gear]")
            api = "window.dshStickyDisclosure"
            expected = "⌘+⌥+C" if platform == "darwin" else "Ctrl+Alt+C"
            assert page.evaluate(api + ".hotkey()") == expected
            # Closing while capture is armed must stop intercepting keyboard input.
            page.locator("[data-sticky-disclosure-gear]").click()
            page.locator("[data-sticky-disclosure-capture]").click()
            before = page.evaluate(api + ".expanded()")
            page.keyboard.press("Meta+Alt+C" if platform == "darwin" else "Control+Alt+C")
            assert page.evaluate(api + ".expanded()") == before, "capture must not collapse sections"
            page.locator("[data-sticky-disclosure-capture]").click()
            page.locator(".dshSd_close").click()
            page.keyboard.press("Control+Shift+J")
            assert page.evaluate(api + ".hotkey()") == expected, "closed panel left a capture listener"
            page.locator("[data-sticky-disclosure-gear]").click()
            page.locator("[data-sticky-disclosure-capture]").click()
            page.evaluate("""document.dispatchEvent(new KeyboardEvent('keydown', {
              key:'k', code:'KeyK', ctrlKey:true, isComposing:true, bubbles:true, cancelable:true
            }))""")
            assert page.evaluate(api + ".hotkey()") == expected
            assert page.locator("[data-sticky-disclosure-capture]").get_attribute("data-armed") is not None
            page.keyboard.press("Escape")
            page.keyboard.press("Escape")
            assert page.locator("[data-sticky-disclosure-settings]").count() == 0
            assert page.evaluate("document.activeElement.matches('[data-sticky-disclosure-gear]')")
            # Current TurnProcessNodeView places expanded state on the button itself.
            page.evaluate("""() => {
              for (const disabled of [false, true]) {
                const b = document.createElement('button');
                b.dataset.turnProcess = disabled ? 'running' : 'finished';
                b.dataset.open = ''; b.setAttribute('aria-expanded', 'true'); b.disabled = disabled;
                b.textContent = disabled ? 'Running' : 'Worked for 3 seconds';
                b.onclick = () => { b.removeAttribute('data-open'); b.setAttribute('aria-expanded', 'false'); };
                document.querySelector('[data-conversation-scroll]').prepend(b);
              }
            }""")
            page.wait_for_function("document.querySelector('[data-sticky-disclosure-control]').dataset.count === '5'")
            page.locator("[data-sticky-disclosure-control]").click()
            assert page.locator('[data-turn-process="finished"]').get_attribute("aria-expanded") == "false"
            assert page.locator('[data-turn-process="running"]').get_attribute("aria-expanded") == "true"
            page.evaluate("document.documentElement.lang = 'en'")
            page.wait_for_function("document.querySelector('.dshSd_control .dshSd_label').textContent === 'Collapse all'")
            page.locator("[data-sticky-disclosure-gear]").click()
            assert page.get_by_role("dialog", name="Collapse-all shortcut").count() == 1
            assert page.evaluate("getComputedStyle(document.querySelector('.dshSd_control')).getPropertyValue('-webkit-app-region')") == "no-drag"
            # Removing a session during capture follows the same cleanup path.
            page.locator("[data-sticky-disclosure-capture]").click()
            page.evaluate("document.querySelector('[data-conversation-scroll]').remove()")
            page.wait_for_function("!document.querySelector('[data-sticky-disclosure-settings]')")
            page.keyboard.press("Control+Shift+J")
            assert page.evaluate(api + ".hotkey()") == expected
            page.evaluate("window.__effectHandle.dispose()")
            assert not errors, errors
            print(f"PASS {platform}: capture lifecycle, IME, default shortcut, process rows, locale and no-drag")
            context.close()
        browser.close()


if __name__ == "__main__":
    run()
