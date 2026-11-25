"""Install the historical /nek/ PWA, switch the server to the PR, and reopen it offline."""
import argparse
import subprocess
import tempfile
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[2]


class ReleaseServer(ThreadingHTTPServer):
    directory = ROOT


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, request, address, server):
        super().__init__(request, address, server, directory=server.directory)

    def do_GET(self):
        # Separate worktrees have independent mtimes. Test content replacement at one origin.
        del self.headers["If-Modified-Since"]
        super().do_GET()

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, *args):
        pass

    def copyfile(self, source, output):
        try:
            super().copyfile(source, output)
        except (BrokenPipeError, ConnectionResetError):
            pass


def prepare_previous_release(directory, revision):
    files = subprocess.check_output(
        ["git", "ls-tree", "-r", "--name-only", revision, "--", "nek/", "assets/drewo-motion.css"],
        cwd=ROOT, text=True,
    ).splitlines()
    if "nek/sw.js" not in files:
        raise ValueError("Previous revision must contain the installed /nek/ app.")
    for name in files:
        target = directory / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(subprocess.check_output(["git", "show", f"{revision}:{name}"], cwd=ROOT))


def run(context, server):
    origin = f"http://127.0.0.1:{server.server_port}"
    old_start = origin + "/nek/"
    page = context.pages[0]
    page.set_default_timeout(20000)
    page.goto(old_start, wait_until="domcontentloaded")
    page.wait_for_function("navigator.serviceWorker.controller !== null")
    cdp = context.new_cdp_session(page)
    manifest_id = cdp.send("Page.getAppManifest")["manifest"]["id"]
    assert manifest_id == old_start
    cdp.send("PWA.install", {"manifestId": manifest_id, "installUrlOrBundleUrl": old_start})
    cdp.send("PWA.getOsAppState", {"manifestId": manifest_id})

    # Same-tab session handoff and unrelated application storage are independent of the shell.
    page.evaluate("""async () => {
      sessionStorage.setItem('nek-session:drewo-example', 'synthetic-session');
      localStorage.setItem('nek:lastTree', JSON.stringify({path:'/drewo-example/'}));
      await caches.open('unrelated-upgrade-test');
    }""")
    server.directory = ROOT
    page.goto(old_start, wait_until="domcontentloaded")
    page.wait_for_url(origin + "/atlas/**", wait_until="domcontentloaded")
    page.wait_for_function("navigator.serviceWorker.controller?.scriptURL.endsWith('/atlas/sw.js')")
    assert page.locator("#atlas-login").inner_text() == "Моё древо"
    assert page.evaluate("sessionStorage.getItem('nek-session:drewo-example')") == "synthetic-session"
    current = cdp.send("Page.getAppManifest")["manifest"]
    assert current["id"] == manifest_id and current["startUrl"] == origin + "/atlas/"
    assert current["scope"] == origin + "/atlas/"

    # The browser checks existing registrations asynchronously. Request the normal update now.
    page.evaluate("""async () => {
      const reg = await navigator.serviceWorker.getRegistration('/nek/');
      await reg.update();
    }""")
    page.wait_for_function("""async () => {
      const keys = await caches.keys();
      return !keys.includes('waydean-nek-v6') && keys.includes('unrelated-upgrade-test');
    }""")

    with context.expect_page() as launched:
        cdp.send("PWA.launch", {"manifestId": manifest_id})
    app = launched.value
    app.set_default_timeout(20000)
    app.wait_for_url(origin + "/atlas/**", wait_until="domcontentloaded")
    app.wait_for_function("navigator.serviceWorker.controller?.scriptURL.endsWith('/atlas/sw.js')")
    # The old shortcut must also launch a new window with the network disconnected.
    app.close()
    context.set_offline(True)
    with context.expect_page() as offline_launch:
        cdp.send("PWA.launch", {"manifestId": manifest_id})
    app = offline_launch.value
    app.wait_for_url(origin + "/atlas/**", wait_until="domcontentloaded")
    app.locator("#opening-roots").wait_for()
    app.goto(old_start + "?login=1&u=offline-family", wait_until="domcontentloaded")
    app.locator("#family-access[open]").wait_for()
    assert app.locator("#login-input").input_value() == "offline-family"
    assert app.evaluate("""async () => {
      for (const name of await caches.keys()) {
        for (const request of await (await caches.open(name)).keys()) {
          if (request.url.includes('offline-family')) return false;
        }
      }
      return true;
    }""")
    app.keyboard.press("Escape")
    app.locator("#opening-roots").click()
    app.locator("#catalog-row-shatoi").click()
    app.locator("#catalog-row-varand").click()
    assert urlsplit(app.url).fragment == "/teip/shatoi/varand"
    print("Installed PWA identity, old shortcut, offline invitation and catalog, same-tab storage: OK")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--previous-ref", default="609776a")
    parser.add_argument("--executable")
    args = parser.parse_args()
    with tempfile.TemporaryDirectory() as work, ReleaseServer(("127.0.0.1", 0), Handler) as server:
        server.directory = Path(work) / "previous"
        prepare_previous_release(server.directory, args.previous_ref)
        Thread(target=server.serve_forever, daemon=True).start()
        try:
            with sync_playwright() as playwright:
                context = playwright.chromium.launch_persistent_context(
                    str(Path(work) / "profile"), executable_path=args.executable,
                    args=["--disable-webgl", "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1"],
                )
                try:
                    run(context, server)
                finally:
                    context.close()
        finally:
            server.shutdown()
