# Roster Manager

A full-stack web application for managing monthly employee shift rosters. Supports multiple teams, shift assignment, bulk imports, dark mode, and mobile-responsive layouts.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Backend | Node.js, Express, TypeScript |
| Database | SQLite (via `better-sqlite3`) |
| Auth | JWT + bcrypt |

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

### Install dependencies

```bash
npm run install:all
```

This installs packages for both `backend/` and `frontend/`.

### Run in development

```bash
npm run dev
```

Starts both servers concurrently:

| Service | URL |
|---|---|
| Backend API | http://localhost:3001 |
| Frontend | http://localhost:5173 |

### Default credentials

| Field | Value |
|---|---|
| Username | `admin` |
| Password | `admin123` |

> Change the admin password after first login via Admin Panel → Users.

---

## Project Structure

```
roster_dashboard/
├── backend/
│   └── src/
│       ├── server.ts          # Express app entry point
│       ├── db/database.ts     # SQLite schema + migrations
│       ├── middleware/auth.ts # JWT authentication middleware
│       └── routes/
│           ├── auth.ts        # POST /api/auth/login
│           ├── employees.ts   # CRUD + bulk-edit
│           ├── teams.ts       # CRUD
│           ├── users.ts       # CRUD + bulk-import
│           └── roster.ts      # Grid data, copy, bulk-import
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
├── roster.db                   # SQLite database (git-ignored)
└── package.json                # Root scripts (dev, install:all)
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

All endpoints are prefixed with `/api`.

| Method | Path | Description |
|---|---|---|
| POST | `/auth/login` | Obtain JWT |
| GET | `/employees` | List all employees (with team name) |
| POST | `/employees` | Create employee |
| PUT | `/employees/:id` | Update employee |
| PUT | `/employees/bulk-edit` | Bulk update job title or team |
| DELETE | `/employees/:id` | Delete employee |
| GET | `/teams` | List teams |
| POST | `/teams` | Create team |
| GET | `/roster/team/:teamId` | Monthly roster for a team |
| GET | `/roster/stats` | Shift totals per team (dashboard) |
| POST | `/roster` | Create single entry |
| PUT | `/roster/:id` | Update single entry |
| DELETE | `/roster/:id` | Delete single entry |
| DELETE | `/roster/employee/:id` | Remove employee from a month |
| POST | `/roster/bulk` | Assign shift to multiple dates |
| POST | `/roster/copy` | Copy month roster |
| POST | `/roster/bulk-import` | CSV mass import |
| GET | `/users` | List user accounts |
| POST | `/users` | Create user account |
| PUT | `/users/:id` | Update user account |
| DELETE | `/users/:id` | Delete user account |

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
`role` must be `admin` or `member`. `team_name` must match an existing team exactly.

### Roster (grid format)

```
name, emp_code, team_name, month, 1, 2, 3, ... 31
```
One row per employee. Columns `1`–`31` hold shift codes for each day of the month. `month` format: `YYYY-MM`. Empty cells are skipped.

---

## Production Build

```bash
# Build backend
cd backend && npm run build

# Build frontend
cd frontend && npm run build
# Static files output to frontend/dist/

# Run backend
cd backend && npm start
```

Serve `frontend/dist/` with any static file server (nginx, Caddy, etc.) and proxy `/api/*` to the backend.
