# LearnHub — Angular Standalone Starter

A complete **frontend-only learning marketplace demo** built with Angular 20 standalone components, Angular signals, Angular Router, and local browser storage. No Spring Boot server or PostgreSQL is required to try it.

## Requirements

- Node.js **22.12+** (or a compatible Angular 20-supported Node version)
- npm
- Internet connection for the initial `npm install`

## Windows PowerShell — quick start

```powershell
# Extract the ZIP into your preferred folder first.
cd $HOMEngular-learning\learnhub-angular-starter
node --version
npm --version
npm install
npm start
```

Open **http://localhost:4200**. If PowerShell blocks `npm.ps1`, use `npm.cmd install` and `npm.cmd start`.

## Pages

| URL | Feature |
|---|---|
| `/` | Catalog, search, category/level/price filters |
| `/courses/1` | Course details, wishlist, demo enrollment |
| `/wishlist` | Saved courses (localStorage) |
| `/my-learning` | Enrolled courses (localStorage) |
| `/learn/1` | Lesson player and completion tracking (localStorage) |
| `/instructor` | Teaching overview and upcoming classes |
| `/instructor/courses` | Recorded course drafts and lesson workspace |
| `/instructor/about` | Shared teacher profile and picture |

## Demo limitations — read before using

- All sample courses are in `src/app/core/sample-data.ts`.
- Wishlist, enrollments and lesson progress are stored in **localStorage** (not secure or cross-device).
- Paid courses offer **demo enrollment only**. No payment is collected or verified.
- The instructor page is a UI demonstration, **not real authentication or ownership authorization**.
- The instructor's new courses are in memory and reset on refresh.
- This project is not a production-ready security or payment implementation.

## Connecting the Java 21 / Spring Boot backend later

The frontend has a development proxy in `proxy.conf.json` forwarding `/api` to `http://localhost:8080`. Start the Spring Boot backend separately, then run:

```powershell
npm.cmd run start:api
```

The current UI intentionally uses `LearnHubStore` sample data. To integrate with the backend, create a typed `HttpClient` service for `/api/v1/courses`, adapt backend DTO fields, replace local wishlist/enrollment/progress with authenticated API calls, and configure Spring Security session + CSRF handling. Do **not** treat the demo's localStorage enrollment as paid access.

## Project structure

```text
src/app/
  core/
    models.ts
    sample-data.ts
    store.service.ts
  features/
    catalog.component.ts
    course-card.component.ts
    course-detail.component.ts
    wishlist.component.ts
    my-learning.component.ts
    player.component.ts
    instructor.component.ts
  app.component.ts
  app.routes.ts
```

## Build

```powershell
npm.cmd run build
```

> The source archive is provided without `node_modules` or a lockfile. The first `npm install` resolves packages and creates `package-lock.json`. Commit that lockfile in your project for reproducible future installs. The project was authored as a starter and was not compiled in this environment because npm registry access was unavailable.

## Local login and registration

Open `/register` to create a demo account, or `/login` to sign in. Registration signs you in automatically. Use the header's Log out button to end your session. Accounts persist in this browser; sessions use sessionStorage and survive refreshes in the current tab.

Names, email addresses, and salted PBKDF2 password hashes are stored locally. Use a demo password. This is a frontend simulation: browser storage and route guards can be modified by the browser user and do not provide server-side security. No email verification or password recovery is implemented. Student and instructor roles control local teaching features.

Wishlist, enrollments, and progress are now stored separately for each registered account. Earlier anonymous demo data remains in its original storage keys and is not assigned to an account. Wishlist, My Learning, the lesson player, and Instructor pages require a local login. Catalog and course previews remain public. After logging in, you return to the requested page; repeat any wishlist or enrollment action there.

For production, replace the local account service with a backend authentication API and enforce authorization on the server. Course access and instructor permissions must be checked by that backend.

## Admin portal

Open http://localhost:4200/admin to add, edit, search, filter, and delete courses. Deletion requires confirmation. Admin records are seeded from sample courses and persist in the `learnhub.admin.courses.v1` localStorage key. The admin library is separate from the user portal, whose pages, navigation, and catalog are unchanged. Status labels apply only to admin records. No server authorization is provided in this local demo; do not deploy it as a secure admin system.

## Instructor content workspace

Log in as an instructor and open `/instructor/courses`. Create a course, add topic sections, and upload video, audio, or PDF lessons (100 MB maximum per file). Rename and reorder topics and lessons. For audio/video chapters, enter one timestamp and title per line, for example `00:00 Introduction` and `05:30 First example`. `HH:MM:SS` is also accepted. Duplicate timestamps and timestamps outside the media duration are rejected. Preview media and click chapter buttons to seek.

Click **Save course content** to persist course metadata and uploaded files in IndexedDB. Each local account sees its own courses. These drafts are separate from the public sample catalog and admin library. Files remain on this browser/device; clearing site data removes them. There is no instructor approval, secure backend ownership, shared publishing, or cloud upload in this demo.

Run content validation checks with `node scripts/test-instructor.mjs`.

## Sikai visual assets

Standalone AI-generated Nepal-themed images are stored in `src/assets/images/`. They illustrate heritage, music, dance, thangka painting, Nepali language learning, and online learning. These are decorative demo assets, not photographs of the instructors or recordings of the listed courses. The uploaded brand reference is retained separately for design reference.

## Course taxonomy

Six main categories and 36 subcategories are defined in `src/app/core/categories.ts` and shared by browsing, admin editing, and instructor course editing. Changing a category clears the previous subcategory selection. Older Development/Data Science courses map to Skills & Training / IT & Technology; Business maps to Skills & Training / Business & Entrepreneurship; Design maps to Arts & Crafts / Digital Arts. Saved admin records are reclassified on load without deleting them.

## Learner progress and achievements

Signed-in navigation includes `/my-progress`, `/completed-courses`, and `/my-achievements`. Progress counts valid completed lesson IDs from enrolled courses. A course is finished when all its demo lessons are marked complete. Achievements derive from enrollment, lesson, and course milestones, and update when lessons are marked complete or incomplete. Records remain account-specific browser data; badges are not accredited certificates.

## Live classes

Open `/live-classes` to search teachers by name, subject, or teaching language, choose a timezone, and browse available one-to-one slots. Log in to confirm, reschedule, cancel, download a calendar event, and exchange lesson messages. An unsuccessful reschedule leaves the original booking confirmed. Teacher and student schedule conflicts are rejected; writes use Web Locks on localhost/HTTPS to serialize booking changes across tabs.

In **Set availability**, save a teacher profile, publish future availability, and add or update an HTTPS meeting link. Instructor start-time inputs use the device timezone; displayed schedules use the selected timezone. Active bookings must be cancelled before their availability is withdrawn. Booking history is retained. The instructor course workspace also links directly to this view.

Try both sides by creating a teacher account, publishing a slot, logging out, and booking it with a second student account in the same browser. Local storage is shared across these accounts; authentication is still a frontend simulation. Sample teachers are clearly labeled and do not represent real scheduled lessons. There is no payment, video hosting, push delivery, cross-device synchronization, or secure server authorization. Optional booking email delivery requires the companion server described below. Meeting links open an external video service. Messages are browser-local, not real-time chat across devices.

Run booking checks with `node scripts/test-live-classes.mjs`.

### Booking confirmation emails

The optional local email companion sends confirmation emails through [Resend](https://resend.com/docs/api-reference/emails/send-email). Emails include the teacher, subject, start/end time in the student's selected timezone, duration, learning goals, booking reference, and HTTPS meeting link. If a link is pending, the confirmation explains this; teacher link updates send another email. Rescheduling sends the replacement class details. Failed email delivery leaves the booking saved and displays a delivery warning.

Configure a Resend API key and verified sender in the server terminal, then start the companion:

```powershell
$env:RESEND_API_KEY = 'your-api-key'
$env:EMAIL_FROM = 'Sikai <classes@your-verified-domain.com>'
npm.cmd run email:server
```

In a second terminal run `npm.cmd run start:api`, then open `http://localhost:4200`. The companion binds only to `127.0.0.1:8080` and accepts the configured `APP_ORIGIN` (default `http://localhost:4200`). Keep credentials on the server; never put them in Angular source. Provider acceptance is reported as sent; inbox delivery still depends on the provider and recipient mail server. Without this configuration bookings still work, but email delivery displays a warning. Existing bookings created before this feature do not contain a student email and will not receive link updates.

This companion is for the local demo only. It validates payloads, checks origin, limits requests, and uses provider idempotency keys, but trusts browser-provided booking data. Before exposing email delivery publicly, move bookings and authentication to the backend and derive recipients and class details from authorized server records. The demo does not send cancellation emails or conversation notifications.

Run email checks with `node scripts/test-email.mjs` (mock delivery; no real emails).


## Student and instructor roles

Choose **Student** or **Instructor (Teacher)** when registering. The choice persists with the local account and is restored on login. Students can browse teachers and manage their bookings. Instructors see **My Classes** (their student bookings), **Set availability**, and the **Dashboard**, **My Courses**, and **About me** navigation links. Instructor Live Classes opens on **My Classes** and hides **Find a teacher**. The instructor route and teaching services also check the role before allowing availability, meeting-link, teacher-profile, or course-content changes. Instructors can still use learner features.

Existing accounts with a live-class teacher profile are migrated to Instructor; other accounts become Student. Existing bookings, uploaded course data, and account IDs are retained. A legacy account with only uploaded course drafts (and no live-class teacher profile) defaults to Student. Roles remain a browser-local demo feature; production access must be enforced by authenticated backend endpoints.

Run role checks with `node scripts/test-auth-roles.mjs` and availability access checks with `node scripts/test-live-classes.mjs`.


### Teacher profile

Instructor navigation contains **Dashboard**, **My Courses**, **Live Classes**, and **About me**. The shared profile lives at `/instructor/about`. Live Classes contains **My Classes** and **Set availability**, with **My Classes** as its default view. Create a profile with a subject, introduction, teaching languages, and optional picture. Saved profiles show **Edit profile**; editing offers **Update profile** and **Cancel**. Saving updates the same profile and preserves existing availability and bookings.

Pictures accept JPG, PNG, or WebP files up to 2 MB, are cropped to a square and resized to 320 pixels, and are saved with the profile in browser storage. Saved pictures also appear in student teacher listings. Remove picture clears it on the next profile save; Cancel restores the saved picture and text. Pictures are local to this browser, just like other demo profile data.


## Instructor navigation and dashboard

Instructors see **Dashboard**, **My Courses**, **Live Classes**, and **About me** in the main navigation. Signing in or registering without a requested return URL opens `/instructor` for instructors; students keep their existing learning navigation and landing page. All `/instructor` pages require an instructor account.

The dashboard displays account-specific saved course and lesson counts, recent course saves with direct edit links, and confirmed upcoming or in-progress teaching sessions. Cancelled classes, finished sessions, and other teachers' classes are excluded. Schedules use the device timezone. Course loading failures show an error and retry rather than misleading zero counts. These are local course drafts, not published courses or enrollment analytics.

**My Courses** preserves the course editor at `/instructor/courses`, including its unsaved-change confirmation. **Live Classes** retains class conversations, calendar downloads, meeting links, cancellations, and availability management. **About me** reuses the existing teacher profile and picture at `/instructor/about`; existing `/live-classes?view=profile` links redirect there. No existing course files, profiles, or bookings are moved or deleted.

Run dashboard checks with `node scripts/test-instructor-dashboard.mjs`.
