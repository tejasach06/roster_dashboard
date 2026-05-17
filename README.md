# Roster Manager

A full-stack web application for managing monthly employee shift rosters. Supports multiple teams, shift assignment, bulk imports, dark mode, and mobile-responsive layouts.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite 6, Tailwind CSS |
| Backend | Node.js, Express, TypeScript |
| Database | SQLite (via `better-sqlite3`) |
| Auth | JWT + bcryptjs |
| Security | Helmet, express-rate-limit, CORS restriction |
| Process manager | PM2 |

---

## Features

- **Dashboard** — monthly shift-code coverage overview per team with bar charts
- **Team Roster** — interactive grid (employees × days); click any cell to assign or change a shift
- **Edit Mode** — roster is read-only by default; toggle edit mode to make changes
- **Crosshair highlighting** — hover any cell to highlight its row and column
- **Shift codes** — MS · GS · AS · NS · WO · EL with colour-coded badges
- **Filters** — search by name/code, filter by shift, pick a custom date range
- **Copy roster** — copy a previous month's roster into the current month, or plan the next month
- **Per-employee totals** — shift count summary table below the grid
- **Admin Panel** — manage employees, teams, and user accounts; bulk-edit job title or team assignment
- **Settings** — bulk CSV import for employees, users, and roster entries
- **Dark mode** — system-aware with manual toggle
- **Mobile responsive** — hamburger sidebar drawer, scrollable filter bar, touch-friendly popovers

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- PM2 (for production): `npm install -g pm2`

### Install dependencies

```bash
npm run install:all
```

This installs packages for both `backend/` and `frontend/`.

### Configure environment

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` and set at minimum:

```env
# Generate with: openssl rand -hex 32
JWT_SECRET=your-secret-here

# Origin of your frontend (no trailing slash)
CORS_ORIGIN=http://localhost:5173
```

`JWT_SECRET` is **required** in production and will throw on startup if missing.
It must be unique and at least 32 characters.

If a production database has no admin user yet, bootstrap one on first startup:

```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD=replace-with-a-strong-one-time-password
ADMIN_NAME=Admin
```

Remove those bootstrap variables after the first successful startup. The app refuses to start in production if the seeded `admin/admin123` development credential still exists.

### Run in development

```bash
npm run dev
```

Starts both servers concurrently (hot-reload on both):

| Service | URL |
|---|---|
| Backend API | http://localhost:3001 |
| Frontend | http://localhost:5173 |

### Default credentials

| Field | Value |
|---|---|
| Username | `admin` |
| Password | `admin123` |

> Development only. Production startup refuses the default `admin/admin123` credential. Passwords must be at least 8 characters for normal user changes and at least 12 characters for production bootstrap.

---

## Production Deployment

### 1. Configure environment

```bash
cp backend/.env.example backend/.env
# Set JWT_SECRET (openssl rand -hex 32) and CORS_ORIGIN
```

### 2. Build

```bash
npm run build
```

Compiles the backend TypeScript to `backend/dist/` and bundles the frontend to `frontend/dist/`.

### 3. Start with PM2

```bash
npm start
```

### PM2 commands

| Command | Description |
|---|---|
| `npm start` | Start backend under PM2 |
| `npm run stop` | Stop the process |
| `npm run restart` | Restart (after a redeploy) |
| `npm run logs` | Tail live logs |
| `npm run status` | Process health, uptime, memory |

### 4. Survive server reboots (run once)

```bash
pm2 startup   # generates and prints a systemd command — run that output
pm2 save      # saves current process list
```

### 5. Serve the frontend

Serve `frontend/dist/` with nginx, Caddy, or any static file server and proxy `/api/*` to `http://localhost:3001`.

Example nginx snippet:

```nginx
location /api/ {
    proxy_pass http://localhost:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}

location / {
    root /path/to/frontend/dist;
    try_files $uri $uri/ /index.html;
}
```

---

## Project Structure

```
roster_dashboard/
├── backend/
│   ├── src/
│   │   ├── server.ts           # Express app entry point
│   │   ├── db/database.ts      # SQLite schema + migrations
│   │   ├── middleware/auth.ts  # JWT authentication middleware
│   │   └── routes/
│   │       ├── auth.ts         # POST /api/auth/login
│   │       ├── employees.ts    # CRUD + bulk-edit
│   │       ├── teams.ts        # CRUD
│   │       ├── users.ts        # CRUD + bulk-import
│   │       └── roster.ts       # Grid data, copy, bulk-import
│   └── .env.example            # Environment variable template
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── Dashboard.tsx   # Monthly overview
│       │   ├── TeamRoster.tsx  # Shift grid
│       │   ├── AdminPanel.tsx  # Employee / team / user management
│       │   └── Settings.tsx    # CSV bulk import
│       ├── components/
│       │   ├── Layout.tsx      # Sidebar + mobile nav
│       │   └── Modal.tsx
│       ├── contexts/
│       │   ├── AuthContext.tsx
│       │   └── ThemeContext.tsx
│       └── constants/shifts.ts # Shift code definitions
├── ecosystem.config.js         # PM2 process config
├── logs/                       # PM2 log output (git-ignored)
├── roster.db                   # SQLite database (git-ignored)
└── package.json                # Root scripts
```

---

## Shift Codes

| Code | Label | Hours |
|---|---|---|
| MS | Morning Shift | 06:00 – 14:00 |
| GS | General Shift | 09:00 – 18:00 |
| AS | Afternoon Shift | 14:00 – 22:00 |
| NS | Night Shift | 22:00 – 06:00 |
| WO | Week Off | — |
| EL | Earned Leave | — |

---

## API Overview

All endpoints are prefixed with `/api`. All routes except `POST /auth/login` require a `Authorization: Bearer <token>` header.

Rate limits: login is capped at **10 requests / 15 min** per IP; all other API routes at **200 requests / min** per IP.

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/login` | — | Obtain JWT |
| GET | `/employees` | user | List all employees (with team name) |
| POST | `/employees` | admin | Create employee |
| PUT | `/employees/:id` | admin | Update employee |
| PUT | `/employees/bulk-edit` | admin | Bulk update job title or team |
| DELETE | `/employees/:id` | admin | Delete employee |
| GET | `/teams` | user | List teams |
| POST | `/teams` | admin | Create team |
| PUT | `/teams/:id` | admin | Update team |
| DELETE | `/teams/:id` | admin | Delete team |
| GET | `/roster/team/:teamId` | user | Monthly roster for a team |
| GET | `/roster/stats` | user | Shift totals per team (dashboard) |
| POST | `/roster` | user | Create single entry |
| PUT | `/roster/:id` | user | Update single entry |
| DELETE | `/roster/:id` | user | Delete single entry |
| DELETE | `/roster/employee/:id` | user | Remove employee from a month |
| POST | `/roster/bulk` | user | Assign shift to multiple dates |
| POST | `/roster/copy` | user | Copy month roster |
| POST | `/roster/bulk-import` | admin | CSV mass import |
| GET | `/users` | admin | List user accounts |
| POST | `/users` | admin | Create user account |
| PUT | `/users/:id` | admin | Update user account |
| DELETE | `/users/:id` | admin | Delete user account |
| POST | `/users/bulk-import` | admin | CSV bulk import users |

---

## CSV Import Formats

All imports are available under **Settings** in the app. Download the template from the UI before importing.

### Employees

```
name, emp_code, job_title, email, phone
```

### Users

```
name, username, password, role, team_name
```

`role` must be `admin` or `member`. `team_name` must match an existing team exactly. Passwords must be at least 8 characters.

### Roster (grid format)

```
name, emp_code, team_name, month, 1, 2, 3, ... 31
```

One row per employee. Columns `1`–`31` hold shift codes for each day of the month. `month` format: `YYYY-MM`. Empty cells are skipped.
