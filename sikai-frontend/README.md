# Sikai frontend

Angular 20 learning application connected to the separate Spring Boot API in `../sikai-backend`. Accounts, courses, uploads, progress and live classes are saved on the server.

## Documentation

| Read this | To understand |
| --- | --- |
| [Quick start](#quick-start) | How to run both applications |
| [Architecture](docs/architecture.md) | Folder structure, services, signals, authentication, uploads and header layout |
| [Development guide](docs/development.md) | Where to change a feature, API conventions and function comments |
| [Testing and troubleshooting](docs/testing.md) | Manual two-account test, automated tests and common failures |
| [Backend API reference](../sikai-backend/docs/api.md) | Routes, request shapes, permissions and responses |

## Quick start

Requirements: Node.js 22.12+ or another Angular 20-compatible version, npm, Java 17+ and Maven 3.9+.

Open two terminals at the workspace root. Keep both applications running.

**Terminal 1: backend**

```powershell
cd sikai-backend
mvn spring-boot:run
```

Check `http://localhost:8080/actuator/health`; a healthy local server returns `{"status":"UP"}`.

**Terminal 2: frontend**

```powershell
cd sikai-frontend
npm install
npm start
```

Open **http://localhost:4200**. Both `npm start` and `npm run start:api` enable the development proxy from `/api` to port 8080. If PowerShell blocks npm's script, use `npm.cmd` instead of `npm`.

**If port 4200 is already used:**

```powershell
npm run start:api -- --port 4201
```

Open `http://localhost:4201`. The same API proxy works; no backend CORS change is needed when requests use this proxy. Automated browser tests also use port 4201, so stop that development server before testing or run development on 4202 instead.

Do not run the legacy `email:server` alongside Spring Boot. The Java backend owns the API and optional email delivery now.

## Create your first shared course

The backend starts with no courses or public demo accounts. Old browser-storage accounts and uploads are not migrated.

1. Register with **Teach** selected.
2. Open **My Courses**, create a course and enter its title, description, category and subcategory.
3. Keep the price at zero, add a topic and upload a PDF, supported audio file or MP4/WebM video.
4. Set the course to **Published**, then save.
5. In an incognito window, register with **Learn**, find the course, enroll and open the lesson.
6. Mark the lesson complete and refresh. Progress is restored from the backend.

See the [full manual test](docs/testing.md#manual-two-account-test) for live bookings and messaging. To access `/admin`, provision an administrator as explained in the [backend README](../sikai-backend/README.md#administrator-setup).

## Application routes

| Route | Screen | Access |
| --- | --- | --- |
| `/` | Catalog and category/grade discovery | Public |
| `/courses/:id` | Course detail | Published courses are public; drafts require ownership/admin |
| `/login`, `/register` | Server authentication | Public |
| `/wishlist`, `/my-learning` | Personal saved/enrolled courses | Signed in |
| `/learn/:id` | Real lesson player and completion | Signed in; protected content requires enrollment/ownership/admin |
| `/my-progress`, `/completed-courses`, `/my-achievements` | Learning dashboards | Signed in |
| `/live-classes` | Teachers, availability and personal bookings | Public discovery; mutations require login and appropriate role |
| `/instructor` | Instructor overview | Instructor/admin |
| `/instructor/courses` | Recorded-course editor and uploads | Instructor/admin |
| `/instructor/about` | Teacher profile | Instructor/admin |
| `/admin` | Shared catalog administration | Administrator |
| `/community` | Community placeholder | Public |

The backend independently enforces resource access. A visible route or button does not grant permission by itself.

## Build and test

Run from this folder:

```powershell
npm run build
npm run test:unit
```

For real browser workflows, build the backend JAR with `mvn verify` from the backend folder, then run:

```powershell
npm run test:integration
```

Playwright uses installed Google Chrome and starts isolated servers on ports **4201** and **18081** with an in-memory database. It does not modify your development database. See [test coverage and troubleshooting](docs/testing.md).

## Important behavior

- The API base URL defaults to `/api` in `src/app/core/api.service.ts`.
- The browser tab stores a bearer token in sessionStorage. Passwords are not saved by the frontend.
- Signing out or switching accounts clears private caches; late responses from an old account are ignored.
- The editor saves course metadata, hierarchy and files through separate requests. A failed save can leave partial draft changes; keep the draft and retry Save.
- Paid enrollment, password recovery and Google login are not implemented. No payment is collected.
- SMTP is optional. A confirmation-email failure does not cancel a successfully saved booking.

## Production hosting

Build output is under `dist/learnhub/browser`. Configure your web server to serve `index.html` for Angular routes and forward `/api` to Spring Boot. The development proxy is not included in the production bundle.

For a separate API origin, provide `API_BASE_URL` through Angular dependency injection and configure backend `CORS_ORIGINS` for the frontend origin. See the [development guide](docs/development.md#production-routing).
