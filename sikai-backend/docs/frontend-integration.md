# Angular integration

The Angular frontend in `../../sikai-frontend` is now connected to this backend. Its layout and styling are preserved; browser-only persistence has been replaced in the service layer. Run Spring Boot on port 8080 and Angular with `npm start` or `npm run start:api` on port 4200. Both Angular commands enable the existing `/api` development proxy.

## Service mappings

| Angular service | Backend integration |
| --- | --- |
| `ApiService` | Typed HttpClient requests, API base URL, bearer headers, normalized errors, multipart upload and authenticated file download |
| `AuthService` | Register/login/me/logout; token restoration; student/instructor/admin state |
| `LearnHubStore` | Paginated public catalog, personal wishlist/enrollment/progress, real course/lesson IDs, loading and mutation state |
| `InstructorContentService` | Shared course records, topic/lesson synchronization, uploads, on-demand preview |
| `AdminCourseService` | Admin catalog listing and authorized course mutations; same catalog as the learner portal |
| `LiveClassesService` | Public teacher/slot discovery, participant-only bookings, owner slots, booking mutations, messages and email results |

`provideAppInitializer` restores authentication before route decisions. Guards also await restoration. The API stores a session-scoped opaque token under `sikai.api-token`; old local account hashes are never sent to the backend. A 401 clears the current session token. Personal caches are cleared on account changes, and stale private responses are ignored. API mutations update the UI only after successful server responses.

## Course and media workflow

The course editor creates a backend draft, maps server IDs back into the editable hierarchy immediately, uploads binary files using `FormData`, removes explicitly deleted topics/lessons and applies publication status last. New course metadata and uploaded content share one server course ID. The editor includes price, level and publication controls. Files are fetched only for preview/player use rather than downloading every file when listing courses.

The player loads real curriculum IDs and retrieves media using an authenticated Blob request. Its object URLs are revoked when switching files/leaving the component. Learning dashboards use real lesson IDs and counts, not generated sample lessons. Course detail pages show curriculum only after enrollment, matching backend content authorization.

Saving is a sequence of requests, not one database transaction across files and metadata. If a request fails, previous requests may have saved draft changes. Retry Save: IDs are already retained so completed record creation is not duplicated. Concurrent editing of the same course in multiple windows has no version-conflict protection.

## Live state and privacy

Public slots contain no meeting URL. The service merges public discovery with the signed-in user's bookings and teacher-owned slots. Private booking slots supply meeting links. It polls every 15 seconds while the document is visible and refreshes after mutations. Meeting updates trigger confirmation resend attempts for confirmed bookings. Students and instructors can book another teacher; the backend prevents self-bookings and participant time conflicts.

## Testing

See the frontend README for the complete manual instructor/student workflow. `npm run test:integration` runs Playwright using Google Chrome with isolated servers on 4201/18081, an in-memory backend database and uploads under the backend target directory. Build the backend JAR with `mvn clean verify` first. These tests do not modify your development database.

Old localStorage/IndexedDB accounts, progress and uploads are not migrated automatically. The live application no longer reads them. Backend sample courses are not seeded, so create/publish a free course as an instructor to test enrollment. Paid enrollment is blocked pending a real payment integration. Optional SMTP failures do not undo bookings.

Production hosting must route `/api` to Spring Boot and serve `index.html` for Angular routes; the Angular development proxy is not part of the production bundle. See `API_BASE_URL` in the frontend API service if using a separate backend origin, and set backend `CORS_ORIGINS` accordingly.
