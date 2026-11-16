# Sikai backend

Standalone Java 17 / Spring Boot REST API for the Sikai Angular learning application. Run this folder independently; the frontend connects through its `/api` proxy.

## Documentation

| Read this | To understand |
| --- | --- |
| [Quick start](#quick-start) | Local startup, persistence and executable JAR |
| [API reference](docs/api.md) | Endpoints, request bodies, permissions, responses and errors |
| [Architecture](docs/architecture.md) | Class responsibilities, relationships, transactions and operational limits |
| [Development guide](docs/development.md) | Request flow, code conventions, schema changes and method documentation |
| [Frontend integration](docs/frontend-integration.md) | Angular service mappings, session restoration and media handling |
| [Example HTTP requests](requests.http) | Editable registration, course and booking examples |

## Quick start

Requirements: **JDK 17+** and **Maven 3.9+**. Open a terminal at the workspace root:

```powershell
cd sikai-backend
mvn spring-boot:run
```

| Address | Purpose |
| --- | --- |
| `http://localhost:8080/api` | API base URL; use a documented endpoint below it |
| `http://localhost:8080/actuator/health` | Basic health check; healthy response is `{"status":"UP"}` |
| `http://localhost:4200` | Default Angular address when the separate frontend is running |

Maven downloads dependencies on its first run. Flyway creates the schema automatically. The initial database has no sample accounts or courses. Register an instructor and publish a free course to test the connected learner workflow.

### Local data

| Path | Contents |
| --- | --- |
| `data/` | Default persistent H2 database |
| `uploads/` | Uploaded lesson binaries |
| `target/` | Generated build output, JAR and isolated test artifacts |
| `src/main/resources/db/migration/` | Editable source migrations |

Start from the same working directory to reuse relative database/upload paths. Old frontend localStorage/IndexedDB accounts and files are not automatically imported. Edit source files under `src/`, not their copies under `target/classes/`.

### Build an executable JAR

```powershell
mvn verify
java -jar target/sikai-backend-1.0.0.jar
```

Run either Maven's application runner or the JAR on a given port, not both simultaneously. To use another backend port:

```powershell
$env:PORT = '8081'
mvn spring-boot:run
```

Update the frontend proxy target to that port. A frontend-only port change does not require changing the backend port.

If Maven cannot write its global dependency cache, use a local cache:

```powershell
mvn "-Dmaven.repo.local=./.m2" verify
mvn "-Dmaven.repo.local=./.m2" spring-boot:run
```

## Implemented features

- Student/instructor registration, BCrypt passwords and expiring, revocable bearer sessions.
- Published course discovery with filters, drafts, grades, category validation and ownership checks.
- Topic/lesson management, chapter timestamps, uploads and protected file access.
- Per-user wishlist, free enrollment and real lesson completion.
- Teacher profiles, availability, atomic booking/rescheduling, cancellation and participant messages.
- Optional SMTP booking confirmations.
- Administrator course/user views and platform counts.
- Flyway migrations, local H2, PostgreSQL configuration, Docker Compose and integration tests.

## Administrator setup

Public registration allows only `student` and `instructor`. Set the following before startup to create the first administrator:

```powershell
$env:ADMIN_EMAIL = 'admin@example.com'
$env:ADMIN_PASSWORD = 'ChooseYourOwnStrongPassword!'
mvn spring-boot:run
```

Log in through Angular or `POST /api/auth/login`. Remove these variables after the first successful startup if they are no longer needed. Bootstrap creates an account only if the email is absent. It does not reset existing passwords or promote an existing student/instructor account. No default password is supplied.

## Configuration

Set environment variables in the terminal before starting the application.

| Variable | Default / meaning |
| --- | --- |
| `PORT` | `8080` |
| `DB_URL` | File-backed H2; PostgreSQL example: `jdbc:postgresql://localhost:5432/sikai` |
| `DB_USERNAME`, `DB_PASSWORD` | Local H2: `sa` / empty; use your own PostgreSQL credentials |
| `CORS_ORIGINS` | `http://localhost:4200,http://127.0.0.1:4200`; comma-separated exact origins |
| `TOKEN_HOURS` | `24`; allowed range is 1 through 720 |
| `UPLOAD_DIRECTORY` | `./uploads` |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Optional first-run administrator credentials |
| `EMAIL_ENABLED` | `false`; enable after configuring SMTP |
| `EMAIL_FROM` | `no-reply@sikai.local`; replace with a verified sender |
| `SMTP_HOST`, `SMTP_PORT` | `localhost`, `587` |
| `SMTP_USERNAME`, `SMTP_PASSWORD` | SMTP credentials |
| `SMTP_AUTH`, `SMTP_STARTTLS` | `true`, `true` |

Spring Boot does not automatically read `.env` files in this project. Export variables in your shell. Docker Compose reads `.env` for its own substitutions.

### PostgreSQL

Create the database/user before starting the application:

```powershell
$env:DB_URL = 'jdbc:postgresql://localhost:5432/sikai'
$env:DB_USERNAME = 'sikai'
$env:DB_PASSWORD = 'YourDatabasePassword'
mvn spring-boot:run
```

Flyway applies migrations on startup. Changing `DB_URL` does not migrate existing H2 records into PostgreSQL.

### Docker Compose

With Docker Desktop running, execute from this folder:

```powershell
$env:DB_PASSWORD = 'YourDatabasePassword'
docker compose up --build -d
docker compose logs -f backend
```

Compose runs PostgreSQL internally and exposes the backend on 8080. Named volumes retain database and uploaded files. `docker compose down` stops services and keeps those volumes.

## Frontend connection and testing

Run Angular from its own folder with `npm start` or `npm run start:api`. Its proxy forwards `/api` to this backend. See the [frontend README](../sikai-frontend/README.md) and [manual integration test](../sikai-frontend/docs/testing.md#manual-two-account-test).

```powershell
mvn verify
```

Backend tests use isolated in-memory H2 and files under `target/test-uploads`. They check authentication, ownership, protected media, learning state, live-class privacy, replacement/cancellation and competing booking requests. They do not validate real SMTP credentials or a live PostgreSQL deployment. See [test details](docs/development.md#build-and-test).

## Troubleshooting

| Symptom | Check or action |
| --- | --- |
| Port 8080 is used | Stop the other instance or set `PORT`; update the frontend proxy if the backend port changes |
| Maven cannot write its cache | Use the workspace-local `-Dmaven.repo.local` option above |
| Health/startup fails with database errors | Verify `DB_URL`, credentials, database availability and the terminal's Flyway error |
| Database appears empty after restarting | Confirm the working directory and configured database URL are unchanged |
| Login is rejected | Use an account created through this backend, not the old browser-only demo |
| Admin bootstrap fails | Supply both valid admin variables and choose an email not already assigned a non-admin role |
| Paid enrollment returns 409 | Payment verification is not implemented; use a free course for testing |
| Booking returns 409 | Check future time, availability, self-booking and both participants' conflicting classes |
| Email result says `sent:false` | Booking may still be saved; check `EMAIL_ENABLED` and SMTP configuration |
| Protected file returns 403/404 | Check course access, the attached file metadata and configured upload directory |

## Current limits

Paid courses can be listed, but paid enrollment is blocked until a verified payment integration exists. No money is charged. Password recovery, email verification, Google sign-in, reviews and certificates are not implemented. Messaging uses REST polling.

Files are stored on local disk and served through authenticated downloads. MIME checking is an allowlist, not virus scanning. Replaced/detached/deleted binaries remain on disk for future cleanup. The connected frontend already fetches files as authenticated Blobs.

Before public deployment, assess HTTPS, rate limits, backups, monitoring, dependency support and deployment-specific database/media storage. The code pins Spring Boot 3.5.16 as its tested Java 17 baseline; consult your support/update policy before production use.
