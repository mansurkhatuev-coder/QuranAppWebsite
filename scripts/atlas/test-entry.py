"""Browser regression for family invitations and the atlas catalog. Requires Python Playwright."""
import argparse
import re
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
        assert page.locator('#family-access a[href="/trees/"]').is_visible()
        if width < 1000:
            assert page.locator("#password-input").evaluate("e => parseFloat(getComputedStyle(e).fontSize)") >= 16
        page.locator("#password-input").fill("synthetic")
        page.locator("#login-submit").click()
        page.locator("#login-error").wait_for()
        page.keyboard.press("Escape")
        assert page.evaluate("document.documentElement.scrollWidth === innerWidth")
        page.locator("#create-tree").click()
        assert page.locator('#owner-account-register').is_visible()
        assert page.locator('#owner-account-login').is_visible()
        assert page.locator('#create-access a[href="/trees/#create"]').count() == 0
        page.keyboard.press("Escape")
        assert page.evaluate("document.activeElement?.id === 'create-tree'")
        page.locator("#opening-roots").click()
        assert page.locator("#search").evaluate("e => parseFloat(getComputedStyle(e).fontSize)") >= 16
        if width >= 900:
            toggle = page.locator("#catalog-toggle")
            toggle.click()
            assert toggle.get_attribute("aria-expanded") == "false"
            assert toggle.locator("use").get_attribute("href") == "#i-plus"
            toggle.click()
            assert toggle.get_attribute("aria-expanded") == "true"
            assert toggle.locator("use").get_attribute("href") == "#i-minus"
        page.locator("#catalog-row-shatoi").click()
        page.locator("#catalog-row-varand").click()
        assert page.locator("#aggregate-dashboard").is_visible()
        assert "Места в каталоге тухума" not in page.locator("#aggregate-dashboard").inner_text()
        print(f"{width} × {height} OK", flush=True)
    finally:
        context.close()


def check_hover_media(browser, base, *, touch):
    viewport = {"width": 390, "height": 844} if touch else {"width": 1280, "height": 800}
    context = browser.new_context(viewport=viewport, is_mobile=touch, has_touch=touch,
                                 reduced_motion="reduce", service_workers="block")
    page = context.new_page()
    page.set_default_timeout(10000)
    context.route("**/*", lambda route: route.continue_() if route.request.url.startswith(base + "/") else route.abort())
    try:
        page.goto(base + "/atlas/", wait_until="domcontentloaded")
        create_tree = page.locator("#create-tree")
        create_tree.wait_for()
        assert create_tree.is_visible()
        media = page.evaluate("({hover: matchMedia('(hover: hover)').matches, fine: matchMedia('(pointer: fine)').matches, none: matchMedia('(hover: none)').matches, coarse: matchMedia('(pointer: coarse)').matches})")
        if touch:
            assert media["none"] and media["coarse"], media
        else:
            assert media["hover"] and media["fine"], media
        before = create_tree.evaluate("e => getComputedStyle(e).backgroundColor")
        create_tree.hover()
        after = create_tree.evaluate("e => getComputedStyle(e).backgroundColor")
        assert (before == after) if touch else (before != after), (before, after, media)
        preview = context.new_page()
        preview.goto(base + "/drewo/", wait_until="domcontentloaded")
        zoom_in = preview.locator("#zoomIn")
        zoom_in.wait_for()
        before = zoom_in.evaluate("e => ({background:getComputedStyle(e).backgroundColor, border:getComputedStyle(e).borderColor, color:getComputedStyle(e).color, shadow:getComputedStyle(e).boxShadow})")
        zoom_in.hover()
        after = zoom_in.evaluate("e => ({background:getComputedStyle(e).backgroundColor, border:getComputedStyle(e).borderColor, color:getComputedStyle(e).color, shadow:getComputedStyle(e).boxShadow})")
        assert (before == after) if touch else (before != after), (before, after, media)
        print(f"Hover media ({'touch' if touch else 'mouse'}) in Atlas and Waydean: OK", flush=True)
    finally:
        context.close()


def wait_for_family_markers(page, *ids):
    page.wait_for_function("""ids => ids.every(id => {
      const button = document.querySelector(`.is-family-marker:not([hidden])[data-marker-id="${id}"] button`);
      if (!button) return false;
      const rect = button.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 &&
        rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight;
    })""", arg=list(ids))


def check_family_map(browser, base, *, with_3d=False):
    viewport = {"width": 1280, "height": 800} if with_3d else {"width": 320, "height": 568}
    context = browser.new_context(viewport=viewport, service_workers="block", reduced_motion="reduce")
    page = context.new_page()
    page.set_default_timeout(30000 if with_3d else 10000)
    context.route("**/*", lambda route: route.continue_() if route.request.url.startswith(base + "/") else route.abort())
    page.add_init_script("""(() => {
      sessionStorage.setItem('drewo-atlas:family-view', JSON.stringify({
        dir: 'drewo-synthetic', teips: ['shatoi/varand'], places: []
      }));
      sessionStorage.setItem('nek-session:drewo-synthetic', 'synthetic-session');
      const originalFetch = window.fetch;
      const requests = window.familyPlacesRequests = [];
      const reads = window.familyPlacesReadPayloads = [];
      const writes = window.familyPlacesWrites = [];
      const consentRequests = window.familyAggregateConsentRequests = [];
      let consented = false;
      const savedMarks = window.familyPlacesSaved = [{id: 'grozny', kind: 'Родное место'}];
      window.fetch = (input, init) => {
        const payload = JSON.parse(init?.body || '{}');
        if (payload.action === 'family-aggregate-consent') {
          consentRequests.push({...payload});
          if (payload.decision === 'grant') consented = true;
          if (payload.decision === 'revoke') consented = false;
          return Promise.resolve({ok: true, status: 200, json: async () => ({
            ok: true, treeDir: 'drewo-synthetic', canManage: true,
            consent: {consented, policyVersion: 'drewo-family-aggregate-v1', updatedAt: null}
          })});
        }
        if (payload.action !== 'family-places') return originalFetch(input, init);
        if (Object.prototype.hasOwnProperty.call(payload, 'mark')) {
          if (!payload.mark || typeof payload.mark.id !== 'string' || typeof payload.mark.kind !== 'string' || typeof payload.mark.present !== 'boolean') {
            throw new Error('Unexpected synthetic family-place write payload');
          }
          const {id, kind, present} = payload.mark;
          writes.push({id, kind, present});
          const index = savedMarks.findIndex(mark => mark.id === id && mark.kind === kind);
          if (present && index < 0) savedMarks.push({id, kind});
          if (!present && index >= 0) savedMarks.splice(index, 1);
          return Promise.resolve({ok: true, status: 200, json: async () => ({
            ok: true, treeDir: 'drewo-synthetic', places: savedMarks.map(mark => ({...mark})), canEdit: true, canManageConsent: true
          })});
        }
        reads.push({...payload});
        return new Promise(resolve => requests.push(accepted => resolve({
          ok: accepted,
          status: accepted ? 200 : 401,
          json: async () => accepted
            ? {ok: true, treeDir: 'drewo-synthetic', places: savedMarks.map(mark => ({...mark})), canEdit: true, canManageConsent: true}
            : {error: 'Семейный вход отклонён'}
        })));
      };
    })()""")
    try:
        page.goto(base + "/atlas/#/family")
        dialog = page.locator("#family-map")
        form = dialog.locator(".family-place-form")
        status = dialog.locator("p[role='status']").first
        page.wait_for_function("familyPlacesRequests.length === 1")
        assert form.is_hidden()
        page.evaluate("familyPlacesRequests[0](false)")
        status.get_by_text("Семейный вход отклонён").wait_for()
        assert form.is_hidden()

        dialog.get_by_role("button", name="Закрыть").click()
        page.evaluate("document.querySelector('#family-view').click()")
        page.wait_for_function("familyPlacesRequests.length === 2")
        dialog.get_by_role("button", name="Закрыть").click()
        page.evaluate("document.querySelector('#family-view').click()")
        page.wait_for_function("familyPlacesRequests.length === 3")
        page.evaluate("familyPlacesRequests[2](true)")
        form.wait_for()
        consent = dialog.locator(".family-consent")
        consent.wait_for()
        attestation = consent.locator("#family-consent-attestation")
        grant = consent.get_by_role("button", name="Дать согласие")
        attestation_bounds = consent.locator(".family-consent-attestation").bounding_box()
        grant_bounds = grant.bounding_box()
        assert attestation_bounds and attestation_bounds["height"] >= 44
        assert grant_bounds and grant_bounds["height"] >= 44
        assert grant.is_disabled()
        attestation.check()
        assert not grant.is_disabled()
        grant.click()
        consent.get_by_role("status").get_by_text("Согласие записано").wait_for()
        revoke = consent.get_by_role("button", name="Отозвать согласие")
        revoke.click()
        consent.get_by_role("status").get_by_text("Сейчас это древо не участвует").wait_for()
        assert page.evaluate("familyAggregateConsentRequests.filter(payload => payload.decision).map(payload => [payload.decision, payload.authorityAttested ?? false])") == [["grant", True], ["revoke", False]]
        dialog.locator(".family-places").get_by_role("button", name="Грозный · Родное место", exact=True).wait_for()
        page.evaluate("""async () => {
          familyPlacesRequests[1](false);
          await new Promise(resolve => setTimeout(resolve, 0));
        }""")
        assert "отклонён" not in status.inner_text()
        assert page.evaluate("familyPlacesReadPayloads.every(payload => !Object.prototype.hasOwnProperty.call(payload, 'mark'))")
        form.get_by_role("button", name="Добавить отметку").click()
        show_map = dialog.get_by_role("button", name="Показать мои места на карте")
        show_map.wait_for()
        form.locator('[name="kind"]').select_option(label="Место рождения")
        form.get_by_role("button", name="Добавить отметку").click()
        birth_mark = dialog.get_by_role("button", name="Убрать отметку Грозный · Место рождения")
        birth_mark.wait_for()
        assert page.evaluate("familyPlacesSaved.some(mark => mark.id === 'grozny' && mark.kind === 'Место рождения')")
        if with_3d:
            form.locator('[name="place"]').select_option("khoi-village")
            form.locator('[name="kind"]').select_option(label="Родное место")
            form.get_by_role("button", name="Добавить отметку").click()
            dialog.get_by_role("button", name="Убрать отметку Хой · Родное место").wait_for()
            page.locator("#map-status").get_by_text(re.compile("Атлас готов|Облегчённый рельеф")).wait_for(timeout=45000)
            show_map.click()
            marker = page.locator('[data-marker-id="grozny"]')
            button = marker.get_by_role("button", name=re.compile("Родное место, Место рождения"))
            button.wait_for()
            label = marker.locator('.atlas-marker-label')
            label.wait_for()
            assert label.inner_text() == 'Грозный · Родное место, Место рождения'
            wait_for_family_markers(page, "grozny", "khoi-village")
            assert page.locator('.atlas-marker-anchor:not([hidden])').count() == 2
            for width, height in [(390, 844), (844, 390), (viewport["width"], viewport["height"])]:
                page.set_viewport_size({"width": width, "height": height})
                wait_for_family_markers(page, "grozny", "khoi-village")
            page.evaluate("document.querySelector('#family-view').click()")
            page.wait_for_function("familyPlacesRequests.length === 4")
            assert label.text_content() == 'Грозный'
            page.evaluate("familyPlacesRequests[3](false)")
            status.get_by_text("Семейный вход отклонён").wait_for()
            dialog.get_by_role("button", name="Закрыть").click()
            page.evaluate("document.querySelector('#family-view').click()")
            page.wait_for_function("familyPlacesRequests.length === 5")
            page.evaluate("familyPlacesRequests[4](true)")
            dialog.locator(".family-places").get_by_role("button", name="Грозный · Родное место", exact=True).wait_for()
            dialog.locator(".family-places").get_by_role("button", name="Грозный · Место рождения", exact=True).wait_for()
            dialog.locator(".family-places").get_by_role("button", name="Хой · Родное место", exact=True).wait_for()
            show_map.click()
            wait_for_family_markers(page, "grozny", "khoi-village")
            button.click()
            page.locator("#place-detail").get_by_role("heading", name="Грозный").wait_for()
            source = page.get_by_role("link", name="Источник координат")
            assert source.get_attribute("target") == "_blank"
            assert source.locator("svg[aria-hidden=true]").count() == 1
            assert page.locator('#exit-family-map').is_hidden()
            assert label.text_content() == 'Грозный'
            print("3D family map: labels, reauthorization and place details OK", flush=True)
        else:
            selects = form.locator("select")
            assert selects.count() == 2
            for select in selects.all():
                assert select.evaluate("e => parseFloat(getComputedStyle(e).fontSize)") >= 16
            submit = form.get_by_role("button", name="Добавить отметку")
            for control in [*selects.all(), submit]:
                bounds = control.bounding_box()
                assert bounds and bounds["width"] >= 44 and bounds["height"] >= 44
            submit.scroll_into_view_if_needed()
            assert dialog.evaluate("e => { const r=e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }")
            birth_mark.click()
            assert show_map.is_visible()
            dialog.get_by_role("button", name="Убрать отметку Грозный · Родное место").click()
            show_map.wait_for(state="hidden")
            assert page.evaluate("familyPlacesWrites.filter(mark => mark.id === 'grozny').length >= 2")
            assert page.evaluate("familyPlacesWrites.every(mark => typeof mark.id === 'string' && typeof mark.kind === 'string' && typeof mark.present === 'boolean')")
            print("Family map: delayed reads, saved marks, and mobile controls OK", flush=True)
    finally:
        context.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--browser", choices=["chromium", "webkit"], default="chromium")
    parser.add_argument("--executable")
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--family-3d", action="store_true", help="check family markers with Chromium software WebGL")
    args = parser.parse_args()
    if args.family_3d and args.browser != "chromium":
        parser.error("--family-3d requires Chromium")
    root = args.root.resolve(strict=True)
    with ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=root)) as server:
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with sync_playwright() as playwright:
                # Entry routes must remain usable even without a GPU. Test 3D separately.
                flags = []
                if args.browser == "chromium":
                    flags = ["--enable-webgl", "--use-gl=angle", "--use-angle=swiftshader"] if args.family_3d else ["--disable-webgl"]
                browser = getattr(playwright, args.browser).launch(executable_path=args.executable, args=flags)
                base = f"http://127.0.0.1:{server.server_port}"
                if not args.family_3d:
                    for width, height in [(320, 568), (390, 844), (844, 390), (768, 1024), (1280, 800)]:
                        check(browser, base, width, height)
                    if args.browser == "chromium":
                        check_hover_media(browser, base, touch=True)
                        check_hover_media(browser, base, touch=False)
                check_family_map(browser, base, with_3d=args.family_3d)
                browser.close()
        finally:
            server.shutdown()
