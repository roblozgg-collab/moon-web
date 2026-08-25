# Moon — публикация через GitHub Pages

## 1. Создай репозиторий
Создай репозиторий, например `moon-web`.

> Если у тебя GitHub Free, GitHub Pages для обычного аккаунта работает с публичным репозиторием. Для Pages из приватного репозитория нужен тариф GitHub, который поддерживает private Pages (например Pro). Сам опубликованный Pages-сайт всё равно будет публичным.

## 2. Загрузи проект
В папке Moon:

```bash
git init
git add .
git commit -m "Moon GitHub Pages"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/moon-web.git
git push -u origin main
```

`.env.local` находится в `.gitignore` и в GitHub не попадёт.

## 3. Supabase уже подключён
В `.env.production` уже записаны твои **Project URL** и **publishable key**. Это public/browser key — он всё равно попадает в клиентский JavaScript и рассчитан на работу вместе с RLS.

Не добавляй в репозиторий `service_role`, `sb_secret_...`, пароль базы или другие серверные секреты.

## 4. Включи GitHub Pages
Repository → Settings → Pages → Build and deployment → Source → `GitHub Actions`.

После push открой вкладку Actions и дождись workflow `Deploy Moon to GitHub Pages`.

## 5. Адрес сайта
Для репозитория `moon-web`:

`https://YOUR_USERNAME.github.io/moon-web/`

Если репозиторий называется ровно `YOUR_USERNAME.github.io`, сайт будет:

`https://YOUR_USERNAME.github.io/`

Workflow сам определяет нужный base path.

## 6. Supabase Auth URL
После первого успешного деплоя открой Supabase → Authentication → URL Configuration.

Site URL поставь на GitHub Pages URL, например:

`https://YOUR_USERNAME.github.io/moon-web/`

Redirect URLs добавь:

- `http://localhost:3000/**`
- `https://YOUR_USERNAME.github.io/moon-web/**`

## 7. База
Если ещё не выполнял схему: Supabase → SQL Editor → вставь `supabase/schema.sql` → Run.

## 8. Обновления Moon
После любых изменений:

```bash
git add .
git commit -m "Moon update"
git push
```

GitHub Actions автоматически соберёт `out/` и обновит Pages.

## Важно
GitHub Pages — статический хостинг. Node/Next API routes там не запускаются. Поэтому постоянная логика Moon идёт через Supabase; звонки идут через WebRTC, а Supabase Realtime используется для состояния/signaling.

Приглашения в этой Pages-сборке используют рабочий URL вида `https://...github.io/moon-web/?invite=CODE`, потому что GitHub Pages не предоставляет серверный rewrite для произвольного `/invite/CODE`. Позже с собственным доменом можно сделать красивую `moon.dev/CODE` через отдельный edge/proxy слой.


## 9. Прямые ссылки Moon v0.12.1

Moon теперь синхронизирует состояние интерфейса с URL, например:

- `/friends`
- `/plus`
- `/im/<chatId>`
- `/server/<serverId>/<channelId>`
- `/settings/account`
- `/settings/appearance`

Для GitHub Pages команда `npm run build:pages` после сборки автоматически создаёт `out/404.html` из главной страницы. Благодаря этому прямой переход или F5 на вложенном Moon URL возвращает SPA, а приложение восстанавливает нужный экран по адресу.

Перед первым деплоем v0.12.1 на уже существующий Supabase-проект один раз выполни `supabase/MIGRATE_V0.12.1.sql` через SQL Editor.
