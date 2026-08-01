# Админка waydean.ru/admin

Вход только через **Supabase Authentication** (email + пароль пользователя из дашборда).

**PWA:** откройте `https://waydean.ru/admin/` в Chrome/Safari → «Установить приложение» / «На экран Домой».  
Иконка админки своя (иконка приложения «Коран и Азкары»), отдельно от PWA `/drewo/`.

**Полная пошаговая инструкция:** [SUPABASE-SETUP.md](./SUPABASE-SETUP.md)

Кратко: проект Supabase → SQL → **создать пользователя** → `supabase-config.js` → импорт дуа → Edge Function → кнопка «Опубликовать».
