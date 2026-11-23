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

Maven downloads dependencies on its first run. Flyway creates the schema automatically.

### Sample courses

With the local API running, import 20 published sample courses across all eight catalog categories from the workspace root:

```powershell
$instructor = Get-Credential -UserName 'catalog-tester@example.test' -Message 'Enter a password for the sample instructor'
.\sikai-backend\seed-sample-courses.ps1 -Credential $instructor -RegisterInstructor
```

Use `-RegisterInstructor` only when creating a new instructor account. For an existing instructor, supply their credentials and omit the switch. The importer skips matching course titles owned by that instructor. The fixtures include free and paid courses, all three difficulty levels, and several grade levels for catalog, enrollment, and checkout testing.

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

- Account-specific notification inbox, unread counts, read controls, course activity and live-class updates.
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

## Live classrooms

Instructors can publish availability with one student seat for a private lesson or up to 50 student seats for a group. Existing slots retain one seat. A confirmed student can use **Join live class** in **My bookings** as soon as an external meeting link is saved, until the scheduled end. BigBlueButton rooms open five minutes before the start. The instructor can start the room from **My Classes** or **Set availability**.

To use BigBlueButton, set these values in the backend terminal before starting Spring Boot. Example for Windows Command Prompt:

```cmd
set "BBB_API_URL=https://bbb.example.com/bigbluebutton/api/"
set "BBB_API_SECRET=your-server-shared-secret"
mvn spring-boot:run
```

Use an API-enabled BigBlueButton server and its shared secret. Keep the secret on the backend. Leave the meeting link blank when publishing a slot to use BigBlueButton. An explicit HTTPS meeting link continues to work for existing slots or external meetings. BigBlueButton opens in the browser with the instructor as moderator and the confirmed students as viewers. Sikai uses one meeting ID per slot and disables recording when it creates the room.

To try the flow locally, start the Angular app and backend, publish a two-seat slot starting within five minutes, and book it from two student accounts in separate browser sessions. Both students should enter the instructor's room, and a third student should see that the class is full. An HTTPS meeting link can exercise the external booking and join flow. A running BigBlueButton server is required to test its own classroom media and teaching tools.

### Sikai class whiteboard

Choose **Open whiteboard** from a confirmed booking to share a board with the instructor and other booked students. The instructor can add blank slides and upload PNG, JPEG or WebP slide images up to 2 MB. To use PowerPoint or PDF slides, export the desired pages as images first. Participants can draw, highlight, place typed text, and add lines, rectangles, ellipses, circles, or arrows. Choose a solid, dashed, or dotted outline for any shape, or a fine, medium, or bold pen tip for freehand writing. Marks are saved per slide and attributed by author. Use **Show marks** to display one person's annotations. Drag **Eraser** over the parts of your marks you want to remove, or use **Undo my mark** to remove your latest mark on that slide.

With **Eraser** selected, scroll up over the board to increase its size or down to decrease it.

Choose **Yellow** or **Pink** from **Sticky note** to add a note to the selected slide. Type directly in it, drag its top edge to move it, or drag the bottom-right handle to resize it. Notes are shared with the class. Each participant can edit or delete their own notes.

When a saved external meeting link is available, **Start live class** or **Join live class** opens the video separately and loads the whiteboard in the original Sikai tab. To use a separate desktop window, right-click **Open video call** on the whiteboard and choose **Open link in new window**. The instructor and confirmed students can revisit their class board after the scheduled end.

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
| `EMAIL_ENABLED` | `false`; enable booking confirmations and reminders after configuring SMTP |
| `EMAIL_FROM` | `no-reply@sikai.local`; replace with a verified sender |
| `SMTP_HOST`, `SMTP_PORT` | `localhost`, `587` |
| `SMTP_USERNAME`, `SMTP_PASSWORD` | SMTP credentials |
| `SMTP_AUTH`, `SMTP_STARTTLS` | `true`, `true` |

Spring Boot does not automatically read `.env` files in this project. Export variables in your shell. Docker Compose reads `.env` for its own substitutions.

With SMTP enabled, the backend checks confirmed live-class bookings every 30 seconds and emails the student at the 24-hour and 15-minute marks. Bookings made after a reminder window opens are eligible for that window's reminder. Failed delivery is retried while the window remains open. The student countdown appears in **Live Classes → My bookings**.

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
| Paid enrollment returns 409 | Use checkout with a configured wallet; the direct enrollment endpoint accepts only free courses |
| Booking returns 409 | Check future time, availability, self-booking and both participants' conflicting classes |
| Email result says `sent:false` | Booking may still be saved; check `EMAIL_ENABLED` and SMTP configuration |
| Protected file returns 403/404 | Check course access, the attached file metadata and configured upload directory |

## Current limits

### In-app notifications

Flyway V7 adds `app_notification`. Restart the backend to apply it. Notifications are generated by successful new activity; existing enrollment/progress is not backfilled.

| Endpoint | Behavior |
| --- | --- |
| `GET /api/me/notifications?page=0&size=20` | Current account's newest notifications, unread count, total and `hasMore`; size is 1–50 |
| `PUT /api/me/notifications/{id}/read` | Mark an owned notification read; another account's ID returns 404 |
| `POST /api/me/notifications/read-all` | Mark only the current account's notifications read |

Students receive enrollment confirmation, published course metadata/curriculum/media changes, availability changes, and first course completion. Course owners receive new-student enrollment and first student-completion notices. Enrollment events commit with free enrollment or verified checkout fulfillment; failed/pending payments do not notify or grant access. Retries and marking a completed lesson incomplete/complete again do not duplicate enrollment/completion notices.

Published course edits coalesce into one unread update per course and student. A later change after the notice is read creates a new notice; no-op metadata saves and edits to never-published drafts do not notify learners. Class participants receive booking/rescheduling confirmations, cancellation notices for the other participant, meeting-detail changes and new-message alerts. Unread messages coalesce per booking and recipient; message content, goals and private meeting URLs are omitted from notification bodies.

The header inbox polls every 30 seconds while the app is visible and refreshes on focus/open. Enrollment/completion actions also refresh the learner's badge. These are saved in-app notifications, not browser push, email alerts or scheduled reminders.

### Checkout API

Checkout requires a bearer token. The frontend creates an order, then completes it:

| Endpoint | Behavior |
| --- | --- |
| `GET /api/checkout/courses/{courseId}` | NPR checkout quote, original USD price, enrollment state, wallet availability and active payment ID; falls back to USD with payments disabled when no exchange rate is configured |
| `POST /api/checkout/orders` | Body: `{"courseIds":[123,456]}` for 1–20 courses, or legacy `{"courseId":123}`. Duplicate IDs are normalized. Reuses the buyer's matching course selection; unpaid orders without an active payment refresh to catalog prices |
| `GET /api/checkout/orders/{id}` | Returns only the purchaser's order, including amount, currency, status and timestamps |
| `GET /api/checkout/orders/{id}/quote` | Purchaser-only aggregate quote, provider totals, active payment and course-item snapshots |
| `GET /api/checkout/pending` | Purchaser-only orders with an unresolved payment, for resuming checkout |
| `POST /api/checkout/orders/{id}/complete` | Atomically completes a free order and enrollment; repeat requests return the completed receipt |
| `POST /api/checkout/orders/{id}/payments` | Body: `{"provider":"esewa","expectedAmount":1000,"expectedCurrency":"NPR"}` (or `khalti`). PayPal uses `{"provider":"paypal","expectedAmount":10,"expectedCurrency":"USD"}`. Reserves an immutable attempt, initiates it once, and returns the saved provider checkout/approval URL |
| `GET /api/checkout/payments/{id}` | Purchaser-only payment state and resumable redirect |
| `POST /api/checkout/payments/{id}/resume` | Verifies provider status before reopening the saved checkout URL. Returns completed/failed state instead of redirecting when appropriate |
| `POST /api/checkout/payments/{id}/verify` | Optional body: `{"data":"base64 eSewa response"}`. Performs provider lookup; only confirmed payment of the exact NPR total grants enrollment |

Flyway V2/V3 add persistent orders and payment attempts; V4 extends currency/provider checks for PayPal while retaining existing records. Restart the backend to apply migrations. Browser prices, callback statuses and caller-supplied transaction IDs never grant access. eSewa callbacks have HMAC verification when supplied, followed by server-side status lookup; Khalti always uses its stored `pidx` for lookup. PayPal retrieves its stored order and captures approved payments server-side. Exact amounts, currencies and transaction references are checked. Completion and enrollment commit together; repeated verification is idempotent. Courses with payment records must be unpublished rather than deleted.

### Cart and combined checkout

Students add courses to their account-specific server cart with `PUT /api/me/cart/{courseId}`, remove them with `DELETE /api/me/cart/{courseId}`, and list them with `GET /api/me/cart`. Adding the same course is idempotent. Enrolled/unpublished courses are omitted, and new additions clean stale entries. Carts hold up to 20 courses.

Create one checkout order from the chosen IDs. The backend locks and validates each course, snapshots its title/price into an order item, and adds the prices in USD. NPR conversion is applied once to the aggregate total. Orders containing only free courses complete without payment; mixed orders fulfill all items only after the full paid total is verified. Enrollment in every course, cart-item removal, and order completion commit atomically. Retries do not create duplicate enrollment. An active payment freezes its selection/total and blocks another checkout containing the same courses; the cart provides a resume link. Other courses added during payment remain in the cart.

Flyway V5/V6 add cart/order items, backfill existing single-course receipts, and replace single-course uniqueness with a canonical basket key. New provider returns use `/checkout/orders/{orderId}/payment/{attemptId}`; old single-course return routes remain supported. Price/publication changes before payment require returning to the cart for review. PayPal remains disabled by default.

### Configure eSewa and Khalti

For local eSewa testing, run `./start-sandbox.ps1` from this folder after stopping the existing backend. The `sandbox` profile uses eSewa's public UAT credentials and a fixed test conversion of 100 NPR/USD. Normal startup keeps paid wallets disabled unless configured. To also enable Khalti sandbox, set `KHALTI_SECRET_KEY` in the same terminal using the key from `https://test-admin.khalti.com/` before running the script. Never use the `sandbox` profile for production. Existing local accounts/courses are retained; sandbox orders and enrollments use the same local database.

Configure environment variables in the backend terminal before starting Maven. Secrets belong on the backend, never in Angular or Git. Spring does not automatically load `.env` files.

| Variable | Value / default |
| --- | --- |
| `PAYMENT_FRONTEND_URL` | `http://localhost:4200`; set to the frontend's full origin in deployment |
| `USD_NPR_RATE` | Merchant-selected NPR per USD conversion rate; default `0` disables new paid payments. No live exchange-rate feed is used |
| `ESEWA_PRODUCT_CODE` | Your eSewa merchant product code; sandbox uses the provider's test merchant code |
| `ESEWA_SECRET_KEY` | Your eSewa signing secret |
| `ESEWA_FORM_URL` | Sandbox: `https://rc-epay.esewa.com.np/api/epay/main/v2/form` |
| `ESEWA_STATUS_URL` | Sandbox: `https://rc.esewa.com.np/api/epay/transaction/status/` (verified reachable; the older `uat` hostname no longer resolves) |
| `KHALTI_SECRET_KEY` | Merchant secret from Khalti's test dashboard for sandbox, live dashboard for production |
| `KHALTI_API_URL` | Sandbox default: `https://dev.khalti.com/api/v2/` |

The catalog remains priced in USD. Checkout shows the NPR equivalent, rounded to two decimals; payment initiation checks the learner-reviewed total and freezes that NPR amount. Khalti sends amounts in paisa and requires at least NPR 10; eSewa sends rupees. Configure either provider or both. Unconfigured wallets appear unavailable.

For production, use merchant-approved live credentials with `ESEWA_FORM_URL=https://epay.esewa.com.np/api/epay/main/v2/form`, `ESEWA_STATUS_URL=https://epay.esewa.com.np/api/epay/transaction/status/`, and `KHALTI_API_URL=https://khalti.com/api/v2/`. Use an HTTPS frontend URL and confirm wallet return URLs with your merchant accounts. Sandbox settings must remain separate from production.

The learner returns to `/checkout/orders/{orderId}/payment/{attemptId}` for verification; older single-course return routes remain supported. Refreshing checkout also recovers an active attempt. eSewa's signed form is posted once by the backend, and its checkout URL is persisted. Continue payment checks status and reopens that URL rather than submitting the same UUID again. eSewa `NOT_FOUND` is its documented expired/terminated state; after validating the returned product code, UUID and amount, the attempt is failed and a new payment can use a new UUID. Pending/ambiguous responses, provider errors and mismatches do not permit another attempt. Legacy POST-only sessions cannot be reopened; use the original provider tab or check status after expiry. Uncertain Khalti initiation remains reserved and requires merchant reconciliation using its attempt ID / purchase order ID before another charge. There is no automatic background reconciliation or refund/access-revocation workflow yet.

Provider integration references: [eSewa ePay v2](https://developer.esewa.com.np/pages/Epay), [Khalti Web Checkout](https://docs.khalti.com/khalti-epayment/). Automated tests use local fake provider servers; actual sandbox merchant transactions still require your credentials.

### Configure PayPal sandbox

PayPal is currently shown as **Available soon** and disabled by default, including when credentials exist. When ready to activate testing, explicitly set `$env:PAYPAL_ENABLED = 'true'` before starting the backend. Leave it unset for the disabled placeholder.

On Windows, run `./configure-paypal-sandbox.ps1` to enter the sandbox Client ID and Secret locally. The helper validates them against PayPal's sandbox OAuth endpoint, then saves a Windows-encrypted credential file (`paypal-sandbox.local.xml`, ignored by Git). `./start-sandbox.ps1` loads this file when the complete environment-variable pair is absent. The encrypted secret can be decrypted only by the same Windows user on the same machine; normal non-sandbox startup does not load it. Restart the backend after configuration. Do not send the secret through chat.

1. In the [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/), open **Apps & Credentials**, choose **Sandbox**, and create an app associated with a sandbox business account.
2. Copy its client ID and client secret to the backend terminal's environment. Keep both on the backend; do not commit them or add them to Angular.
3. Restart the sandbox backend:

```powershell
$env:PAYPAL_CLIENT_ID = 'YOUR_SANDBOX_CLIENT_ID'
$env:PAYPAL_CLIENT_SECRET = 'YOUR_SANDBOX_CLIENT_SECRET'
./start-sandbox.ps1
```

`PAYPAL_API_URL` defaults to `https://api-m.sandbox.paypal.com`; the sandbox profile pins that address. PayPal charges the catalog's original USD amount and needs no `USD_NPR_RATE`. Selecting another provider changes the displayed amount/currency and requires the learner to review the total again. Without credentials, PayPal appears unavailable.

Use a separate **personal sandbox account** as the test buyer, not the business account receiving the payment. See [PayPal sandbox accounts](https://developer.paypal.com/sandbox-testing/accounts) and [credential setup](https://developer.paypal.com/api/get-started/). Real PayPal sandbox approval/capture requires your own app credentials; automated tests use a local fake PayPal API.

The server creates an Orders v2 `CAPTURE` order with a stable `PayPal-Request-Id`, redirects to the provider's approval URL, then retrieves and captures the stored order on return. `APPROVED` alone never grants access: both the order and its exact-amount USD capture must be `COMPLETED`. Capture retries use the same idempotency key, and uncertain order creation can be recovered using its original key. Callback query tokens are never used as order references. Fulfillment happens on return or explicit status check; no background PayPal webhook/refund workflow is implemented. For production, use an approved live app and `PAYPAL_API_URL=https://api-m.paypal.com` with the sandbox profile disabled.

Paid courses use eSewa, Khalti or PayPal after configuration; free courses need no payment provider. Password recovery, email verification, Google sign-in, reviews and certificates are not implemented. Messaging uses REST polling.

Files are stored on local disk and served through authenticated downloads. MIME checking is an allowlist, not virus scanning. Replaced/detached/deleted binaries remain on disk for future cleanup. The connected frontend already fetches files as authenticated Blobs.

Before public deployment, assess HTTPS, rate limits, backups, monitoring, dependency support and deployment-specific database/media storage. The code pins Spring Boot 3.5.16 as its tested Java 17 baseline; consult your support/update policy before production use.
