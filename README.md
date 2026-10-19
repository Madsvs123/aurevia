# Aurevia

Investment portfolio and wealth management platform for individual investors, advisors, and portfolio managers. It covers holdings, transactions, performance analytics, goals, watchlists, research notes, and advisor-client organizations.

## Stack

Django and Django REST Framework, Celery, and Django Channels. React 18, TypeScript, and Vite on the frontend. PostgreSQL and Redis.

## Layout

- `backend/` — Django API
- `frontend/` — React client

## Local setup

Backend:

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
```

```bash
pip install -r requirements.txt
```

```bash
python manage.py migrate
python manage.py runserver
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Use PostgreSQL and Redis when the project expects them. Copy `.env.example` to `.env` where an example file is present, and keep real secrets out of git.

## License

Released under the [MIT License](LICENSE).
