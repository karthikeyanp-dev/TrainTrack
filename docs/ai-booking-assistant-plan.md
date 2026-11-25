# AI booking assistant: implementation plan

**Status:** draft, awaiting review. Written 2026-11-25. No code has been written for this feature yet.

The code facts below were checked against `origin/master` at `afad49d`, and line numbers refer to that commit.

## Goal

Add a page where the user pastes a plain-text booking message (source, destination, journey date, class, train preference, passengers). Gemini reads the details, and the user then adds a booking, updates the changed details of an existing booking, or deletes one. When mandatory details are missing, the app warns the user to include them.

## What the codebase looks like today

Facts the plan depends on.

### Deployment and limits

- **No server.** `next.config.mjs` uses `output: "export"` and the site is deployed from `out/` to Firebase Hosting (`.github/workflows/cloudrun-deploy.yml`, on push to `master`; despite its name it only deploys hosting). There are no API routes, server actions or Cloud Functions, and `firebase.json` rewrites every path to `index.html`.
- **Spark plan, fixed.** `CLAUDE.md` records that the project is on the Firebase Spark (free) plan and cannot be upgraded, with a limit of 50,000 document reads per day. Cloud Functions need the Blaze plan, so a server-side AI call is not available.
- **Second deployment.** `.github/workflows/deploy-gh-pages.yml` publishes the `dev` branch to GitHub Pages as a test environment.

### Data layer

Follow the "Data Fetching Pattern" rules in `CLAUDE.md`. `AGENTS.md` has not been updated for the sync layer yet.

- **Reads go through shared stores.** Whole collections are never read with ad-hoc `getDocs()` or `onSnapshot()` calls. `useBookings()` (`src/hooks/useBookings.ts`) reads from `bookingsStore` (`src/lib/dataStores.ts`). The collection is cached on the device and only changed bookings are fetched afterwards, so calling the hook from another page costs no extra reads.
- **Tombstone deletes.** Deleting a booking goes through `deleteSyncedDoc()` (`src/lib/sync/tombstones.ts`), which also writes a tombstone so other devices drop the booking from their cache. The stores filter tombstones out. Code that reads these collections raw must skip documents with `deleted === true`.
- **Every write sets `updatedAt`.** A write to `bookings` without `updatedAt: serverTimestamp()` never reaches other devices.
- **Payloads.** Firestore rejects `undefined`. `stripUndefined()` in `src/lib/cancellations.ts` removes `undefined`, `null` and empty-string keys.

### Booking writes

All three live in `src/lib/firestoreClient.ts` and return `{ success, error?, booking? }` without throwing.

- `addBooking` (line 195) always sets status `Requested` and stamps `createdAt` and `updatedAt`.
- `updateBookingById` (line 227) takes a full `BookingFormData` and runs in a transaction. It returns an error if the booking no longer exists, carries each passenger's stable `pid` through the edit, and refuses to drop a passenger who has been cancelled. It deletes `trainPreference`, `upgradePreferred` and `remarks` when they come in empty (lines 280-288).
- `deleteBooking` (line 311) is a hard delete through `deleteSyncedDoc()`, with no undo. Nothing else is removed: the booking record, group references and refund tracking stay behind.

### Bookings

- **Mandatory fields on the form.** `src/components/bookings/BookingForm.tsx:50-65`: booking type, source, destination, journey date, book-by date, Requested by, class, and at least one passenger with name, age (1-150) and gender. Train preference, upgrade preferred and remarks are optional.
- **No natural key.** A booking has no PNR or phone number, and the Duplicate button creates legitimate identical bookings. "Find the booking" therefore has to match on route, date and names.
- **Statuses.** There are eight, including `Booked (WL)`. `isBookedStatus()` in `src/types/booking.ts` is true for both booked statuses, and `Booked` is displayed as "Booked (CNF)".
- **Cancellations overlay.** A booking carries a `cancellations` array with two refund legs. Cancelled passengers are never removed from `passengers[]`; they are referenced by a stable `pid`. Helpers in `src/lib/cancellations.ts` read through the overlay: `getActivePassengers()`, `hasOpenRefund()`, `getCancelledPids()`.
- **Refunds tab.** `RefundsManager.tsx` lists every booking with `hasOpenRefund()` and renders its card in refund mode, which hides Edit but keeps Delete (`BookingCard.tsx:1084-1096`). A fully cancelled or failed-but-paid booking with an open refund leg lives only there (`isRefundPending`, `BookingsView.tsx:47`), so the UI offers no Edit for it.
- **Delete and cancel.** The card offers Delete on every booking that shows its action buttons, including booked tickets. For a booked ticket it also offers "Cancel passengers" (`BookingCard.tsx:1061`), which records the cancellation and its refund legs.
- **Share text can contain passwords.** `BookingCard.tsx:403` adds an "ID(s) for Booking" block with IRCTC usernames and passwords.

### AI and navigation

- **Genkit is installed but unreachable.** `src/ai/genkit.ts` configures `googleai/gemini-2.0-flash` and there is one flow, `src/ai/flows/smart-destination-suggestion.ts`. Nothing calls it. `src/components/SmartSuggestionTool.tsx:59-60` short-circuits to "unavailable".
- **Navigation.** In `src/components/layout/AppShell.tsx`: `activeTab` union (line 36), `navItems` (lines 39-43), bottom-nav label (line 305), header title (lines 341-344). The same array feeds the desktop sidebar, the mobile drawer and the mobile bottom nav, which currently has three items. The command palette lists routes separately (`src/components/command-palette/CommandPalette.tsx:80-105`).
- **Installed packages.** `firebase@11.7.3` and `zod@3.24.2`. `zod-to-json-schema@3.24.5` is present only as a transitive dependency of `@genkit-ai/core`. `@google/genai` is not installed.

## Decisions

Answered by the project owner on 2026-11-25.

| Question | Decision |
|---|---|
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
- Delete is the same hard delete as the trash button, and it is allowed on any booking.
- On Update, anything the text does not mention stays as it is, including the book-by date.
- A passenger can be removed only while the booking is `Requested`.
- Update is blocked for the bookings the Refunds tab shows without an Edit button.
- The AI never changes status, payments, refunds, cancellations, prepared accounts or groups.

## Flow

1. The page shows an action selector (Add / Update / Delete) above a textarea, with helper text listing what to include for that action.
2. "Read details" or Ctrl+Enter sends the text to Gemini and gets structured details back. Every field is nullable, and `null` means "not mentioned".
3. A review panel shows the parsed details, the booking that will be affected, the exact changes for Update, and any warnings.
4. The confirm button is disabled while a blocking warning exists. Confirm calls the existing Firestore function, shows a toast and resets. Switching the action reuses the same parsed details.

The feature adds no Firestore collection reads. The only data request it makes is the Gemini call.

## Rules

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

This is code, not the AI, and it runs against the `useBookings()` list.

- A strong match has the same journey date, every station named in the text, and a matching customer or passenger name. It is selected automatically only when it is the single strong match.
- Otherwise a ranked candidate list is shown and the user picks. This covers "move the journey to 20 Dec", where the text carries the new date.
- No candidate at all is a blocking warning asking for a name, route or journey date.
- Passenger matching uses the whole `passengers[]` array, including cancelled passengers, so that a text naming a cancelled passenger still finds the booking.

### Update

- Only fields present in the text change. Everything else is carried over from the booking, including train preference, upgrade flag and remarks.
- Existing passengers are carried over as they are, so each `pid` survives. Losing a `pid` would detach a cancellation from its passenger.
- Passengers merge by name. A mentioned passenger is updated and an unknown name is appended.
- A passenger is removed only while the booking is `Requested`. On a booked ticket, a traveller dropping out is a cancellation with refund tracking, so the assistant says to use "Cancel passengers" on the booking card. A passenger who is already cancelled stays on the booking.
- The panel lists each change as current to new. "No changes" blocks.
- If the journey date moves and no book-by date is mentioned, the book-by date stays and an amber note says so.

### Delete

Same hard delete as the trash button, behind the review step.

### Warnings

| Blocking (red) | Notes (amber) |
|---|---|
| Add: missing or invalid source, destination, journey date, class, booking type, Requested by, or passenger name, age or gender; journey date in the past | Book-by date defaulted to the day before the journey |
| Update or Delete: no matching booking, or none picked | Add: a similar booking already exists, with an "Update it instead" button |
| Update: no changes; removing a passenger on a booking that is not `Requested`; no passengers left | Update: journey date moved but book-by date unchanged |
| Update: the booking is fully cancelled or failed-but-paid with an open refund leg | Delete: the booking is booked (its booking record and refund tracking stay behind) |
| Gemini: key missing, rate limited, timed out, or output failed validation twice | Delete: the booking has an open refund, or belongs to a group |

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
- `src/lib/bookingIntent.ts`: validation, merge, diff and plan building. Pure functions.
- `src/hooks/useBookingIntent.ts`: parse and apply state. Calls `addBooking`, `updateBookingById` and `deleteBooking`.
- `src/components/ai/AiBookingAssistant.tsx` and `src/components/ai/IntentReview.tsx`.
- `src/app/ai/page.tsx`: a `"use client"` page inside `<AppShell activeTab="ai">`.

Modified:

- `src/components/layout/AppShell.tsx`: extend the `activeTab` union, add the nav item after Bookings, add the header title, and render a short label in the bottom nav.
- `src/components/command-palette/CommandPalette.tsx`: add a navigation entry.
- `src/lib/cancellations.ts` and `src/components/bookings/BookingsView.tsx`: move `isRefundPending` into `cancellations.ts` and import it in both places, so the rule has one definition.
- `package.json`: add `@google/genai` and declare `zod-to-json-schema`.
- `.github/workflows/cloudrun-deploy.yml` and `deploy-gh-pages.yml`: pass `NEXT_PUBLIC_GEMINI_API_KEY`.
- `AGENTS.md` and `CLAUDE.md`: add an implementation note to both.

Existing code to reuse rather than rewrite: the three write functions above, `stripUndefined()`, `todayDateKey()`, `hasOpenRefund()` and `getActivePassengers()` from `src/lib/cancellations.ts`, and `isBookedStatus()` from `src/types/booking.ts`.

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

- Status changes, payments, refunds, cancellations, prepared accounts and booking groups.
- The disabled `/suggestions` page.
- `deleteBooking` leaving booking records and group references behind. That is existing behaviour.

## Implementation order

1. Install packages and confirm the SDK call shape against the typings.
2. Schema and types in `src/types/bookingIntent.ts`.
3. `src/lib/aiClient.ts`, then check one real parse by hand.
4. `bookingMatcher.ts` and `bookingIntent.ts`.
5. `useBookingIntent.ts`.
6. Components and the page.
7. Navigation and command palette.
8. Workflows, `AGENTS.md` and `CLAUDE.md`.

## Verification

There is no test framework in the repo, so this is manual. The parsing and matching logic is written as pure functions so it can be unit-tested later.

- `npm.cmd run typecheck` and `npm.cmd run lint`: no new errors.
- With `npm run dev` on port 9020, on `/ai/`:
  1. Add with a complete text. The booking appears on the Bookings tab as Requested, with book-by set to the day before the journey.
  2. Add with the booking type missing. The warning blocks, then clears when the type is added to the text.
  3. Add with synonyms. "3rd AC", "sleeper" and "tomorrow" map correctly.
  4. Update with a single match. The change list shows only the changed field and the card reflects the save.
  5. Update with an ambiguous match. The candidate list appears and a pick is required.
  6. Update where the text gives a new journey date. The booking is found through the candidate list.
  7. Update with a passenger added, and with a passenger removed, on a Requested booking.
  8. Update that tries to remove a passenger on a booked ticket. It is blocked with the "Cancel passengers" hint.
  9. Update on a booking that has a cancelled passenger. The passenger still shows as cancelled afterwards.
  10. Update on a booking with an open refund. It is blocked.
  11. Delete. The booking disappears from the Bookings tab, and also on a second device.
  12. Delete a booking with an open refund. It is allowed, with a note.
  13. Text containing an IRCTC credentials block. It is stripped before sending.
  14. An invalid key. A readable error, not a stack trace.
  15. Narrow viewport and dark mode. The four-item bottom nav and the review panel render cleanly.
- `npm run build`: `out/ai/index.html` exists and no Genkit server code is in the client bundle.
