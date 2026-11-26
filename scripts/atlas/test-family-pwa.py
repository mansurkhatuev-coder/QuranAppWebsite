"""Install and reopen two shared-editor PWAs in Chromium using synthetic families."""
import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import re
import subprocess
import tempfile
from threading import Thread
from urllib.parse import parse_qs, urlencode, urlsplit

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[2]
EDITOR = '/drewo/waydean-preview.html'
FAMILIES = ('drewo-fixture-alpha', 'drewo-fixture-beta')


class FixtureHandler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def send(self, content, media_type, cors=False):
        self.send_response(200)
        self.send_header('Content-Type', media_type)
        if cors:
            self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(content)


class Site(FixtureHandler):
    def do_GET(self):
        path = urlsplit(self.path).path
        if path == EDITOR:
            self.send(self.server.html, 'text/html; charset=utf-8')
        elif path in ('/drewo/icon-192.png', '/drewo/icon-512.png'):
            self.send((ROOT / path.lstrip('/')).read_bytes(), 'image/png')
        else:
            self.send_error(404)


class ManifestApi(FixtureHandler):
    def do_GET(self):
        request = urlsplit(self.path)
        params = parse_qs(request.query)
        tree = params.get('tree', [''])[0]
        if request.path != '/publish-drewo' or tree not in FAMILIES or params != {
            'action': ['family-manifest'], 'tree': [tree], 'origin': [self.server.site_origin]
        }:
            self.send_error(400)
            return
        self.send(self.server.manifests[tree], 'application/manifest+json', cors=True)


def manifest(tree, origin):
    return subprocess.check_output(['node', '--input-type=module', '-e', '''
      import {buildFamilyAppManifest} from './supabase/functions/publish-drewo/family-app-manifest.ts';
      process.stdout.write(JSON.stringify(buildFamilyAppManifest(process.argv[1], process.argv[2])));
    ''', tree, origin], cwd=ROOT)


def check(context, origin):
    page = context.pages[0]
    cdp = context.new_cdp_session(page)
    routes = []
    for tree in FAMILIES:
        entry = origin + EDITOR + '?' + urlencode({'source': 'family', 'familyPath': f'/{tree}/'})
        page.goto(entry + '&nek=synthetic.token#nek=synthetic.fragment')
        manifest_url = page.locator('link[rel=manifest]').get_attribute('href')
        assert 'synthetic' not in manifest_url and 'nek=' not in manifest_url
        current = cdp.send('Page.getAppManifest')['manifest']
        assert current['id'] == origin + f'/{tree}/'
        assert current['startUrl'] == entry and current['scope'] == origin + EDITOR
        cdp.send('PWA.install', {'manifestId': current['id'], 'installUrlOrBundleUrl': page.url})
        routes.append((current['id'], entry))

    for app_id, entry in routes:
        with context.expect_page() as launch:
            cdp.send('PWA.launch', {'manifestId': app_id})
        app = launch.value
        app.wait_for_url(entry)
        app.close()
    print('Two separate family apps installed and relaunched at their own token-free editor addresses')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--executable')
    args = parser.parse_args()
    with ThreadingHTTPServer(('127.0.0.1', 0), Site) as site, ThreadingHTTPServer(('127.0.0.1', 0), ManifestApi) as api:
        origin = f'http://127.0.0.1:{site.server_port}'
        endpoint = f'http://127.0.0.1:{api.server_port}/publish-drewo'
        head = (ROOT / EDITOR.lstrip('/')).read_text().split('</head>', 1)[0]
        head = re.sub(r'(<meta name="waydean-publish-api" content=")[^"]+', r'\g<1>' + endpoint, head)
        site.html = (head + '</head><body><p>Синтетическое древо</p></body></html>').encode()
        api.site_origin = origin
        api.manifests = {tree: manifest(tree, origin) for tree in FAMILIES}
        for server in (site, api):
            Thread(target=server.serve_forever, daemon=True).start()
        try:
            with tempfile.TemporaryDirectory(prefix='drevo-family-apps-') as profile, sync_playwright() as playwright:
                context = playwright.chromium.launch_persistent_context(profile, executable_path=args.executable)
                try:
                    check(context, origin)
                finally:
                    context.close()
        finally:
            site.shutdown()
            api.shutdown()
