# Waydean «Древо» — документы дизайна

## Последний зафиксированный статус — 2026-10-12

Обзорная витрина собрана 2026-10-05; технические результаты ниже относятся к датам, указанным в отчётах.

**Стадия:** локальный release-candidate собирается для проверки владельцем на компьютере. К нему подключён локальный Remotion-экспорт; рендер работает отдельной службой только на `127.0.0.1`. Полный видеосценарий не проверен, production-выкладка не выполнялась.

Для общего визуального обзора открой [Waydean Review Room](review/README.md). На одной странице собраны Masters, desktop/mobile prototypes, референсы, локальные экспортные preview и актуальный план. Ссылка на HOTI видна только в локальном preview.

**Локальная тестовая сборка:** для ручной проверки открой `drewo/LOCAL-TESTING.md` и запусти `scripts/start-waydean-local.ps1`. Скрипт откроет HOTI из локального снимка (`drewo/family-tree.json`). В локальном меню «Ещё» есть установка Waydean, статус офлайн-кеша, запрос разрешения и тестовое уведомление только на этом устройстве. Серверная подписка доступна только после подтверждённого входа в account-маршрут; локальный HOTI preview не меняет production. Старый экран остаётся отдельным.

Локальный пункт «Создать видео» открывает шаблон «История рода» в Remotion Studio и передаёт выбранного человека и режим. MP4 собирается на этом компьютере и остаётся в `H:\CodexBuildTemp\WaydeanRemotion`; это отдельный локальный прототип, без production worker и облачной очереди. Первый запуск установит зависимости, если их нет.

Review Room остаётся витриной Masters, локальных прототипов и экспортных preview, а не заменой production-приложения. Отдельная account-кнопка в текущем древе предназначена владельцу для проверки Waydean на реальных данных; экран не сохраняет изменения в дерево.

- **Визуальное направление:** премиальный тёмный кинематографичный стиль согласован. Desktop Master 1440 × 900 утверждён; композиция Mobile Master v0.1 принята и локально сверена на 390 × 844 и 320 × 720. Точные токены, профиль мобильного состояния и общий pixel review ещё не закрыты.
- **Древо и motion:** Desktop D01 сверено с композицией и synthetic-структурой Master: 1–3–3, шесть parent-связей, выбранный demo-03. В desktop/mobile prototypes есть два generated demo-портрета и силуэт для записей без фото. После изменения photo-state завершён повторный responsive-sweep: 16 состояний × 3 desktop-размера и 16 × 2 mobile-размера, всего 80 открытий. JS-ошибок, горизонтального overflow, сломанных фото и наложений основных mobile-контролов не найдено. Фото-фильтр отдельно проверен кликом на desktop 1440 × 900 и mobile 390 × 844: текущий выбор синхронизируется с первым совпадением, пустой результат сохраняет профиль-контекст. Скриншоты: [desktop — фото найдены](desktop-prototype/previews/filtersPhotos-selection-1440x900-2026-10-05.png), [desktop — пустая выдача](desktop-prototype/previews/filtersEmpty-selection-1440x900-2026-10-05.png), [mobile — фото найдены](prototype/previews/photoResults-selection-390x844-2026-10-05.png), [mobile — пустая выдача](prototype/previews/filtersEmpty-selection-390x844-2026-10-05.png). Отдельный read-only preview на 157 локальных людях готов для review. Suite 77/77 в 17 non-video файлах относится к срезу до добавления photo-state; целевой filter-model после этого прошёл 5/5. Печатные проверки используют локальный read-only HOTI snapshot; тест полного `family-tree.json` не запускался. Общий pixel review, device FPS trace, pinch и слабый телефон остаются открытыми.
- **Mobile prototype:** исправлены диапазон лет, который раньше скрывал все записи, и `searchEmpty`, который показывал два совпадения. Сейчас видны 7 базовых карточек, пустой поиск даёт 0 результатов, оба сброса возвращают дерево. После photo-state все 16 состояний открыты на 390 × 844 и 320 × 720 без найденного переполнения или ошибки JavaScript; основной кадр дополнительно визуально сверен с Mobile Master. Актуальные снимки: [390 × 844](prototype/previews/mobile-master-390x844-2026-10-05.png) и [320 × 720](prototype/previews/mobile-master-320x720-2026-10-05.png). Полный pixel review, точные tokens и проверка на физическом телефоне остаются открытыми.
- **Печать:** проверены все 10 комбинаций формата и ориентации и 33 PDF-листа; модельные проверки — 14/14. На 2026-10-05 дополнительно создан и визуально просмотрен синтетический A4 PDF человека: одностраничное дерево теперь центрируется и увеличивается под лист. Открыты физическая читаемость и стыковка листов, фотоматериалы, QR/access, системный диалог и интеграция печати в продукт. PNG экспорт пропущен по указанию пользователя.
- **Видео:** технические кандидаты и QA-материалы сохранены локально; блок временно отложен по просьбе пользователя. Он не считается принятым: визуальное утверждение текста/safe bounds, звук, очередь, защищённое хранилище и production-данные остаются открытыми. Локальный HOTI QA не включается в Pages.
- **Сохранение production-функций:** текущая матрица основана на checkout, а не на проверке развёрнутой версии. Access/operations/system prototypes остаются UX-mock; основной Waydean preview теперь имеет локальную PWA-установку, офлайн-кеш и тестовое уведомление. Реальные push subscribe/unsubscribe вызываются только из подтверждённого `source=account` после разрешения браузера и пароля редактора; этот API-поток ещё не проверен. Авторизация и сохранение дерева в preview не подключены, фото/история/backup операции остаются локальными. Отдельный HOTI-preview блокируется вне loopback, а Pages workflow исключают его файлы из артефакта; клиентский gate сам по себе не защищает статический JSON. В checkout результаты поиска всегда форматируются григорианскими годами, а старый экран отдельно переключает CSS-слой календаря каждые 3 секунды; ожидаемое правило календаря надо уточнить.
- **Контракт интеграции:** [production adapter contract](integration/production-adapter-contract.md) описывает форматы дерева, сессии, публикацию, фото и ограничения ролей по локальному исходнику. Это не live-проверка; новый интерфейс с API пока не соединён.

### Что остаётся до production

Текущая очередь, зависимости и условия завершения зафиксированы в [плане оставшихся работ](delivery-plan.md). Шесть крупных пакетов:

1. Сверить production baseline и закончить визуальную приёмку Desktop/Mobile Masters.
2. Довести локальный Waydean как дополнительный Premium-режим, сохраняя текущий экран и все его функции; затем подключить подтверждённые операции через общий адаптер.
3. Закончить печать на реальных данных и проверить фактические SVG/PDF и QR/access; PNG пропущен по решению пользователя.
4. После основного релиза отдельно вернуться к ролику «История рода», серверной очереди, хранению и выдаче видео.
5. Пройти device performance gate и итоговую функциональную/визуальную регрессию.
6. Проверить Premium-вход владельца и fallback на staging; после отдельного утверждения включить Waydean только для разрешённого аккаунта. Платёжный сервис подключать позднее отдельным этапом.

Видео и подключение платежей остаются отложенными. Локальную Waydean нужно принять до подключения Premium-точки production; текущая версия остаётся fallback. Старый `cinematic.html` и Remotion-материалы сохранены для будущего review; их наличие в репозитории не означает продолжение или приёмку блока.

Автоматические тесты подтверждают только указанные модели и локальный код. Они не подтверждают визуальное совпадение, server/API поведение, production-функции или производительность телефона.

- [`product-design-spec.md`](product-design-spec.md) — общий источник требований и плана.
- [delivery-plan.md](delivery-plan.md) — актуальная очередь оставшихся работ до production, статусы и критерии готовности шести крупных пакетов.
- [`design-bible-v1.md`](design-bible-v1.md) — визуальные правила v1, проект на согласование.
- [design-tokens.md](design-tokens.md) — существующие Premium-значения и стартовые design tokens для согласования.
- [components/component-bible.md](components/component-bible.md) — состав компонентов, их состояния и обязательные кадры prototype.
- [components/production-flows.md](components/production-flows.md) — проектные состояния действующих функций: вход, редактирование, фото, сохранение, история, доступ и настройки.
- [access-prototype/README.md](access-prototype/README.md) — локальный responsive mock входа, ошибок, истёкшей сессии и выхода; серверной авторизации нет.
- [ops-prototype/README.md](ops-prototype/README.md) — локальный responsive mock истории, резервных копий, восстановления и управления; реальные данные, API и мутации не подключены.
- [system-prototype/README.md](system-prototype/README.md) — отдельный local mock ссылок, вида/погоды, onboarding и формата года. Установка/локальное тестовое уведомление доступны в основном Waydean preview; server push уже вызывает текущий API в подтверждённом account-маршруте, но ждёт проверки на staging.
- [states/screen-state-catalog.md](states/screen-state-catalog.md) — каталог mobile/desktop кадров и критерии проверки.
- [motion/motion-bible.md](motion/motion-bible.md) — правила осмысленного движения, камеры, LOD, физики и уровней качества.
- [motion/motion-lifecycle.mjs](motion/motion-lifecycle.mjs) и [тесты](motion/motion-lifecycle.test.mjs) — остановка или завершение сцены при скрытии вкладки и смене системного reduced motion.
- [prototype/README.md](prototype/README.md) — инструкция локального prototype, состояния и скриншоты review.
- [desktop-prototype/README.md](desktop-prototype/README.md) — локальный Desktop prototype 1440 × 900, состояния D01–D06 и скриншоты review.
- [masters/desktop-master.md](masters/desktop-master.md) — утверждённая композиция Desktop Master 1440×900.
- [masters/desktop-master-preview.html](masters/desktop-master-preview.html) — локальный визуальный эскиз утверждённой композиции.
- [masters/mobile-master.md](masters/mobile-master.md) — принятая композиция Mobile Master v0.1 и критерии дальнейшей визуальной сверки.
- [masters/mobile-master-preview.md](masters/mobile-master-preview.md) — мобильная композиция с PNG-предпросмотром и ссылкой на SVG-исходник.
- [masters/mobile-profile-state.md](masters/mobile-profile-state.md) — отдельный черновик подробного профиля для следующего review.
- [qa/production-feature-parity.md](qa/production-feature-parity.md) — что уже умеет текущий `drewo/`, где это отражено в новом дизайне и что проверить до замены интерфейса.
- [integration/production-adapter-contract.md](integration/production-adapter-contract.md) — source-only контракт текущих данных, сессии, публикации, фотографий и серверных ролей для будущего адаптера.
- [qa/real-tree-validation.md](qa/real-tree-validation.md) — агрегатная проверка локального древа и крайние случаи для просмотра на 157 записях.
- [qa/visual-review-checklist.md](qa/visual-review-checklist.md) — порядок визуальной проверки Master, экранов, motion, Print и Video без опоры на устаревшие PNG.
- [qa/design-regression.md](qa/design-regression.md) — повторяемый локальный regression-проход, безопасный synthetic test-набор и границы evidence.
- [qa/real-tree-master-review.md](qa/real-tree-master-review.md) — проверенные улучшения полного дерева, responsive-кадры и открытые расхождения с Masters.
- [export/print-design-system.md](export/print-design-system.md) — отдельная спецификация печатного конструктора и экспорта.
- [export/print-prototype/README.md](export/print-prototype/README.md) — локальный Print Studio prototype: запуск, проверенные сценарии и ограничения.
- [export/video-design-system.md](export/video-design-system.md) — отдельная спецификация шаблонного видеоэкспорта; первый шаблон «История рода».
- Видео-шаблон «История рода» описан в [Video Design System](export/video-design-system.md). Remotion-кандидат подключён к локальному древу; production worker, облачная очередь и выпуск видео для телефона ещё не сделаны.
- [fixtures/master-tree.json](fixtures/master-tree.json) — synthetic-дерево из первых восьми записей общего demo-набора для Master review; базовый mobile-кадр показывает 7 записей, полный набор доступен через «Все поколения».
- [fixtures/prototype-people.mjs](fixtures/prototype-people.mjs) — общий synthetic-набор из 12 записей для desktop/mobile prototype; тест сверяет первые восемь с synthetic Master-деревом. HOTI-данные в этот fixture не добавлять.
- [`assets/references/`](assets/references/) — исходные коллажи desktop/mobile и отдельные кинематографичные фоны для экрана древа и профиля.

Работа над интерфейсом идёт после утверждения Bible и Master Reference. Прототипы печати и видео сначала создаются и проверяются локально; production меняется только после явного одобрения проверенного результата.

