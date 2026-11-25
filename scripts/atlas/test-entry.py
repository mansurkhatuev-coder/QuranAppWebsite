"""Browser regression for family invitations and the atlas catalog. Requires Python Playwright."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright


class QuietHandler(SimpleHTTPRequestHandler):
    def copyfile(self, source, output):
        try:
            super().copyfile(source, output)
        except (BrokenPipeError, ConnectionResetError):
            pass  # A new page can cancel tiles requested by the old map.

    def log_message(self, *args):
        pass


def check(browser, base, width, height):
    context = browser.new_context(viewport={"width": width, "height": height}, has_touch=width < 1000,
                                  reduced_motion="reduce", service_workers="block")
    page = context.new_page()
    page.set_default_timeout(10000)

    def intercept(route):
        if route.request.url.startswith(base + "/"):
            route.continue_()
        elif urlsplit(route.request.url).path == "/functions/v1/publish-drewo":
            route.fulfill(status=401, json={"error": "Проверьте данные"},
                          headers={"Access-Control-Allow-Origin": "*"})
        else:
            route.abort()

    context.route("**/*", intercept)
    try:
        page.goto(base + ("/t/?c=sample" if width == 320 else "/nek/?login=1&u=sample"))
        page.locator("#family-access[open]").wait_for()
        assert page.locator("#login-input").input_value() == "sample"
        if width < 1000:
            assert page.locator("#password-input").evaluate("e => parseFloat(getComputedStyle(e).fontSize)") >= 16
        page.locator("#password-input").fill("synthetic")
        page.locator("#login-submit").click()
        page.locator("#login-error").wait_for()
        page.keyboard.press("Escape")
        assert page.evaluate("document.documentElement.scrollWidth === innerWidth")
        page.locator("#create-tree").click()
        assert page.locator('#create-access a[href="/trees/#create"]').is_visible()
        page.keyboard.press("Escape")
        page.locator("#opening-roots").click()
        page.locator("#catalog-row-shatoi").click()
        page.locator("#catalog-row-varand").click()
        assert page.locator("#aggregate-dashboard").is_visible()
        assert "Места в каталоге тухума" not in page.locator("#aggregate-dashboard").inner_text()
        print(f"{width} × {height} OK", flush=True)
    finally:
        context.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--browser", choices=["chromium", "webkit"], default="chromium")
    parser.add_argument("--executable")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    with ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=root)) as server:
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with sync_playwright() as playwright:
                # Entry routes must remain usable even without a GPU. Test 3D separately.
                flags = ["--disable-webgl"] if args.browser == "chromium" else []
                browser = getattr(playwright, args.browser).launch(executable_path=args.executable, args=flags)
                for width, height in [(320, 568), (390, 844), (844, 390), (768, 1024), (1280, 800)]:
                    check(browser, f"http://127.0.0.1:{server.server_port}", width, height)
                browser.close()
        finally:
            server.shutdown()
