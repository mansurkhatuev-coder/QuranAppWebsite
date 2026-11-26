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


def check_family_map(browser, base):
    context = browser.new_context(viewport={"width": 390, "height": 844}, service_workers="block")
    page = context.new_page()
    page.set_default_timeout(10000)
    context.route("**/*", lambda route: route.continue_() if route.request.url.startswith(base + "/") else route.abort())
    page.add_init_script("""(() => {
      sessionStorage.setItem('drewo-atlas:family-view', JSON.stringify({
        dir: 'drewo-synthetic', teips: ['shatoi/varand'], places: []
      }));
      sessionStorage.setItem('nek-session:drewo-synthetic', 'synthetic-session');
      const originalFetch = window.fetch;
      const requests = window.familyAuthRequests = [];
      window.fetch = (input, init) => {
        if (JSON.parse(init?.body || '{}').action !== 'auth') return originalFetch(input, init);
        return new Promise(resolve => requests.push(accepted => resolve({
          ok: accepted,
          status: accepted ? 200 : 401,
          json: async () => accepted
            ? {ok: true, treeDir: 'drewo-synthetic', role: 'viewer', sessionToken: 'synthetic-session'}
            : {error: 'Семейный вход отклонён'}
        })));
      };
    })()""")
    try:
        page.goto(base + "/atlas/#/family")
        dialog = page.locator("#family-map")
        form = dialog.locator(".family-place-form")
        status = dialog.get_by_role("status")
        page.wait_for_function("familyAuthRequests.length === 1")
        assert form.is_hidden()
        page.evaluate("familyAuthRequests[0](false)")
        status.get_by_text("Семейный вход отклонён").wait_for()
        assert form.is_hidden()

        dialog.get_by_role("button", name="Закрыть").click()
        page.evaluate("document.querySelector('#family-view').click()")
        page.wait_for_function("familyAuthRequests.length === 2")
        dialog.get_by_role("button", name="Закрыть").click()
        page.evaluate("document.querySelector('#family-view').click()")
        page.wait_for_function("familyAuthRequests.length === 3")
        page.evaluate("familyAuthRequests[2](true)")
        form.wait_for()
        assert dialog.locator(".family-places button").count() == 1
        page.evaluate("""async () => {
          familyAuthRequests[1](false);
          await new Promise(resolve => setTimeout(resolve, 0));
        }""")
        assert "отклонён" not in status.inner_text()
        form.get_by_role("button", name="Добавить отметку").click()
        dialog.get_by_role("button", name="Показать мои места на карте").wait_for()
        dialog.get_by_role("button", name="Убрать отметку").click()
        assert dialog.get_by_role("button", name="Показать мои места на карте").is_hidden()
        print("Family map: denied access, reopened dialog and session-only marks OK", flush=True)
    finally:
        context.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--browser", choices=["chromium", "webkit"], default="chromium")
    parser.add_argument("--executable")
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[2])
    args = parser.parse_args()
    root = args.root.resolve(strict=True)
    with ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=root)) as server:
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with sync_playwright() as playwright:
                # Entry routes must remain usable even without a GPU. Test 3D separately.
                flags = ["--disable-webgl"] if args.browser == "chromium" else []
                browser = getattr(playwright, args.browser).launch(executable_path=args.executable, args=flags)
                base = f"http://127.0.0.1:{server.server_port}"
                for width, height in [(320, 568), (390, 844), (844, 390), (768, 1024), (1280, 800)]:
                    check(browser, base, width, height)
                check_family_map(browser, base)
                browser.close()
        finally:
            server.shutdown()
