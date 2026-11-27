"""Browser smoke test for personal-tree signup and manager/admin separation.

Uses an in-memory Supabase mock; it never creates accounts or writes to the live database.
Requires Python Playwright and Chromium (or pass --executable).
"""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from playwright.sync_api import sync_playwright


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


MOCK_AUTH = r"""(() => {
  const state = window.ownerMock = {
    user: null, session: null, tree: null, people: [], personPlaces: [], calls: [],
    nextPerson: 1, nextPlace: 1, nextTree: 1
  };
  window.ownerMapEvents = [];
  window.addEventListener('drewo-atlas:owner-places', event => window.ownerMapEvents.push(event.detail));
  window.supabase = { createClient(_url, _key, options = {}) {
    const storage = options.auth?.storage;
    const storageKey = options.auth?.storageKey;
    const saveSession = () => storage?.setItem(storageKey, JSON.stringify({ access_token: state.session?.access_token }));
    const client = {
      auth: {
        getSession: async () => ({ data: { session: state.session }, error: null }),
        getUser: async () => ({ data: { user: state.user }, error: null }),
        signUp: async ({ email }) => {
          state.user = { id: 'synthetic-owner', email, is_anonymous: false };
          state.session = { access_token: 'synthetic-session', user: state.user };
          saveSession();
          return { data: { user: state.user, session: state.session }, error: null };
        },
        signInWithPassword: async ({ email }) => {
          state.user = { id: 'synthetic-owner', email, is_anonymous: false };
          state.session = { access_token: 'synthetic-session', user: state.user };
          saveSession();
          return { data: { user: state.user, session: state.session }, error: null };
        },
        signOut: async () => {
          if (state.failSignOut) return { error: { message: 'synthetic network failure' } };
          state.session = null; state.user = null;
          storage?.removeItem(storageKey);
          return { error: null };
        }
      },
      rpc: async (name, args) => {
        state.calls.push({ name, args });
        if (name === 'drewo_plus_ensure_account') return { data: null, error: null };
        if (name === 'drewo_plus_create_tree') {
          if (state.tree) {
            if (args.p_request_id === state.tree.request_id) return { data: state.tree.id, error: null };
            return { data: null, error: { code: '23505', message: 'У аккаунта уже есть древо.' } };
          }
          const id = 'bb4c3040-cc60-4c02-aab7-c470f4ec5a40';
          state.tree = { id, title: args.p_title, request_id: args.p_request_id,
            atlas_group_id: args.p_atlas_group_id, atlas_teip_id: args.p_atlas_teip_id,
            created_at: new Date().toISOString() };
          state.people.push({ id: 'person-root', tree_id: id, parent_id: null,
            name: args.p_first_name, born: null, died: null, note: '', revision: 1,
            created_at: new Date().toISOString() });
          return { data: id, error: null };
        }
        return { data: null, error: { message: `Unexpected RPC: ${name}` } };
      },
      from: table => ({
        select: () => {
          if (table === 'drewo_plus_trees') return {
            limit() { return this; },
            maybeSingle: async () => ({ data: state.tree, error: null })
          };
          let treeId = null;
          return {
            eq(_column, value) { treeId = value; return this; },
            order: async () => ({ data: table === 'drewo_plus_people'
              ? state.people.filter(person => person.tree_id === treeId)
              : state.personPlaces.filter(record => record.tree_id === treeId), error: null })
          };
        },
        insert: values => {
          if (table === 'drewo_plus_people') state.people.push({ id: `person-${state.nextPerson++}`,
            revision: 1, created_at: new Date().toISOString(), ...values });
          if (table === 'drewo_plus_person_places') {
            if (state.personPlaces.some(record => record.tree_id === values.tree_id
              && record.person_id === values.person_id && record.place_id === values.place_id && record.kind === values.kind)) {
              return { error: { code: '23505', message: 'duplicate place link' } };
            }
            state.personPlaces.push({ id: `place-${state.nextPlace++}`, created_at: new Date().toISOString(), ...values });
          }
          return { error: null };
        },
        delete: () => {
          let id = null;
          return {
            eq(column, value) {
              if (column === 'id') { id = value; return this; }
              if (column === 'tree_id') {
                state.personPlaces = state.personPlaces.filter(record => !(record.id === id && record.tree_id === value));
                return Promise.resolve({ error: null });
              }
              return this;
            }
          };
        },
        update: values => ({ eq: (_column, id) => ({ eq: async (_treeColumn, treeId) => {
          const person = state.people.find(row => row.id === id && row.tree_id === treeId);
          if (person) Object.assign(person, values, { revision: person.revision + 1 });
          return { error: null };
        } }) })
      })
    };
    return client;
  } };
})();"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--executable", default="/usr/bin/chromium")
    args = parser.parse_args()
    root = args.root.resolve(strict=True)

    with ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=root)) as server:
        Thread(target=server.serve_forever, daemon=True).start()
        base = f"http://127.0.0.1:{server.server_port}"
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(executable_path=args.executable, args=["--disable-webgl"])
            try:
                context = browser.new_context(viewport={"width": 320, "height": 568}, service_workers="block")
                context.add_init_script(MOCK_AUTH)
                context.route("**/*", lambda route: route.continue_() if route.request.url.startswith(base + "/") else route.abort())
                page = context.new_page()
                page.set_default_timeout(10000)
                page.on("pageerror", lambda error: print(f"Page error: {error}", flush=True))
                page.goto(base + "/atlas/")

                page.locator("#create-tree").click()
                page.locator("#owner-account-register").click()
                dialog = page.locator("#owner-account-dialog[open]")
                dialog.wait_for()
                form = dialog.locator("form.owner-form")
                assert page.locator("#create-access[open]").count() == 0
                assert page.locator("#owner-account-dialog[open]").count() == 1
                assert page.evaluate("document.documentElement.scrollWidth === innerWidth")
                assert dialog.evaluate("e => { const r=e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.height <= innerHeight; }")
                for control in form.locator('input:not([type="checkbox"])').all() + form.locator('button').all():
                    bounds = control.bounding_box()
                    if not bounds or bounds["height"] < 44:
                        print("Small personal auth control:", control.get_attribute("name"), control.get_attribute("type"), bounds, flush=True)
                    assert bounds and bounds["height"] >= 44
                form.locator('[name="email"]').fill("synthetic@example.test")
                form.locator('[name="password"]').fill("synthetic-secure-password-47")
                form.locator('[name="password-confirm"]').fill("synthetic-secure-password-47")
                form.locator('[name="remember"]').check()
                form.get_by_role("button", name="Создать аккаунт").click()

                tree_form = dialog.locator("form.owner-form")
                tree_form.locator('[name="title"]').fill("Семья Хьоти")
                tree_form.locator('[name="firstName"]').fill("Ахмад")
                tree_form.get_by_role("button", name="Создать древо").click()
                try:
                    dialog.get_by_role("heading", name="Семья Хьоти").wait_for()
                except Exception:
                    print("Owner dialog after tree creation:", dialog.inner_text(), flush=True)
                    raise
                assert page.evaluate("ownerMock.calls.find(call => call.name === 'drewo_plus_create_tree').args.p_atlas_group_id") is None
                assert page.evaluate("ownerMock.calls.find(call => call.name === 'drewo_plus_create_tree').args.p_atlas_teip_id") is None
                assert dialog.locator(".owner-tree-stats dd").nth(0).inner_text() == "1"
                assert dialog.locator(".owner-tree-stats dd").count() == 4

                dialog.get_by_role("button", name="Добавить родственника").click()
                person_form = dialog.locator("form.owner-form")
                person_form.locator('[name="name"]').fill("Зелим")
                person_form.locator('[name="born"]').fill("1980")
                person_form.locator('[name="parentId"]').select_option(label="Ахмад")
                person_form.get_by_role("button", name="Добавить").click()
                dialog.locator(".owner-tree-stats dd").nth(0).get_by_text("2").wait_for()
                assert dialog.locator(".owner-tree-stats dd").nth(1).inner_text() == "2"
                assert dialog.locator(".owner-tree-stats dd").nth(2).inner_text() == "1"
                assert dialog.locator(".owner-tree-stats dd").count() == 5
                assert dialog.locator(".owner-tree-stats dd").nth(3).inner_text() == "0"
                assert dialog.locator(".owner-tree-stats dd").nth(4).inner_text() == "Зелим · 1980 г."
                assert dialog.get_by_text("Зелим", exact=True).count() == 1

                dialog.locator(".owner-person-name", has_text="Зелим").locator(
                    "xpath=ancestor::li[contains(@class, 'owner-tree-person')][1]"
                ).get_by_role("button", name="Добавить место").click()
                place_form = dialog.locator("form.owner-place-form")
                place_form.locator('[name="placeId"]').select_option("grozny")
                place_form.locator('[name="kind"]').select_option(label="Место рождения")
                place_form.locator('[name="note"]').fill("Семейное предание")
                place_form.get_by_role("button", name="Добавить место").click()
                dialog.get_by_role("button", name="Убрать Грозный · Место рождения").wait_for()
                assert page.evaluate("ownerMock.personPlaces.length") == 1
                assert page.evaluate("ownerMock.personPlaces[0].note") == "Семейное предание"
                dialog.get_by_role("button", name="Назад к древу").click()
                assert dialog.locator(".owner-tree-stats dd").nth(3).inner_text() == "1"
                assert dialog.locator(".owner-person-places li").count() == 1
                assert dialog.locator(".owner-person-places li").inner_text().splitlines() == [
                    "Грозный · Место рождения", "Семейное предание"
                ]
                dialog.get_by_role("button", name="Показать места на карте").click()
                assert page.evaluate("ownerMapEvents.length") == 1
                assert page.evaluate("JSON.stringify(ownerMapEvents[0].marks)") == '[{"id":"grozny","kind":"Место рождения"}]'
                assert page.evaluate("!JSON.stringify(ownerMapEvents).includes('Зелим') && !JSON.stringify(ownerMapEvents).includes('Семейное предание')")

                if page.locator("#exit-family-map").is_visible():
                    page.locator("#exit-family-map").click()
                page.get_by_role("button", name="Открыть личный аккаунт и своё древо").click()
                dialog = page.locator("#owner-account-dialog[open]")
                dialog.get_by_role("heading", name="Семья Хьоти").wait_for()
                dialog.get_by_role("button", name="Места (1)").click()
                dialog.get_by_role("button", name="Убрать Грозный · Место рождения").click()
                assert page.evaluate("ownerMock.personPlaces.length") == 0
                dialog.get_by_role("button", name="Назад к древу").click()
                assert dialog.locator(".owner-tree-stats dd").nth(3).inner_text() == "0"

                dialog.get_by_role("button", name="Выйти").click()
                page.wait_for_function("!document.querySelector('#owner-account-dialog').open")
                assert page.evaluate("!localStorage.getItem('drewo-owner-auth-v1') && !sessionStorage.getItem('drewo-owner-auth-v1')")
                assert page.evaluate("!localStorage.getItem('waydean-trees-auth')")

                page.locator("#create-tree").click()
                page.locator("#owner-account-login").click()
                dialog = page.locator("#owner-account-dialog[open]")
                login_form = dialog.locator("form.owner-form")
                assert login_form.locator('[name="email"]').input_value() == "synthetic@example.test"
                login_form.locator('[name="password"]').fill("synthetic-secure-password-47")
                login_form.locator('button[type="submit"]').click()
                dialog.get_by_role("heading", name="Семья Хьоти").wait_for()
                page.evaluate("ownerMock.failSignOut = true")
                dialog.get_by_role("button", name="Сменить аккаунт").click()
                dialog.get_by_role("status").get_by_text("Сеанс удалён с этого устройства").wait_for()
                assert page.evaluate("!localStorage.getItem('drewo-owner-auth-v1') && !sessionStorage.getItem('drewo-owner-auth-v1')")
                print("Personal signup, one-tree RPC, private editor, logout and storage separation OK", flush=True)
                context.close()

                manager_context = browser.new_context(viewport={"width": 1280, "height": 800}, service_workers="block")
                manager_context.add_init_script("localStorage.setItem('waydean-trees-auth', JSON.stringify({expires_at: Date.now() / 1000 + 600}));")
                manager_context.route("**/*", lambda route: route.continue_() if route.request.url.startswith(base + "/") else route.abort())
                manager_page = manager_context.new_page()
                manager_page.goto(base + "/atlas/")
                manager_page.locator("#create-tree").click()
                manager_page.wait_for_url("**/trees/#create")
                assert manager_page.url.endswith("/trees/#create")
                print("Manager create action stays in the owner-only /trees/ cabinet", flush=True)
                manager_context.close()
            finally:
                browser.close()
                server.shutdown()


if __name__ == "__main__":
    main()
