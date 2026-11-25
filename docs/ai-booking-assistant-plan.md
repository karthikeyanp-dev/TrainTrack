# AI booking assistant: implementation plan

**Status:** draft, awaiting review. Written 2026-11-25 and restricted to pending bookings the same day. No code has been written for this feature yet.

The code facts below were checked against `origin/master` at `afad49d`, and line numbers refer to that commit.

## Goal

Add a page where the user pastes a plain-text booking message (source, destination, journey date, class, train preference, passengers). Gemini reads the details, and the user then adds a booking, updates the changed details of an existing booking, or deletes one. When mandatory details are missing, the app warns the user to include them.

The assistant only works on **pending** bookings. Completed bookings are processed, and the assistant never changes them.

## What the codebase looks like today

Facts the plan depends on.

### Deployment and limits

- **No server.** `next.config.mjs` uses `output: "export"` and the site is deployed from `out/` to Firebase Hosting (`.github/workflows/cloudrun-deploy.yml`, on push to `master`; despite its name it only deploys hosting). There are no API routes, server actions or Cloud Functions, and `firebase.json` rewrites every path to `index.html`.
- **Spark plan, fixed.** `CLAUDE.md` records that the project is on the Firebase Spark (free) plan and cannot be upgraded, with a limit of 50,000 document reads per day. Cloud Functions need the Blaze plan, so a server-side AI call is not available.
- **Second deployment.** `.github/workflows/deploy-gh-pages.yml` publishes the `dev` branch to GitHub Pages as a test environment.

### Data layer

Follow the "Data Fetching Pattern" rules in `CLAUDE.md`. `AGENTS.md` has not been updated for the sync layer yet.

- **Reads go through shared stores.** Whole collections are never read with ad-hoc `getDocs()` or `onSnapshot()` calls. `useBookings()` (`src/hooks/useBookings.ts`) reads from `bookingsStore` (`src/lib/dataStores.ts`). The collection is cached on the device and only changed bookings are fetched afterwards, so calling the hook from another page costs no extra reads. `usePendingBookings()` is derived from it.
- **Tombstone deletes.** Deleting a booking goes through `deleteSyncedDoc()` (`src/lib/sync/tombstones.ts`), which also writes a tombstone so other devices drop the booking from their cache. The stores filter tombstones out. Code that reads these collections raw must skip documents with `deleted === true`.
- **Every write sets `updatedAt`.** A write to `bookings` without `updatedAt: serverTimestamp()` never reaches other devices.
- **Payloads.** Firestore rejects `undefined`. `stripUndefined()` in `src/lib/cancellations.ts` removes `undefined`, `null` and empty-string keys.
- **No server-side protection.** `firestore.rules` allow every read and write. Rules like "pending bookings only" are enforced by the app code.

### Booking writes

All three live in `src/lib/firestoreClient.ts` and return `{ success, error?, booking? }` without throwing.

- `addBooking` (line 195) always sets status `Requested`, so every booking it creates is pending. It also stamps `createdAt` and `updatedAt`.
- `updateBookingById` (line 227) takes a full `BookingFormData` and runs in a transaction. It returns an error if the booking no longer exists. It writes only the booking-form fields: status, prepared accounts, group membership and cancellations are left alone. It deletes `trainPreference`, `upgradePreferred` and `remarks` when they come in empty (lines 280-288).
- `deleteBooking` (line 311) is a hard delete through `deleteSyncedDoc()`, with no undo. Nothing else is removed: the group reference and prepared accounts go with the document.

### Bookings

- **Pending and completed.** The Pending tab shows bookings with status `Requested` (`src/components/bookings/BookingsView.tsx:291`). The Completed tab shows every other status (lines 298-305): `Booked`, `Booked (WL)`, `Missed`, `Booking Failed (Paid)`, `Booking Failed (Unpaid)`, `CNF & Cancelled` and `User Cancelled`. The Upcoming and Refunds tabs also list completed bookings. `getBookingStatusLabel()` in `src/types/booking.ts` gives the display name, such as "Booked (CNF)".
- **Mandatory fields on the form.** `src/components/bookings/BookingForm.tsx:50-65`: booking type, source, destination, journey date, book-by date, Requested by, class, and at least one passenger with name, age (1-150) and gender. Train preference, upgrade preferred and remarks are optional.
- **No natural key.** A booking has no PNR or phone number, and the Duplicate button creates legitimate identical bookings. "Find the booking" therefore has to match on route, date and names.
- **Cancellations exist only on completed bookings.** A booked ticket carries a `cancellations` array with refund legs, and cancelled passengers stay in `passengers[]`, referenced by a stable `pid`. Reverting a booking to `Requested` clears its cancellations, so a pending booking has none. This is the main reason the assistant stays out of completed bookings.
- **Pending bookings can still have extras.** They may belong to a group and have prepared IRCTC accounts assigned. Both live on the booking document.
- **Share text can contain passwords.** `BookingCard.tsx:403` adds an "ID(s) for Booking" block with IRCTC usernames and passwords.

### AI and navigation

- **Genkit is installed but unreachable.** `src/ai/genkit.ts` configures `googleai/gemini-2.0-flash` and there is one flow, `src/ai/flows/smart-destination-suggestion.ts`. Nothing calls it. `src/components/SmartSuggestionTool.tsx:59-60` short-circuits to "unavailable".
- **Navigation.** In `src/components/layout/AppShell.tsx`: `activeTab` union (line 36), `navItems` (lines 39-43), bottom-nav label (line 305), header title (lines 341-344). The same array feeds the desktop sidebar, the mobile drawer and the mobile bottom nav, which currently has three items. The command palette lists routes separately (`src/components/command-palette/CommandPalette.tsx:80-105`).
- **Installed packages.** `firebase@11.7.3` and `zod@3.24.2`. `zod-to-json-schema@3.24.5` is present only as a transitive dependency of `@genkit-ai/core`. `@google/genai` is not installed.

## Decisions

Answered by the project owner on 2026-11-25.

| Question | Decision |
|---|---|
| Which bookings can the assistant change? | Only pending bookings (status `Requested`). Completed bookings are processed and are never updated or deleted. |
| Where does the model call run? | In the browser, straight to Gemini with `@google/genai` and a `NEXT_PUBLIC_GEMINI_API_KEY`. |
| Who picks the action? | The user chooses Add, Update or Delete. The AI only extracts details. |
| When is anything written? | Never automatically. The user reviews and confirms. |
| Which extra fields are mandatory on Add? | Booking type, Requested by, and each passenger's age and gender. |
| Book-by date | Not mandatory. Defaults to "previous date of journey date", read here as the day before the journey date. |

**Accepted trade-off.** The API key is readable by anyone who loads the app, and Google's guidance says not to expose Gemini keys in client-side code in production. This is acceptable for now because the app is an internal tool that is already fully client-side, provided the key is a dedicated one restricted to the Gemini API. The model call lives in one function so it can move behind a server later.

Alternatives considered:

- Genkit on Firebase Functions would keep the key secret, but needs the Blaze plan, which the project cannot move to.
- Firebase AI Logic is Google's supported browser route, but needs `firebase` upgraded from 11.7 to 13.x plus App Check setup.

## Defaults chosen without asking

These were not confirmed. Change them on review if any is wrong.

- The feature is a new page, `/ai/`, with an "AI Assistant" entry in the navigation. The mobile bottom nav shows it as "AI".
- On Update, anything the text does not mention stays as it is, including the book-by date.
- Completed bookings are read, never written, in two places: to explain a failed Update or Delete match, and to flag an Add that repeats a booking that was already processed.
- The AI never changes a booking's status, payments, refunds, cancellations, prepared accounts or groups.

## Flow

1. The page shows an action selector (Add / Update / Delete) above a textarea, with helper text listing what to include for that action.
2. "Read details" or Ctrl+Enter sends the text to Gemini and gets structured details back. Every field is nullable, and `null` means "not mentioned".
3. A review panel shows the parsed details, the pending booking that will be affected, the exact changes for Update, and any warnings.
4. The confirm button is disabled while a blocking warning exists. Confirm calls the existing Firestore function, shows a toast and resets. Switching the action reuses the same parsed details.

The feature adds no Firestore collection reads. The only data request it makes is the Gemini call.

## Rules

### Pending bookings only

- A booking is pending when its status is `Requested`, which is the same rule the Pending tab uses. Everything else is completed.
- Update and Delete offer only pending bookings, and the assistant never writes to a completed booking.
- The status is read again from the live list at the moment of confirm. If the booking was processed in the meantime, for example from another device, nothing is written and a blocking warning says so.
- A booking created by Add is always pending.

### Before sending

Strip credentials: everything in the "ID(s) for Booking" block up to the next `---` or the end, and any line containing "password" or "pwd". Passenger names and ages are sent to Gemini. The pasted text is passed as data inside a tag, and the prompt says it is never an instruction.

### Prompt

- Give the model today's date (`todayDateKey()`) and the allowed values from `ALL_TRAIN_CLASSES`, `ALL_BOOKING_TYPES` and `ALL_PASSENGER_GENDERS`.
- Map synonyms: class (sleeper to SL, 3rd AC to 3A, and so on), booking type (normal or general to General), gender (male or female to M or F).
- Dates: numbers are DD/MM/YYYY, a missing year means the next upcoming date, relative words resolve against today, and output is `YYYY-MM-DD`.
- Set a field to `null` unless the text states it.
- Report assumptions and anything it could not map in `notes`.
- Use the lowest temperature the SDK allows.

### Finding a booking (Update and Delete)

This is code, not the AI, and it runs against the pending bookings from `useBookings()`.

- A strong match has the same journey date, every station named in the text, and a matching customer or passenger name. It is selected automatically only when it is the single strong match.
- Otherwise a ranked candidate list of pending bookings is shown and the user picks. This covers "move the journey to 20 Dec", where the text carries the new date.
- If no pending booking matches, a second read-only pass checks the completed bookings. When one of them matches, the blocking warning names it: "Ravi's Chennai to Bangalore booking on 15 Dec is already Booked (CNF). The assistant only changes pending bookings."
- If nothing matches at all, the blocking warning asks for a name, route or journey date.

### Add

- The booking is saved through `addBooking`, so it starts as pending with no prepared accounts and no group.
- After parsing, a read-only check looks for an existing booking with the same route, journey date and a passenger or customer name. A pending match is an amber note with an "Update it instead" button. A completed match is a note saying the booking was already processed. Neither blocks the Add.

### Update

- Only fields present in the text change. Everything else is carried over from the booking, including train preference, upgrade flag and remarks.
- Existing passengers are carried over as they are, so each passenger keeps its `pid`.
- Passengers merge by name. A mentioned passenger is updated, an unknown name is appended, a passenger marked for removal is dropped, and unmentioned passengers stay.
- The panel lists each change as current to new. "No changes" blocks.
- If the journey date moves and no book-by date is mentioned, the book-by date stays and an amber note says so.

### Delete

Same hard delete as the trash button (`deleteBooking`), on pending bookings only, behind the review step.

### Warnings

| Blocking (red) | Notes (amber) |
|---|---|
| Add: missing or invalid source, destination, journey date, class, booking type, Requested by, or passenger name, age or gender; journey date in the past | Book-by date defaulted to the day before the journey |
| Update or Delete: no matching pending booking, or none picked | Add: a similar pending booking already exists, with an "Update it instead" button |
| Update or Delete: the matching booking is already completed | Add: the same booking was already processed |
| Update: no changes; removing a passenger who is not on the booking; no passengers left | Update: journey date moved but book-by date unchanged |
| The booking stopped being pending between review and confirm | Delete: the booking belongs to a group, which keeps a stale reference |
| Gemini: key missing, rate limited, timed out, or output failed validation twice | Assumptions reported by the model |

## Data shape

Zod schema in `src/types/bookingIntent.ts`. The same schema is converted to JSON Schema for the model and used to validate its output.

```ts
passenger: { name, age, gender, berthRequired, remove }        // all nullable
details:   { source, destination, journeyDate, bookingDate,    // all nullable
             bookingType, classType, trainPreference,
             upgradePreferred, userName, remarks,
             passengers: passenger[] | null }
output:    { details, notes?: string[] }
```

## Files

New:

- `src/types/bookingIntent.ts`: output schema and types.
- `src/lib/aiClient.ts`: `parseBookingText(text)`, covering the key check, credential scrub, prompt, SDK call through a dynamic import, validation with one retry, and friendly errors.
- `src/lib/bookingMatcher.ts`: normalization and candidate ranking. Pure functions.
- `src/lib/bookingIntent.ts`: validation, merge, diff and plan building. Pure functions. It splits the booking list into pending and completed by status.
- `src/hooks/useBookingIntent.ts`: parse and apply state. Calls `addBooking`, `updateBookingById` and `deleteBooking`, and checks the status again before a write.
- `src/components/ai/AiBookingAssistant.tsx` and `src/components/ai/IntentReview.tsx`.
- `src/app/ai/page.tsx`: a `"use client"` page inside `<AppShell activeTab="ai">`.

Modified:

- `src/components/layout/AppShell.tsx`: extend the `activeTab` union, add the nav item after Bookings, add the header title, and render a short label in the bottom nav.
- `src/components/command-palette/CommandPalette.tsx`: add a navigation entry.
- `package.json`: add `@google/genai` and declare `zod-to-json-schema`.
- `.github/workflows/cloudrun-deploy.yml` and `deploy-gh-pages.yml`: pass `NEXT_PUBLIC_GEMINI_API_KEY`.
- `AGENTS.md` and `CLAUDE.md`: add an implementation note to both.

Existing code to reuse rather than rewrite: the three write functions above, `useBookings()`, `stripUndefined()` and `todayDateKey()` from `src/lib/cancellations.ts`, and `getBookingStatusLabel()` from `src/types/booking.ts`.

## Gemini SDK notes

Taken from the docs on 2026-11-25. The docs had moved recently, so confirm each point against the installed package before relying on it.

- Install `@google/genai`, then `new GoogleGenAI({ apiKey })`.
- Current call shape: `ai.interactions.create({ model, input, response_format: { type: "text", mime_type: "application/json", schema } })`, reading `interaction.output_text`.
- Structured output accepts a subset of JSON Schema: `properties`, `required`, `items`, `enum`, `description`, `anyOf`, `minimum` and `maximum`, and null types.
- Models named in the docs: `gemini-4-hydrogen` (the quickstart default), `gemini-4-carbon`, `gemini-4-argon`, `gemini-4-neon` and `gemini-3.8-flash`. The plan uses `gemini-3.8-flash`, set in one constant.
- Sources: https://aistudio.google.com/docs/quickstart, https://aistudio.google.com/docs/structured-output, https://aistudio.google.com/docs/api-key

## Setup needed outside the repo

1. Create a dedicated Gemini API key in AI Studio and restrict it to the Gemini API. Keep it separate from the existing `GEMINI_API_KEY` secret. If the key has billing enabled, set a budget alert.
2. Add it to GitHub as the `NEXT_PUBLIC_GEMINI_API_KEY` secret.
3. Provide the same variable locally. No `.env` file exists in the checkout, so add it wherever the `NEXT_PUBLIC_FIREBASE_*` values are provided, for example `.env.local`, which is gitignored.

## Out of scope

- Completed bookings: every status other than `Requested`. The assistant never updates or deletes them.
- Changing a booking's status, so the assistant can never mark a booking booked, missed or cancelled.
- Payments, refunds, cancellations, prepared accounts and booking groups.
- The disabled `/suggestions` page.
- `deleteBooking` leaving booking records and group references behind. That is existing behaviour.

## Implementation order

1. Install packages and confirm the SDK call shape against the typings.
2. Schema and types in `src/types/bookingIntent.ts`.
3. `src/lib/aiClient.ts`, then check one real parse by hand.
4. `bookingMatcher.ts` and `bookingIntent.ts`, with the pending-only split.
5. `useBookingIntent.ts`, including the status check before a write.
6. Components and the page.
7. Navigation and command palette.
8. Workflows, `AGENTS.md` and `CLAUDE.md`.

## Verification

There is no test framework in the repo, so this is manual. The parsing and matching logic is written as pure functions so it can be unit-tested later.

- `npm.cmd run typecheck` and `npm.cmd run lint`: no new errors.
- With `npm run dev` on port 9020, on `/ai/`:
  1. Add with a complete text. The booking appears on the Pending tab as Requested, with book-by set to the day before the journey.
  2. Add with the booking type missing. The warning blocks, then clears when the type is added to the text.
  3. Add with synonyms. "3rd AC", "sleeper" and "tomorrow" map correctly.
  4. Add a text identical to an existing pending booking. The note appears with "Update it instead".
  5. Add a text identical to a booked booking. The "already processed" note appears, and the Add still creates a pending booking.
  6. Update a pending booking with a single match. The change list shows only the changed field, the card reflects the save, and the status is still Requested.
  7. Update with an ambiguous match. The candidate list appears, holds only pending bookings, and a pick is required.
  8. Update where the text gives a new journey date. The booking is found through the candidate list.
  9. Update a pending booking with a passenger added, and with a passenger removed.
  10. Update text that describes a booked, cancelled or missed booking. It is blocked as already processed, and the booking is unchanged.
  11. Delete a pending booking. It disappears from the Pending tab, on this device and on a second one.
  12. Delete text that describes a booked booking. It is blocked, and the booking is unchanged.
  13. Mark the booking Booked somewhere else while the review is open, then confirm. Nothing is written and the warning explains why.
  14. Text containing an IRCTC credentials block. It is stripped before sending.
  15. An invalid key. A readable error, not a stack trace.
  16. Narrow viewport and dark mode. The four-item bottom nav and the review panel render cleanly.
- `npm run build`: `out/ai/index.html` exists and no Genkit server code is in the client bundle.
