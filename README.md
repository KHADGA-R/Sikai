# Sikai

Learning platform with an Angular frontend and a separately runnable Java/Spring Boot backend.

| Folder | Application | Documentation |
| --- | --- | --- |
| [`sikai-frontend/`](sikai-frontend/) | Angular interface, instructor workspace and browser tests | [Frontend setup](sikai-frontend/README.md) |
| [`sikai-backend/`](sikai-backend/) | REST API, authentication, persistence and lesson uploads | [Backend setup](sikai-backend/README.md) |

## Run locally

Requirements: Java 17+, Maven 3.9+, Node.js compatible with Angular 20 and npm.

In one terminal:

```powershell
cd sikai-backend
mvn spring-boot:run
```

In another terminal, starting at the repository root:

```powershell
cd sikai-frontend
npm install
npm start
```

Open `http://localhost:4200`. The frontend proxies `/api` to the backend on port 8080.
If 4200 is occupied, run `npm run start:api -- --port 4201` from the frontend folder.

The initial backend database is empty. Register an instructor, create a free course, add a lesson
and publish it. Use a second student account to test enrollment and saved progress.

## Verify changes

Run `mvn verify` inside `sikai-backend`, then `npm run build` and `npm run test:unit` inside
`sikai-frontend`. For full browser workflows, run `npm run test:integration` from the frontend
after building the backend JAR. The test suite needs Chrome and free ports 4201/18081; it uses
an isolated in-memory database.

See [frontend testing](sikai-frontend/docs/testing.md), [backend architecture](sikai-backend/docs/architecture.md)
and the [API reference](sikai-backend/docs/api.md) for details.

Local databases, uploaded files, environment files, dependencies and build output are excluded
from Git. Configure your own environment variables when running a new checkout.
