# Сайт «Коран и Азкары»

Статический лендинг для ссылок на RuStore, APK (Яндекс.Диск) и будущий App Store. Три страницы: главная, политика конфиденциальности, поддержка.

Работает без VPN из РФ при размещении на **российском хостинге** (Beget, Timeweb, Reg.ru и т.п.).

## Структура

```
website/
  index.html           # главная, кнопки скачивания
  privacy.html         # политика конфиденциальности (для RuStore)
  support.html         # контакты
  styles.css
  links.js             # ваши ссылки (редактировать перед заливкой)
  links.example.json   # шаблон полей
  site.js              # подставляет ссылки в кнопки
  assets/icon.png      # иконка приложения
```

## Быстрый старт

1. Скопируйте `links.example.json` → отредактируйте значения → перенесите в `links.js` (объект `LINKS`).
2. Залейте **всё содержимое** папки `website/` в `public_html/` на хостинге (FTP или файловый менеджер).
3. Включите бесплатный SSL (Let's Encrypt) в панели хостинга.
4. Проверьте с телефона без VPN:
   - `https://ваш-домен.ru/`
   - `https://ваш-домен.ru/privacy.html`
   - `https://ваш-домен.ru/support.html`

Локальный просмотр: откройте `index.html` в браузере или поднимите простой сервер:

```bash
cd website
npx --yes serve .
```

## GitHub Pages (бесплатно)

Репозиторий: [github.com/mansurkhatuev-coder/QuranAppWebsite](https://github.com/mansurkhatuev-coder/QuranAppWebsite)

Workflow: [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) — деплой всего репозитория на Pages.

**Сайт:** `https://waydean.ru/` (домен в `CNAME`, зеркало: `https://mansurkhatuev-coder.github.io/QuranAppWebsite/`)

**Обновление:** измените файлы, затем из папки `website/`:

```bash
git add .
git commit -m "update site"
git push
```

**Первый раз на GitHub:** Settings → Pages → Source: **GitHub Actions**, затем Actions → Deploy to GitHub Pages → Run workflow.

**Свой домен:** файл `CNAME` содержит `waydean.ru`. В GitHub: Settings → Pages → Custom domain. В DNS: A-записи на GitHub Pages или CNAME `www` → `mansurkhatuev-coder.github.io`.

APK раздаётся через **GitHub Releases** — прямое скачивание без регистрации.

## Публикация APK (GitHub Release)

1. Соберите релиз: `npm run build:android:apk` →  
   `android/app/build/outputs/apk/release/app-release.apk`
2. Создайте [Personal Access Token](https://github.com/settings/tokens) с правом `repo` для репозитория `QuranAppWebsite`.
3. Опубликуйте одной командой из корня QuranApp:

```powershell
$env:GITHUB_TOKEN = "ghp_..."
npm run publish:website-apk
```

Скрипт загрузит APK в [Releases](https://github.com/mansurkhatuev-coder/QuranAppWebsite/releases), обновит `links.js` и запушит сайт.

**Вручную:** GitHub → QuranAppWebsite → Releases → New release → тег `v1.0.4` → прикрепите `koran-i-azkary-1.0.4.apk`. Workflow автоматически обновит `links.js`.

Прямая ссылка для `links.js`:

`https://github.com/mansurkhatuev-coder/QuranAppWebsite/releases/download/v1.0.4/koran-i-azkary-1.0.4.apk`

### Яндекс.Диск (устарело)

Раньше APK раздавали через Яндекс.Диск — он иногда просит регистрацию. Используйте GitHub Release (см. выше).

## Настройка ссылок (`links.js`)

| Поле | Описание |
|------|----------|
| `rustore` | Ссылка на карточку в RuStore. Пустая строка → кнопка «RuStore» с бейджем «Скоро». |
| `apk` | Прямая ссылка на APK (GitHub Release). Пустая → кнопка неактивна. |
| `appStore` | Ссылка App Store. Пустая → «Скоро». |
| `supportEmail` | Email для поддержки и политики. |
| `supportTelegram` | Ссылка `https://t.me/...`. Пустая → строка скрыта. |
| `appVersion` | Версия из `app.json` (сейчас `1.0.4`). |
| `appPackage` | `com.sheyhmansur.quranapp` |

**Не коммитьте** реальные прод-URL в git, если не хотите — достаточно править `links.js` только на хостинге.

### ~~Яндекс.Диск — APK без VPN~~ (устарело)

1. Соберите релиз: `npm run build:android:apk` → файл  
   `android/app/build/outputs/apk/release/app-release.apk`
2. Загрузите APK на [Яндекс.Диск](https://disk.yandex.ru).
3. ПКМ по файлу → **Поделиться** → **Скопировать ссылку** → доступ **«По ссылке»** для всех.
4. Вставьте ссылку в `LINKS.apk`.
5. Проверьте с телефона **без VPN**: открывается страница с кнопкой скачивания.

При каждом обновлении: залейте новый APK на Диск и при необходимости обновите ссылку (или используйте одну ссылку на папку и заменяйте файл внутри).

**Альтернатива:** положить APK в `/downloads/app.apk` на том же хостинге — прямое скачивание одним тапом, но расходуется трафик хостинга (~50–100 МБ на установку).

### RuStore

После публикации вставьте каталожную ссылку вида:

`https://www.rustore.ru/catalog/app/XXXXXXXX`

В консоли RuStore укажите:

- **Сайт разработчика:** `https://waydean.ru/`
- **Политика конфиденциальности:** `https://waydean.ru/privacy.html`
- **Поддержка:** email с `support.html` или ссылка на `https://waydean.ru/support.html`

Подробнее: [RUSTORE_RELEASE.md](../RUSTORE_RELEASE.md).

### App Store (позже)

Когда приложение появится в App Store, задайте `appStore: 'https://apps.apple.com/app/id...'` — кнопка станет активной автоматически.

---

## Индексация в поисковиках (Google, Яндекс)

Сайт **не появится в поиске сам по себе** — нужны технические файлы и регистрация в вебмастерах.

### Что уже есть в репозитории

- `robots.txt` — разрешает индексацию, указывает на карту сайта
- `sitemap.xml` — список всех страниц для роботов
- Meta-теги `canonical`, Open Graph и JSON-LD на главной

После изменений задеплойте сайт (см. GitHub Pages выше).

### 1. Google Search Console

1. Откройте [search.google.com/search-console](https://search.google.com/search-console)
2. Добавьте ресурс: `https://waydean.ru/`
3. Подтвердите владение (HTML-тег, DNS или файл в корне сайта)
4. **Карта сайта** → добавьте URL: `https://waydean.ru/sitemap.xml`
5. **Проверка URL** → `https://waydean.ru/` → «Запросить индексирование»

### 2. Яндекс Вебмастер

1. [webmaster.yandex.ru](https://webmaster.yandex.ru/)
2. Добавьте `https://waydean.ru/`
3. Подтвердите права (meta-тег или DNS)
4. **Индексирование** → **Файлы Sitemap** → `https://waydean.ru/sitemap.xml`
5. **Переобход страниц** → `https://waydean.ru/`

### 3. Два адреса (github.io и waydean.ru)

Если оба открываются — в Search Console и Вебмастере регистрируйте **только** `waydean.ru`. Canonical на всех страницах уже указывает на этот домен.

### Сроки

Первая индексация обычно **от нескольких дней до 2–4 недель**. Ускоряет: ссылка на сайт в карточке RuStore, соцсетях, подписи email.

---

### Вариант A — NS хостинга (проще)

1. Купите домен `.ru` на [domain.ru](https://www.domain.ru) или [reg.ru](https://www.reg.ru).
2. Оформите минимальный тариф хостинга (Beget, Timeweb, Reg.ru «Сайт» — ~100–200 ₽/мес).
3. В панели **domain.ru** → DNS → укажите NS-серверы хостинга (например `ns1.beget.com`, `ns2.beget.com` — точные значения даст хостинг).
4. В панели хостинга привяжите домен к аккаунту.
5. Дождитесь обновления DNS (обычно 15 мин – 24 ч).

### Вариант B — A-запись

Если домен остаётся на domain.ru, а сайт на другом IP:

| Тип | Имя | Значение |
|-----|-----|----------|
| A | `@` | IP-адрес сервера хостинга |
| A | `www` | тот же IP (или CNAME на `@`) |

Точный IP и рекомендации — в документации вашего хостинга.

---

## SSL (HTTPS)

1. После привязки домена откройте раздел **SSL / Let's Encrypt** в панели хостинга.
2. Выпустите сертификат для `@` и `www`.
3. Включите редирект HTTP → HTTPS (если есть опция в панели).

RuStore и пользователи должны открывать сайт по **https://**.

---

## Загрузка на хостинг (FTP)

Типичные данные от хостинга:

- **Хост:** `ваш-логин.beget.tech` или IP
- **Логин / пароль:** из панели
- **Папка:** `public_html/` или `www/`

Залейте файлы:

```
public_html/
  index.html
  privacy.html
  support.html
  styles.css
  links.js
  site.js
  assets/icon.png
```

FileZilla, WinSCP или встроенный файловый менеджер в панели — любой способ.

---

## Проверка без VPN

С мобильного интернета (не Wi‑Fi за VPN):

- [ ] Главная открывается по HTTPS
- [ ] Кнопка RuStore ведёт в магазин (или «Скоро», если ещё не опубликовано)
- [ ] APK с Я.Диска скачивается
- [ ] `privacy.html` и `support.html` доступны
- [ ] SSL без предупреждений в браузере

---

## Обновление версии

При новом релизе приложения:

1. Обновите `appVersion` в `links.js` (и в `app.json` в основном проекте).
2. Залейте новый APK на Я.Диск (или замените файл в папке).
3. Перезалейте `links.js` на хостинг, если менялись ссылки.

Политику конфиденциальности меняйте только если добавили новые разрешения или сбор данных.
