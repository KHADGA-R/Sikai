# Frontend development guide

[README](../README.md) | [Architecture](architecture.md) | [Testing](testing.md)

## Find the right place to change

| Change | Start here |
| --- | --- |
| Login, registration or session handling | `core/auth.service.ts`, `features/auth.component.ts` |
| API origin, request headers or HTTP errors | `core/api.service.ts` |
| Catalog data, wishlist, enrollment or progress | `core/store.service.ts` |
| Search/category/grade filtering | `features/catalog.component.ts`, `core/categories.ts`, `core/grades.ts` |
| Instructor hierarchy and upload behavior | `core/instructor-content.service.ts`, `features/instructor.component.ts` |
| Player and protected files | `features/player.component.ts` |
| Teacher profiles, slots and messages | `core/live-classes.service.ts`, `features/live-classes.component.ts` |
| Admin course operations | `admin/admin-course.service.ts`, `admin/admin.component.ts` |
| Navigation and role access | `app.routes.ts`, `core/auth.guard.ts`, `app.component.ts` |
| Header overlap or sticky panel offsets | `shared/header-layout.directive.ts`, `styles.css`, `theme.css` |

Some components contain inline templates in their TypeScript file. Larger instructor/live screens have separate HTML and CSS files. Check the component decorator before looking for a template file.

## Add a backend-backed action

1. Confirm the route, request shape, permissions and error behavior in the [backend API reference](../../sikai-backend/docs/api.md).
2. Define or reuse a typed response interface in `core/api-models.ts` or the relevant domain file.
3. Add the request to the feature service, not directly to the template.
4. Await success before updating signals. Keep loading and pending states separate from displayed data.
5. Handle errors through an existing banner or form error signal. Keep useful unsaved input after a failure.
6. If a request can outlive an account/selection change, ignore stale results or clean them up.
7. Add a browser test when the change affects authorization, persistence or a complete user workflow.

Example service request:

```typescript
const courses = await this.api.request<ApiCourse[]>('GET', '/courses?page=0&size=20');
```

`ApiService` already handles the configured base URL, bearer header and normalized exceptions. Do not build another token-storage or password-hashing system inside a component.

## Units and IDs

| Value | Representation |
| --- | --- |
| Course and lesson IDs | Server-assigned numbers |
| User, topic, teacher, slot, booking and message IDs | Server-assigned UUID strings |
| New unsaved editor IDs | Temporary UUIDs, replaced during save |
| Slot/message/session timestamps | Epoch milliseconds |
| Media duration and chapter positions | Seconds |
| Slot duration input | Minutes |
| Course duration | Hours |
| School grade | Integer 1 through 12, or omitted |

Do not generate placeholder lesson IDs in learning views. Progress must reference the actual backend lesson and owning course.

## Uploads and previews

Use `FormData` with field name `file`. Let the browser choose the multipart `Content-Type` boundary. Upload after the backend has assigned a lesson ID.

For protected media, use `api.file(lessonId)` and a Blob object URL. Revoke the URL on replacement or destruction. Keep media metadata requests separate from binary downloads so listing a course does not download every lesson.

Chapter validation belongs in the shared helpers and is repeated by the backend. PDFs do not have timestamp chapters. The frontend's checks improve feedback; backend checks remain authoritative.

## Comment conventions

Named functions, methods, getters and explicit constructors have JSDoc comments describing their purpose. Important local helpers are documented too. Comments explain units, permission boundaries, side effects and cleanup where those details affect use.

Keep comments accurate when changing behavior. Explain why a generation/revision check, cleanup or save order exists instead of repeating each line of code. Use `@param` or `@returns` when a non-obvious contract needs more detail. Generated Angular files under `dist/` and `.angular/` are build output; edit `src/` instead.

## Production routing

`API_BASE_URL` defaults to `/api`. Development uses `proxy.conf.json`; production hosting must explicitly forward `/api` to Spring Boot. Serve Angular's `index.html` for application routes so deep links work after refresh.

When using a separate backend origin, provide the absolute API base URL and add the frontend origin to backend `CORS_ORIGINS`. Keep bearer credentials restricted to the configured API.
