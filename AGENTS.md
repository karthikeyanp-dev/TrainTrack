# AGENTS.md

## Project

TrainTrack is a Next.js 15 static-export app for train booking operations. The frontend is TypeScript + React 18 + Tailwind + Radix/shadcn UI. Data is handled client-side through Firebase Firestore, with Genkit used for AI-powered suggestions.

## Working Rules

- Treat this as a client-rendered app. New pages and interactive app surfaces should usually use "use client".
- Preserve static export compatibility. `next.config.mjs` uses `output: "export"` and `trailingSlash: true`.
- Keep raw Firestore access inside `src/lib/`. Hooks in `src/hooks/` should wrap those clients, not duplicate database logic.
- Keep shared domain types in `src/types/`.
- Prefer existing UI primitives from `src/components/ui/` before introducing new component patterns.
- Respect the `@/*` path alias to `src/*`.

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

## Commands

- `npm run dev` starts Next.js on port `9002`
- `npm run genkit:dev` starts the Genkit dev server
- `npm run genkit:watch` starts Genkit with reload
- `npm run build` creates the static export
- `npm run typecheck` runs TypeScript checks

## Current Repo State

- `git pull --ff-only` reported `Already up to date.` on April 3, 2026.
- `npm.cmd run typecheck` passes.
- `npm.cmd run lint` currently fails because `next lint` hits a circular JSON/config error from `.eslintrc.json`; linting likely needs migration to the ESLint CLI for reliable execution on Next 15/16-era tooling.

## Implementation Notes

- Firestore timestamp values should be converted to ISO strings before use in client components.
- The app is deployed to Firebase Hosting from the static `out/` directory.
- `next.config.mjs` currently ignores TypeScript and ESLint errors during build, so do not assume a successful production build means the codebase is clean.
- **Payment tracking**: Bookings have `paymentReceived` and `amountSettled` fields for tracking customer payments and handler settlements. Use `isEligibleForPaymentTracking()` helper to filter bookings created/updated after March 6, 2026.
- **Group bookings**: Bookings can be grouped using `bookingGroups/` collection. Group operations include creation, status updates, and record editing. Ungrouping splits one group `bookingRecords` doc into individual records while preserving the original `createdAt` timestamp to keep date-bucketed counts stable.
- **Train names**: Booking records now include `trainName` field for better identification.
- **Upgrade preferred**: Booking records now include `upgradePreferred` field to indicate if an upgrade is preferred.
- **Booking count deduplication**: Both `accountsClient.ts` (`getAccountStats`) and `handlersClient.ts` (`getHandlerStatsForHandlers`) deduplicate booking records using the same priority: `bookingTransactionId` → `groupId` → document ID. A group booking always counts as 1, even after ungrouping.
- **Ungroup Firestore safety**: `ungroupBookings()` in `firestoreClient.ts` separates new-record creation (`addDoc`) from existing-record updates (`updateDoc`). `deleteField()` is only used in update paths — never in `addDoc()`, which Firestore rejects.
- **Booking date tracking**: Booking records now store `bookingDate` (`YYYY-MM-DD`) — the "Book by" date from the source booking — for accurate stats queries. Both `saveBookingRecord()` and `saveGroupBookingRecords()` fetch and store this date. Account stats and dashboard filtering use `bookingDate` instead of `createdAt` for current-month calculations; older records without `bookingDate` fall back to `createdAt`. The `lastBookedDate` on accounts is updated using the actual `bookingDate`, not today's date.
- **Search bar in sidebar**: `SearchBarClient` is embedded in the desktop sidebar navigation (wrapped in `Suspense`) for searching across accounts and bookings.
- Existing repo guidance also lives in `CLAUDE.md`; keep both files aligned if architecture or workflows change.
