# Мафия организатОр (MVP)

Веб-приложение для проведения игровых вечеров «Мафия»: учёт игроков, ведение партий по стадиям, расчёт оплат и экспорт отчётов.

## Что умеет проект

- Авторизация по профилю и коду.
- Управление вечерами:
  - типы: `Обычный` и `Турнир`;
  - для турнира стоимость всегда `0 ₽`;
  - список `3 прошедших + 3 ближайших`, архив с поиском.
- База игроков:
  - поиск по имени и нику;
  - формат отображения в поиске: `Имя-Ник`;
  - быстрое создание игрока прямо из экрана вечера.
- Игры и столы:
  - создание игр по номеру;
  - запуск сессий по выбранным столам.
- Бланк партии:
  - стадии: подготовка, голосование, переголосование, поднятие, стрельба, завещание, пост-редактирование;
  - автоподсчёт голосов для последнего номинированного;
  - фолы, авто-исключение на 4-м фоле и штраф `-0.7`;
  - завершение игры словом `завершить`;
  - после завершения роли/итоги доступны для редактирования.
- Таймер в бланке: пресеты 30с / 60с / 90с, предупреждение и визуальная вспышка.
- Экспорт:
  - PDF бланка игры;
  - PDF сводки вечера.
- Админ-раздел:
  - журнал действий;
  - настройки тарифа по умолчанию;
  - управление через Django Admin.

## Технологии

- Frontend: React + TypeScript + Vite + React Router
- Backend: Django + Django REST Framework
- DB: SQLite
- Infra: Docker Compose + Nginx + Gunicorn

## Архитектура

- `frontend` собирается в статические файлы и отдаётся через `nginx`.
- `nginx` проксирует:
  - `/api/*` -> Django (`web:8000`)
  - `/admin/*` -> Django (`web:8000`)
- `web` запускает миграции, collectstatic и Gunicorn.
- SQLite хранится на хосте через bind mount:
  - внутри контейнера: `/data/db.sqlite3`
  - на хосте: `backend/data/db.sqlite3`

## Структура проекта

- `frontend/` — React-приложение
- `backend/` — Django-проект и API
- `nginx/` — конфиг и Dockerfile для Nginx
- `docker-compose.yml` — запуск сервисов

## Быстрый старт (Dev, без Docker)

### 1) Backend

```bash
cd backend
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py seed_demo
python manage.py runserver 0.0.0.0:8000
```

### 2) Frontend (в отдельном терминале)

```bash
cd frontend
npm install
npm run dev
```

По умолчанию фронт доступен на `http://localhost:5173`, API проксируется в `http://127.0.0.1:8000`.

## Запуск в Docker (условно Prod)

```bash
docker compose up -d --build
```

Приложение будет доступно на:

- `http://localhost:8080`

После первого запуска добавьте демо-данные:

```bash
docker compose exec -T web python manage.py seed_demo
```

Остановка:

```bash
docker compose down
```

## Демо-пользователи

После `seed_demo`:

- Админ: `admin` / код `admin`
- Судья: `judge` / код `1111`

## Полезные команды

- Логи:

```bash
docker compose logs -f web nginx
```

- Применить миграции:

```bash
docker compose exec -T web python manage.py migrate
```

- Запустить тесты:

```bash
cd backend
. .venv/bin/activate
python manage.py test mafia -v 2
```

## Важно

- Локальная SQLite для Docker: `backend/data/db.sqlite3`.
- Локальная SQLite для запуска без Docker может использовать `backend/db.sqlite3` (в зависимости от `DATABASE_PATH`).
- Для PDF используется WeasyPrint, в Docker нужные системные зависимости уже ставятся в `backend/Dockerfile`.
