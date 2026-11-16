# Testing and troubleshooting

[README](../README.md) | [Architecture](architecture.md) | [Backend setup](../../sikai-backend/README.md)

## Commands

Run from `sikai-frontend`:

| Command | Purpose | Needs backend running? |
| --- | --- | --- |
| `npm run build` | Compile the production frontend and templates | No |
| `npm run test:unit` | Test chapter/file validation, grades and progress calculations | No |
| `npm test` | Run all Playwright browser tests | Starts isolated test servers |
| `npm run test:integration` | Same complete browser suite | Starts isolated test servers |
| `npx playwright test e2e/header-layout.spec.ts` | Check scrolling header containment across tabs and widths | Starts isolated test servers |

Build the backend JAR once from `sikai-backend` using `mvn verify` before browser testing. Rebuild it whenever Java code changes: Playwright launches the JAR, not Maven's live source runner.

The browser configuration uses installed **Google Chrome**. If Chrome is unavailable, install it or deliberately change Playwright's configured channel and install the matching browser.

## Browser-test isolation

| Resource | Test value |
| --- | --- |
| Angular URL | `http://127.0.0.1:4201` |
| Spring Boot port | `18081` |
| Database | In-memory H2, separate from development accounts |
| Upload directory | `sikai-backend/target/e2e-uploads` |
| Proxy configuration | `proxy.e2e.json` |
| Failure artifacts | `test-results/` |

Ports **4201 and 18081 must be free**. If you use 4201 for daily development, stop that process before browser testing or move development to another port, such as 4202. The suite does not reuse an existing server or modify your normal database.

## What the tests cover

`e2e/integration.spec.ts` exercises the connected application:

- Instructor registration, course creation, PDF upload, publishing and reopening saved content.
- Student registration, wishlist, enrollment, authenticated file access and completion restored after refresh.
- Progress dashboards, route authorization and logout.
- Teacher profile and availability, student booking, private meeting link, cross-account messages and cancellation.
- Administrator login, create/edit/delete and changes visible in the public catalog.
- Revoked-token restoration and a different account's empty private learning state.

`e2e/header-layout.spec.ts` checks all seven student navigation tabs at 1440px, 900px and 390px widths. It verifies that the sticky header contains its navigation, stays opaque and publishes the correct measured height. It also checks the desktop availability-panel offset.

Older scripts that instantiate the previous browser-storage services are historical checks. The `test:unit` command selects the compatible pure helpers; use Playwright for connected service and screen behavior.

## Manual two-account test

1. Start Spring Boot and Angular. Open the frontend in a normal window.
2. Register with **Teach**, create a free course, add a topic, upload a lesson and set **Published** before saving.
3. Open an incognito window and register with **Learn**. Find that course, save it to the wishlist and enroll.
4. Open the lesson, mark it complete, refresh and verify progress remains saved.
5. In the instructor window, save **About me**, then publish a future live-class slot.
6. In the student window, find the teacher, book the slot and send a message.
7. Check the instructor's booking view. Live state refreshes every 15 seconds while the page is visible; reloading also fetches it immediately.
8. Cancel or reschedule as the student and verify the updated booking state in both windows.

Use a free course for this test. Paid enrollment is intentionally blocked until payment verification is implemented.

## Troubleshooting

| Symptom | Check or action |
| --- | --- |
| Port 4200 is already used | Run `npm run start:api -- --port 4201` and open that port; reserve 4201 for automated tests when needed |
| Connection error or `/api` returns 502/504 | Confirm Spring Boot is running and the proxy target matches its port |
| API health fails | Open `http://localhost:8080/actuator/health` directly and inspect the backend terminal |
| Catalog is empty | Create and publish a backend course; sample browser/demo courses are not imported |
| Old login no longer works | Browser-only demo accounts are separate; register a backend account or use one already created through the API |
| Login returns 401 | Verify credentials or log in again after session expiry/revocation |
| Admin route redirects away | Provision an administrator using backend environment variables; public registration cannot create one |
| Enrollment returns 409 | Check publication status and price; paid access requires a future payment integration |
| File download returns 403 | Enroll or use the course owner/admin account; a public course listing does not grant file access |
| File upload fails | Check the supported MIME type, nonempty file and 100 MB limit; inspect the form's server error |
| A course save failed partway through | Keep the draft and retry Save; some earlier requests may already be saved |
| Booking confirmation email is unavailable | Booking can still be confirmed; SMTP is optional and disabled by default |
| Header overlap reappears after a style change | Check theme overrides for fixed header heights and verify `--site-header-height` updates |
| Browser tests cannot start | Free ports 4201/18081, verify the backend JAR exists and check Chrome availability |

Use browser Developer Tools' **Network** tab to inspect URL, HTTP status and the safe backend error message. Avoid sharing Authorization headers or session tokens in screenshots or logs.
