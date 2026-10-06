# AGENTS.md

## Project

TrainTrack is a Next.js 15 static-export app for train booking operations. The frontend is TypeScript + React 18 + Tailwind + Radix/shadcn UI. Data is handled client-side through Firebase Firestore, with Genkit used for AI-powered suggestions.

The independently deployed customer request site lives in `customer-form/`; its export is `customer-form/out/`. Firebase callable Functions in `functions/` validate public requests, verify staff PINs and approve requests atomically. See `docs/customer-intake.md` for setup and coordinated rollout.

## Working Rules

- Treat this as a client-rendered app. New pages and interactive app surfaces should usually use "use client".
- Preserve static export compatibility. `next.config.mjs` uses `output: "export"` and `trailingSlash: true`.
- Keep raw Firestore access inside `src/lib/`. Hooks in `src/hooks/` should wrap those clients, not duplicate database logic.
- Keep shared domain types in `src/types/`.
- Prefer existing UI primitives from `src/components/ui/` before introducing new component patterns.
- Respect the `@/*` path alias to `src/*`.
- Public intake never reads Firestore directly. Keep request validation/station search in `shared/bookingRequest.ts`; server code resolves station codes from the shared offline catalogue. Do not silently correct passenger names or ambiguous stations.
- Staff pages must remain under the global `PinGate`, which verifies the PIN on the server and restores current Firebase staff claims before mounting data hooks. Browser flags are not authorization.
- Preserve staff-only Firestore rules and production App Check on callables. Deploy Functions, rules and the updated staff app together before opening the public site.

## Useful Paths

- `src/app/` app routes and page entry points
- `src/components/bookings/` booking UI and forms
- `src/components/accounts/` account management UI
- `src/components/layout/` shell and search components
- `src/hooks/useBookings.ts` booking queries and realtime subscription
- `src/hooks/useAccounts.ts` account queries and stats
- `src/hooks/useHandlers.ts` handler queries and stats
- `src/lib/firestoreClient.ts` booking and booking-group Firestore operations
- `src/lib/accountsClient.ts` account Firestore operations
- `src/lib/handlersClient.ts` handler Firestore operations
- `src/lib/firebase.ts` Firebase initialization
- `src/ai/` Genkit setup and flows
- `src/components/requests/` staff request inbox and approval review
- `src/lib/bookingRequestsClient.ts` staff request subscription and callable operations
- `customer-form/` separate static customer form (no staff shell)
- `shared/bookingRequest.ts` shared intake schemas and station lookup
- `shared/STATIONS.md` station sources and catalogue maintenance
- `functions/src/` server validation, staff auth and atomic transactions
- `docs/customer-intake.md` deployment and workflow guide

## Commands

- `npm run dev` starts Next.js on port `9020`
- `npm run genkit:dev` starts the Genkit dev server
- `npm run genkit:watch` starts Genkit with reload
- `npm run build` creates the static export
- `npm run typecheck` runs TypeScript checks
- `npm run customer:dev` starts the separate customer site on port `9030`
- `npm run customer:typecheck` and `npm run customer:build` check/build that site
- `npm --prefix functions ci` installs server dependencies
- `npm run intake:test` builds and runs backend unit tests
- `npm run intake:test:emulator` runs integration tests against an already started disposable demo emulator project

## Current Repo State

- `git pull --ff-only` reported `Already up to date.` on April 3, 2026.
- `npm.cmd run typecheck` passes.
- `npm.cmd run lint` passes (exit 0) after migrating from `next lint`/`.eslintrc.json` to the ESLint CLI with flat config (`eslint.config.mjs`, `eslint .`). It reports ~149 warnings (`@typescript-eslint/no-explicit-any`, `no-unused-vars`, and new react-hooks Compiler rules are downgraded to warnings); warnings do not fail the command.

## Implementation Notes

- Firestore timestamp values should be converted to ISO strings before use in client components.
- The app is deployed to Firebase Hosting from the static `out/` directory.
- Customer requests enter `bookingRequests/`; only server approval creates a `Requested` booking, with the customer phone/reference and immutable intake provenance. Duplicate retries and concurrent approvals return the same booking ID. Clarification/rejection are internal review actions, with no automatic WhatsApp messages.
- `firebase.customer-form.json` deploys only the separately configured `customer-form` Hosting target. No domain/DNS configuration is embedded in the repo.
- Existing PIN hashes remain compatible; new PINs are 6–12 digits. `appConfig/pin` is server-only and versioned to invalidate old staff sessions. Production requires Firebase Auth, App Check and callable deployment.
- `next.config.mjs` currently ignores TypeScript and ESLint errors during build, so do not assume a successful production build means the codebase is clean.
- **Payment tracking**: Bookings have `paymentReceived` and `amountSettled` fields for tracking customer payments and handler settlements. Use `isEligibleForPaymentTracking()` helper to filter bookings created/updated after March 6, 2026.
- **Group bookings**: Bookings can be grouped using `bookingGroups/` collection. Group operations include creation, status updates, and record editing. Ungrouping splits one group `bookingRecords` doc into individual records while preserving the original `createdAt` timestamp to keep date-bucketed counts stable.
- **Train names**: Booking records now include `trainName` field for better identification.
- **Upgrade preferred**: Booking records now include `upgradePreferred` field to indicate if an upgrade is preferred.
- **Booking count deduplication**: Both `accountsClient.ts` (`getAccountStats`) and `handlersClient.ts` (`getHandlerStatsForHandlers`) deduplicate booking records using the same priority: `bookingTransactionId` → `groupId` → document ID. A group booking always counts as 1, even after ungrouping.
- **Ungroup Firestore safety**: `ungroupBookings()` in `firestoreClient.ts` separates new-record creation (`addDoc`) from existing-record updates (`updateDoc`). `deleteField()` is only used in update paths — never in `addDoc()`, which Firestore rejects.
- **Ungroup booked-details sharing**: When ungrouping a Booked group, `ungroupBookings()` shares booked details across all individual bookings and splits the amount proportionally by passenger count. If a group record (`groupId` on the record) exists it is split; otherwise, if some bookings carry individual records (booked via the card inside a group or before grouping), those details are propagated to the rest of the group with the combined amount redistributed.
- **Booking date tracking**: Booking records now store `bookingDate` (`YYYY-MM-DD`) — the "Book by" date from the source booking — for accurate stats queries. Both `saveBookingRecord()` and `saveGroupBookingRecords()` fetch and store this date. Account stats and dashboard filtering use `bookingDate` instead of `createdAt` for current-month calculations; older records without `bookingDate` fall back to `createdAt`. The `lastBookedDate` on accounts is updated using the actual `bookingDate`, not today's date.
- **Account assignment conflict prevention**: `BookingRequirementsSheet` uses `usePendingBookings()` to compute `excludedUsernames` — a `Set<string>` of account usernames already assigned to other pending bookings' `preparedAccounts`. This set is passed to `AccountSelect` via its `excludedUsernames` prop, which hides those accounts from the dropdown unless they're the currently selected value. This prevents duplicate account assignments across pending bookings in real-time (via Firestore `onSnapshot`), and works for both individual and group booking modes. In group mode, all bookings in the group plus the current booking are excluded from the conflict check.
- **Taken account badge**: Account cards in the Accounts tab show a "Taken" badge when that username is in `preparedAccounts` of a booking with status `Requested`. It is derived live in `AccountsTab` from `usePendingBookings()` and is not stored on the account. The badge clears when the ID is removed, or when the booking leaves `Requested` (Booked, Missed, failed, or cancelled). The Accounts tab search bar also has an All / Taken / Not Taken filter (default All) that filters both verified and non-verified account groups by the same taken state; it hides on the Handlers tab.
- **Search bar in sidebar**: `SearchBarClient` is embedded in the desktop sidebar navigation (wrapped in `Suspense`) for searching across accounts and bookings.
- Existing repo guidance also lives in `CLAUDE.md`; keep both files aligned if architecture or workflows change.
