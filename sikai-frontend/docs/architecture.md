# Frontend architecture

[README](../README.md) | [Development guide](development.md) | [Testing and troubleshooting](testing.md) | [Backend API](../../sikai-backend/docs/api.md)

## How a screen gets its data

```mermaid
flowchart LR
  View[Component template] --> State[Signals and computed values]
  State --> Service[Feature service or LearnHubStore]
  Service --> API[ApiService / HttpClient]
  API --> Proxy[/api development proxy]
  Proxy --> Server[Spring Boot on port 8080]
  Server --> DB[(Database and uploaded files)]
```

Components collect input and display signals. Services send requests and update caches only after the server accepts a change. The server owns accounts, authorization, course IDs, enrollment, progress and bookings. A frontend route guard improves navigation, but does not replace backend authorization.

## Read the code in this order

1. [`src/main.ts`](../src/main.ts): bootstrapping, router, HttpClient and session initialization.
2. [`app.routes.ts`](../src/app/app.routes.ts): screen routes and access guards.
3. [`api.service.ts`](../src/app/core/api.service.ts): API base URL, bearer headers, error handling and binary downloads.
4. [`auth.service.ts`](../src/app/core/auth.service.ts): server identity and session restoration.
5. [`store.service.ts`](../src/app/core/store.service.ts): catalog and personal learning state.
6. A feature component and its service: follow one screen from button click to server response.

## Folder map

| Location | Purpose |
| --- | --- |
| `src/app/core/` | Shared state, API/auth services, domain interfaces and validation helpers |
| `src/app/features/` | Catalog, authentication, player, learning, instructor and live-class screens |
| `src/app/admin/` | Administrator screen and authorized catalog operations |
| `src/app/shared/` | Reusable logo/icons and the responsive header measurement directive |
| `src/styles.css` | Base layout and shared component styles |
| `src/theme.css` | Theme overrides; loaded after the base styles |
| `e2e/` | Browser tests for connected workflows and responsive scrolling |
| `scripts/` | Pure validation tests plus historical local-demo checks |

The project uses standalone Angular components. There is no `app.module.ts` or separate `app.config.ts`; application providers are registered in `src/main.ts`.

## Services and responsibilities

| Service | What it owns | Important behavior |
| --- | --- | --- |
| `ApiService` | HTTP requests and session token | Adds bearer headers only to its configured API; normalizes failures; clears the current token on 401 |
| `AuthService` | Public current-user identity | Restores `/auth/me` before route decisions; registers, logs in and logs out through Spring Boot |
| `LearnHubStore` | Catalog, wishlist, enrollment, progress and curriculum caches | Uses real server IDs; tracks pending actions; clears private caches on account changes |
| `InstructorContentService` | Editor-to-API mapping | Saves a draft, synchronizes topic/lesson records and files, then applies publication status |
| `LiveClassesService` | Teacher discovery and participant live state | Combines public slots with private bookings/owned slots; polls every 15 seconds while the page is visible |
| `AdminCourseService` | Admin catalog view | Uses the same course records as the learner portal; refreshes both views after mutations |

`api-models.ts` describes server curriculum responses. `models.ts` contains the common course/lesson interfaces. `normalizeCourse()` maps SQL null values to the optional values used by form controls. `courseInput()` omits server-controlled fields when submitting a course.

## Authentication lifecycle

```mermaid
sequenceDiagram
  participant Browser
  participant Auth as AuthService
  participant API as Spring Boot
  Browser->>Auth: Start application
  Auth->>API: GET /api/auth/me with stored token, if present
  API-->>Auth: User or 401
  Auth-->>Browser: Finish initialization; guards can decide
  Browser->>API: Protected request with bearer token
  API-->>Browser: Authorized result or error
```

The tab stores only `sikai.api-token` in sessionStorage. Passwords are not saved by the frontend. A token is an opaque server secret, not a JWT to decode. Logout attempts server revocation and always clears local identity. If a late request fails after another login, it cannot clear the newer login's token.

`authGuard` requires a signed-in user. `instructorGuard` accepts instructors and administrators. `adminGuard` accepts only administrators. Return URLs are validated by `safeReturnUrl()` before navigation.

## Signals, requests and stale results

A `signal` stores mutable state, such as the selected lesson or course list. A `computed` derives a value from other signals, such as wishlist course IDs or progress percentage. An `effect` reacts to identity, route or selection changes and handles associated loading/cleanup.

The learning store uses account-generation counters. When identity changes, it clears personal data and advances the generation. A response from the old generation is ignored. Catalog refreshes have a separate counter so an older request cannot overwrite a newer catalog.

Live state uses a revision and identity check for the same reason. Player and course-detail effects ignore stale view feedback. File effects revoke object URLs when a lesson changes or the view is destroyed.

These safeguards matter when someone logs out during a request, changes accounts, quickly selects multiple lessons or retries a slow refresh.

## Instructor save workflow

1. Validate draft metadata and chapter timestamps.
2. Create or update the server course with `published: false`.
3. Create/update ordered topics and lessons, copying generated IDs back into the draft immediately.
4. Upload new files with multipart `FormData`.
5. Delete topic/lesson records explicitly removed from the editor.
6. Apply the requested publication status and refresh the public catalog.

This is a sequence of requests. It is not one transaction covering every metadata change and file upload. A failed save may leave partial draft changes on the server. Keep the draft and retry Save; retained IDs prevent duplicate creation. Concurrent editing of the same course in multiple windows has no version-conflict detection.

Media files are loaded on demand for instructor preview and the enrolled player. The browser fetches a Blob with an Authorization header, then creates a temporary object URL. Direct HTML media elements cannot attach the application's bearer header themselves.

## Shared header and scrolling

The signed-in header has a brand/account row and a navigation row. Its height must remain automatic so both rows stay inside its opaque sticky background.

[`HeaderLayoutDirective`](../src/app/shared/header-layout.directive.ts) measures the complete header using `ResizeObserver` and writes `--site-header-height` on the document root. Sticky purchase/availability panels use that variable plus spacing. Avoid restoring a fixed height in later theme rules; that can make the second row overlap scrolling content.

## Legacy demo files

`sample-data.ts`, demo seed helpers and some old scripts remain as fixtures/history. The connected catalog/player do not use generated sample course or lesson records. Old localStorage accounts, enrollments and IndexedDB uploads are left untouched, but are not imported into the backend.
