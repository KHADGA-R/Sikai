# REST API reference

[README](../README.md) | [Code guide](development.md) | [Example requests](../requests.http) | [Frontend testing](../../sikai-frontend/docs/testing.md)

Use this page as the frontend/backend contract. Start with [authentication](#authentication), then choose
[catalog](#catalog-and-administration), [content](#topics-lessons-and-uploads),
[learning state](#personal-learning-state) or [live classes](#live-classes).

Base URL: `http://localhost:8080/api`. JSON request bodies require `Content-Type: application/json`. Protected endpoints require `Authorization: Bearer <token>`. IDs for courses and lessons are JSON numbers; user, teacher, topic, slot, booking and message IDs are UUID strings. Timestamps are epoch **milliseconds**, except media duration and chapter positions, which are seconds. JSON uses camelCase to match the Angular models.

Successful mutations generally return `{"success":true}`; creates return the new resource or `{"id":...}` and HTTP 201. Collections are arrays. Errors return `{"status":400,"message":"...","timestamp":"..."}`. Security-filter errors contain `status` and `message`. Common statuses: 400 invalid input, 401 missing/expired/revoked token, 403 role/ownership denied, 404 missing/inaccessible resource, 409 duplicate/conflict/payment required, 413 upload too large. Never infer success from the response body without checking HTTP status.

## Authentication

| Method | Path | Access | Body / response |
| --- | --- | --- | --- |
| POST | `/auth/register` | Public | `{name,email,password,role}` → session, 201 |
| POST | `/auth/login` | Public | `{email,password}` → session |
| GET | `/auth/me` | Signed in | `{id,name,email,role}` |
| POST | `/auth/logout` | Signed in | Revokes the supplied token |

Registration roles are `student` or `instructor`. Name is 2–80 characters; email is normalized to lowercase. Password is at least 8 characters and at most 72 UTF-8 bytes (BCrypt limit). It is never returned.

Session response:

```json
{"token":"opaque-random-value","tokenType":"Bearer","expiresAt":1800000000000,"user":{"id":"uuid","name":"Sita","email":"sita@example.com","role":"student"}}
```

Tokens are not JWTs. Use `/auth/me` to restore a user. Logout revokes only the current token; other sessions retain their own expiration.

## Catalog and administration

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| GET | `/categories` | Public | Category `name`, `image`, `subcategories` from existing frontend |
| GET | `/courses` | Public | Published courses; filters `q`, `category`, `level`, `grade`, `isFree`; `page=0`, `size=20` (max 100) |
| GET | `/courses/{id}` | Public / owner | Published course; draft only visible to owner or admin |
| GET | `/instructor/courses` | Instructor/admin | Own courses including drafts |
| POST | `/instructor/courses` | Instructor/admin | Create from body below |
| PUT | `/instructor/courses/{id}` | Owner/admin | Replace editable catalog fields |
| DELETE | `/instructor/courses/{id}` | Owner/admin | Cascade-delete course hierarchy and learning state |
| GET | `/admin/courses` | Admin | All courses |
| GET | `/admin/users` | Admin | User ID/name/email/role; no hashes or tokens |
| GET | `/admin/stats` | Admin | User, course, enrollment and booking counts |

Course create/update body:

```json
{"title":"Nepali Conversation","description":"Build conversational confidence.","category":"Languages","subcategory":"Nepali","price":0,"level":"BEGINNER","durationHours":2,"emoji":"📚","accent":"teal","published":true,"grade":5}
```

`grade` and `subcategory` are optional. Grades are 1–12. Levels: `BEGINNER`, `INTERMEDIATE`, `ADVANCED`. Accents: `violet`, `teal`, `pink`, `blue`, `green`, `orange`. Price supports two decimal places. `instructor` is derived from the owner's account name, `isFree` from price, `lessons` from the actual lesson count, and `rating` starts at 0. Do not submit these computed fields. A response also includes `ownerId`. Setting `published:false` saves a draft; use the same update route to publish.

## Topics, lessons and uploads

| Method | Path | Access | Body |
| --- | --- | --- | --- |
| GET | `/courses/{id}/content` | Enrolled/owner/admin | Topics with nested lessons and decoded chapter arrays |
| POST | `/instructor/courses/{id}/topics` | Owner/admin | `{title,position}` |
| PUT | `/instructor/topics/{id}` | Owner/admin | `{title,position}` |
| DELETE | `/instructor/topics/{id}` | Owner/admin | Removes topic and lessons |
| POST | `/instructor/topics/{id}/lessons` | Owner/admin | Lesson body below |
| PUT | `/instructor/lessons/{id}` | Owner/admin | Lesson body below |
| DELETE | `/instructor/lessons/{id}` | Owner/admin | Removes lesson and progress |
| POST | `/instructor/lessons/{id}/file` | Owner/admin | Multipart field `file`, up to 100 MB |
| DELETE | `/instructor/lessons/{id}/file` | Owner/admin | Detach file; then kind may be changed |
| GET | `/lessons/{id}/file` | Enrolled/owner/admin | Binary attachment; authorization required |

```json
{"title":"Greetings","minutes":10,"kind":"video","duration":600,"chapters":[{"seconds":0,"title":"Welcome"},{"seconds":120,"title":"Practice"}],"position":0}
```

`position` controls ordering; ties sort by ID. Chapter times must be unique, nonnegative and less than duration. PDF chapters must be empty. Supported content types: video MP4/WebM, audio MPEG/WAV/OGG/MP4, PDF. Content responses expose `fileName` and `hasFile`, never storage paths. Upload the binary separately after creating the lesson metadata. No client filesystem path or owner ID is accepted.

## Personal learning state

All routes are restricted to the authenticated user's state.

| Method | Path | Result |
| --- | --- | --- |
| GET | `/me/wishlist` | Published wished course objects |
| PUT / DELETE | `/me/wishlist/{courseId}` | Add / remove idempotently |
| GET | `/me/enrollments` | Enrolled course objects |
| PUT | `/me/enrollments/{courseId}` | Enroll in a published free course; paid returns 409 |
| GET | `/me/progress` | Object mapping course ID strings to completed lesson ID arrays |
| PUT / DELETE | `/me/progress/{courseId}/lessons/{lessonId}` | Complete / uncomplete lesson |

Example progress: `{"1":[2,3],"4":[8]}`. Lessons must belong to the requested course. Enrollment and wishlist PUT requests do not toggle existing state.

## Live classes

| Method | Path | Access / body |
| --- | --- | --- |
| GET | `/live-classes/teachers` | Public; teacher profiles |
| GET | `/live-classes/slots` | Public; future, open, unbooked availability; no meeting URLs |
| PUT | `/live-classes/teacher` | Instructor/admin; `{subject,bio,languages,photoUrl?}` |
| GET | `/live-classes/teacher/slots` | Instructor/admin; own availability including meeting links |
| POST | `/live-classes/slots` | Instructor/admin; `{start,minutes,meetingUrl}` |
| DELETE | `/live-classes/slots/{id}` | Owner; closes slot; active booking must first be cancelled |
| PATCH | `/live-classes/slots/{id}/meeting` | Owner; `{meetingUrl}` |
| GET | `/live-classes/bookings` | Own student/teacher bookings with `messages` and nested `slot` including meeting URL |
| POST | `/live-classes/bookings` | Signed in; `{slotId,goals,timezone,replacing?}` |
| POST | `/live-classes/bookings/{id}/cancel` | Participant; upcoming confirmed booking only |
| GET | `/live-classes/bookings/{id}/messages` | Participant |
| POST | `/live-classes/bookings/{id}/messages` | Participant; `{text}` (1–500 characters), confirmed only |
| POST | `/live-classes/confirmation` | Participant; `{bookingId}`; response `{sent,message?}` |

Subject must be an existing category. Bio is up to 1,000 characters, languages 120. Optional `photoUrl` is a JPEG/PNG/WebP base64 data URI, max 300,000 characters. Slots start in the future within one year; duration is 30, 45, 60 or 90 minutes. Meeting link is empty or HTTPS with no embedded credentials.

Booking timezone is a valid IANA zone such as `Asia/Kathmandu`, `America/Los_Angeles` or `UTC`. Learning goals are up to 1,000 characters. For rescheduling, provide the old booking ID as `replacing`. The old booking is cancelled and new booking created in the same transaction, after all checks pass. Students cannot book themselves or double-book a slot; neither participant can overlap any confirmed class, including across student and teacher roles.

Booking creation returns `{"id":"uuid","status":"confirmed","email":{"sent":false,"message":"..."}}`. SMTP disabled or unavailable does not roll back booking. Public slots deliberately omit private meeting links. Booking/message/email authorization comes from stored participants, never a submitted user ID. The confirmation endpoint ignores arbitrary email or class-detail fields; it loads the real record and sends only to the saved student email.
# Discount coupons

Administrator endpoints (admin role required):

- `GET /api/admin/coupons`: list codes, terms and completed/reserved usage counts.
- `POST /api/admin/coupons`: create immutable terms with `code`, `discountType` (`percent` or
  `fixed`), `discountValue`, `minimumSubtotal`, `active`, `perUserLimit` (1–1000), optional
  `startsAt`/`expiresAt` (epoch milliseconds) and optional `maxRedemptions`.
- `PUT /api/admin/coupons/{id}/status` with `{ "active": false }`: disable or enable a code.

Authenticated checkout endpoints:

- `PUT /api/checkout/orders/{id}/coupon` with `{ "code": "LEARN10" }`: apply one code to an
  owned, unpaid order and return its updated payment quote. Codes are case insensitive.
- `DELETE /api/checkout/orders/{id}/coupon`: remove the code and return the updated quote.

Order/quote responses include `subtotal`, `discountAmount` and `couponCode`. Quote
`originalAmount` is the discounted USD amount; provider totals use that net amount. Discounts
cannot exceed the subtotal. Payment initiation and zero-total completion recheck eligibility
and serialize usage reservations. Pending payments prevent coupon changes. Provider-confirmed
failure releases reserved usage; settlement honors the reserved price after expiry/disable.
