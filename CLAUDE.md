# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TrainTrack is a Next.js 15 train booking management application with Firebase Firestore backend and Genkit AI integration. It uses Client-Side Rendering (CSR) with Firestore client SDK, TypeScript, and a mobile-first design with Tailwind CSS and Radix UI (shadcn/ui). The app is deployed as a static site to Firebase Hosting.

The customer booking request form is a separate static app in `customer-form/`, intended for an independent subdomain. Firebase callable Functions in `functions/` verify staff PINs, validate submissions and approve requests atomically. Setup and rollout are documented in `docs/customer-intake.md`; keep this file aligned with `AGENTS.md`.

## Development Commands

```bash
# Start Next.js development server on port 9020 (use this for development)
npm run dev

# Build static export for production (only needed for deployment)
npm run build

# Start Genkit AI development server (run in separate terminal)
npm run genkit:dev

# Start Genkit with auto-reload on changes
npm run genkit:watch

# Run ESLint
npm run lint

# Type checking (no build)
npm run typecheck

# Separate public customer site
npm run customer:dev
npm run customer:typecheck
npm run customer:build

# Callable backend dependencies and tests
npm --prefix functions ci
npm run intake:test
npm run intake:test:emulator
```

## Architecture

### Client-Side Rendering (CSR) with Static Export

- **Static export** - Next.js configured with `output: 'export'` for static site generation
- **Client components** - All pages and components use `"use client"` directive
- **Direct Firestore access** - Uses Firestore client SDK for real-time data fetching
- **React Query** - Data fetching and caching with `@tanstack/react-query`
- **Query parameter routing** - Edit booking uses `src/app/bookings/edit/page.tsx` with `?id=` query param (compatible with static export)

### Data Fetching Pattern

Staff operational data uses the Firestore client SDK with React Query hooks or realtime subscriptions. Public customer submissions and staff approval/authentication use callable Functions.

**Custom hooks in `src/hooks/`:**
- `useBookings.ts` - Real-time bookings via `onSnapshot()` listener; also exports `usePendingBookings()`, `useBookingDates()`. `usePendingBookings()` is also used by `BookingRequirementsSheet` to compute account assignment conflicts.
- `useAccounts.ts` - IRCTC account management via React Query (polling, not real-time); also exports `useAccountStats()`
- `useHandlers.ts` - Handler/agent management; also exports `useHandlerStats()`

**Firestore operations in `src/lib/`** (all raw Firestore calls live here, not in hooks):
- `firestoreClient.ts` - All booking CRUD, status updates, group operations, booking records
- `accountsClient.ts` - Account CRUD, wallet tracking, monthly stats
- `handlersClient.ts` - Handler CRUD, booking assignment stats, and per-handler payment totals
- `bookingRequestsClient.ts` - Authenticated inbox subscription and request review callables, wrapped by `useBookingRequests.ts`

**Important patterns:**
- Firestore client methods: `collection()`, `doc()`, `getDocs()`, `addDoc()`, `updateDoc()`, `deleteDoc()`
- React Query for caching; `useBookings` uses `onSnapshot()`, accounts/handlers use polling
- Optional fields cleaned up with `deleteField()` on update (not set to `null`). **Never use `deleteField()` inside `addDoc()` calls** — Firestore only allows it in `updateDoc()` or `set()` with merge.
- Firestore Timestamp conversion to ISO strings for client compatibility
- **Payment tracking**: Booking records include `paymentReceived` and `amountSettled` fields; filter by eligibility date using helper function
- **Group bookings**: Use `createBookingGroup()`, `updateBookingGroupStatus()`, `saveGroupBookingRecords()` from `firestoreClient.ts`
- **Ungrouping bookings**: `ungroupBookings()` splits one group `bookingRecords` doc into individual records. It preserves the original group record's `createdAt` timestamp so date/month-bucketed counts remain stable. The function separates creation (`addDoc` with clean data) from updates (`updateDoc` with `deleteField()` for `groupId`, `bookingIds`, optionally `trainName`). Amounts are split proportionally by passenger count.
- **Ungroup with individual booked details**: If no group record exists but some bookings in the group have their own individual `bookingRecords` (e.g. booked via the booking card inside a group, or booked before grouping), `ungroupBookings()` falls back to sharing those records' details across ALL bookings: the combined `amountCharged` is split proportionally by passenger count, and `bookedBy`/`bookedAccountUsername`/`methodUsed`/`bookingTransactionId`/`trainName`/`bookingDate` are copied to every booking (updating existing records, creating missing ones with the source record's `createdAt`).
- **Handler payment totals & settlement**: `getHandlerStatsForHandlers()` also sums `amountCharged` per handler split by `methodUsed` into `paymentTotals: { wallet, upi, others, total }`. UPI totals are what the business owes the handler (the handler paid from their own UPI app); Wallet totals came out of the IRCTC account balance. Only records with `createdAt >= HANDLER_PAYMENT_TRACKING_START_DATE` (exported from `handlersClient.ts`, currently Sept 11, 2026) are counted, so bookings settled before the feature existed are ignored. Unlike booking counts, amounts are **not** de-duplicated: an intact group record holds the full group amount in one doc while an ungrouped group holds proportional slices across several docs, so summing every record is correct in both cases. Outstanding debt is `getHandlerOutstanding()` = (`upi` + `others`) − `handler.settledAmount`; Wallet is excluded because it is funded by the business's own IRCTC balance. `recordHandlerSettlement()` adds to the handler doc's running `settledAmount` and stamps `lastSettledDate` (accepts a negative amount to reverse a mis-entry, and refuses to take the total below zero). There is no per-settlement history — only the running total. Because totals are derived from `bookingRecords`, editing or deleting booked details adjusts them automatically (records are always updated in place, never duplicated, and `createdAt` is never reset on edit, so a pre-cutoff record stays excluded). Deleting records after a settlement can drive outstanding negative; the card then shows "Overpaid". `settledAmount` is never auto-adjusted.
- **Stray individual records on group save**: `saveGroupBookingRecords()` deletes any non-group `bookingRecords` belonging to member bookings before writing the group record (via `deleteBookingRecord()`, sequentially, so wallet refunds are applied and don't race). Without this a booking that got its own booked details before being grouped would leave a record that both double-counts the amount and shadows the group record in `getBookingRecordByBookingId()`.
- **Booking count deduplication**: Both `getAccountStats()` (accountsClient) and `getHandlerStatsForHandlers()` (handlersClient) use the same deduplication strategy when counting bookings: first by `bookingTransactionId`, then by `groupId`, then by document ID. This ensures a group booking always counts as 1 — even after ungrouping into individual records.
- **Booking date tracking**: Both `saveBookingRecord()` and `saveGroupBookingRecords()` fetch the source booking's `bookingDate` (the "Book by" date) and store it in the booking record. Account stats (`getAccountStats`) and dashboard month-bucketing filter by `bookingDate` instead of `createdAt` for accuracy; older records without `bookingDate` fall back to `createdAt`. The `lastBookedDate` on accounts is set from the booking's `bookingDate`, not today's date.
- **Account assignment conflict prevention**: `BookingRequirementsSheet` uses `usePendingBookings()` to compute `excludedUsernames` — a `Set<string>` of account usernames already assigned to other pending bookings' `preparedAccounts`. This set is passed to `AccountSelect` via its `excludedUsernames` prop, which hides those accounts from the dropdown unless they're the currently selected value. This prevents duplicate account assignments across pending bookings in real-time (via Firestore `onSnapshot`), and works for both individual and group booking modes. In group mode, all bookings in the group plus the current booking are excluded from the conflict check.
- **Taken account badge**: Account cards in the Accounts tab show a "Taken" badge when that username is in `preparedAccounts` of a booking with status `Requested`. It is derived live in `AccountsTab` from `usePendingBookings()` and is not stored on the account. The badge clears when the ID is removed, or when the booking leaves `Requested` (Booked, Missed, failed, or cancelled). The Accounts tab search bar also has an All / Taken / Not Taken filter (default All) that filters both verified and non-verified account groups by the same taken state; it hides on the Handlers tab.

### Firebase Integration

**Initialization**: `src/lib/firebase.ts` uses singleton pattern with validation logging

**Collections:**
- `bookings/` - Main booking records
- `irctcAccounts/` - IRCTC credentials and wallet tracking
- `bookingRecords/` - Completion/payment records
- `handlers/` - Handler/agent names
- `bookingGroups/` - Group booking metadata (links multiple bookings)
- `bookingRequests/` - Private customer requests and server-written review state/audit events
- `appConfig/pin` - Server-only staff PIN hash and session version
- `intakeRateLimits/` - Server-only transactional rate limits

**Staff authentication:** The global `PinGate` mounts data hooks only after server PIN verification and current Firebase custom-token claims. Never use a localStorage flag as authorization. PIN changes increment a version checked by Firestore rules and callables. Existing PIN hashes remain usable; new PINs are 6–12 digits.

**Public intake:** `customer-form/` has no staff shell or Firestore SDK access. `shared/bookingRequest.ts` shares schemas and the offline station catalogue with both frontends and the backend. Station spelling suggestions require explicit selection; passenger names are never autocorrected. The server validates authoritative codes and creates one normal `Requested` booking only on staff approval. Preserve immutable customer snapshots and retry UUIDs. Clarification/rejection are internal notes and do not send WhatsApp messages. Under-five requests require separate staff handling.

**Data conversion:** Always convert Firestore Timestamps to ISO strings when reading data, as Timestamps cannot be serialized for client components. Use `toISOStringSafe()` from `firestoreClient.ts` for safe conversion with error logging.

**Legacy class mapping:** `normalizeClassType()` in `firestoreClient.ts` maps old class names (e.g., `"CC w Food"` → `"CC"`) using `LEGACY_CLASS_MAP` from `src/types/booking.ts`. Always use this when reading `classType` from Firestore.

### Genkit AI Setup

- Configuration in `src/ai/genkit.ts` with Google AI plugin
- Model: `googleai/gemini-2.0-flash`
- Flow: `smart-destination-suggestion.ts` suggests destinations from booking history
- Dev server entry: `src/ai/dev.ts`

### Form Handling

Existing staff booking forms use React Hook Form + Zod + the Firestore client SDK:

1. Define Zod schema for validation
2. Use `useForm` with zodResolver
3. On submit, call Firestore client methods directly (addDoc, updateDoc)
4. React Query mutations invalidate cache automatically
5. Handle success/error with toast notifications

**Key forms:**
- `BookingForm.tsx` - Complex form with dynamic passenger array, prepared accounts sheet
- `BookingRecordForm.tsx` - Simple completion recording
- `customer-form/src/components/BookingRequestForm.tsx` - Separate three-step public request form using shared schemas and a callable, with opt-in drafts and idempotent retries
- `requests/BookingRequestReview.tsx` - Staff review with explicit booking plan, customer verification and child checks

### Type System

All types defined in `src/types/`:

- `booking.ts` - `BookingStatus`, `TrainClass`, `Passenger`, `PreparedAccount`, `RefundDetails`, `Booking`, `BookingGroup`, `LEGACY_CLASS_MAP`
  - `Booking` includes `paymentReceived` and `amountSettled` fields for payment tracking
  - `Booking` includes `trainName` field for train identification
  - `Booking` includes `upgradePreferred` boolean to track if an upgrade is preferred
  - `BookingGroup` for grouping multiple bookings together
- `account.ts` - `IrctcAccount` interface
- `bookingRecord.ts` - `BookingRecord`, `PaymentMethod` enum (`"Wallet" | "UPI" | "Others"`)
  - `BookingRecord` includes `bookingDate` field (`YYYY-MM-DD`) storing the "Book by" date for accurate stats
  - `BookingRecord` includes `trainName` and `bookingTransactionId` fields
- `handler.ts` - `Handler` interface (includes `settledAmount` and `lastSettledDate` for handler repayment tracking)

### UI Components

**shadcn/ui components** in `src/components/ui/` - 34 pre-built components including button, card, dialog, form, input, select, textarea, accordion, tabs, toast, etc.

**Custom components:**
- `layout/AppShell.tsx` - Main wrapper with header, FAB, bottom nav
- `bookings/*` - Booking-specific components with infinite scroll pattern
- `accounts/*` - Account management views; `AccountSelect` accepts `excludedUsernames?: Set<string>` to filter out accounts already assigned to other pending bookings

### Styling

- **Tailwind CSS** with custom theme in `tailwind.config.ts`
- **Dark mode** via next-themes (class-based)
- **CSS variables** for theming (HSL color system)
- **Path alias**: `@/*` maps to `src/*`

## Key Patterns & Conventions

### Date Handling

Firestore stores dates as Timestamp objects. Always convert on read:

```typescript
journeyDate: booking.journeyDate?.toDate?.()?.toISOString() || booking.journeyDate
```

### Adding New Features

1. **Define type** in `src/types/`
2. **Create custom hook** in `src/hooks/` using React Query and Firestore client SDK
3. **Build component** in `src/components/`
4. **Create/update page** in `src/app/` with `"use client"` directive
5. Use React Query mutations to invalidate cache after data changes

### Search Implementation

The search bar (`SearchBarClient.tsx`) passes query to home page via URL params (`?search=term`). Client-side filtering happens in the page component, not the React Query hook — the hook returns all data unfiltered.

### Infinite Scroll Pattern

Completed bookings use date-based grouping with `DateGroupHeading.tsx`. The `BookingList.tsx` component handles intersection observer for lazy loading.

## Environment Variables

Required in `.env` or `.env.local`:

```
GEMINI_API_KEY=<your_key>

NEXT_PUBLIC_FIREBASE_API_KEY=<key>
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=<domain>
NEXT_PUBLIC_FIREBASE_PROJECT_ID=<project_id>
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=<bucket>
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=<sender_id>
NEXT_PUBLIC_FIREBASE_APP_ID=<app_id>
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=<measurement_id>
NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY=<staff_recaptcha_enterprise_site_key>

# Optional public-form shortcut in the staff inbox
NEXT_PUBLIC_CUSTOMER_FORM_URL=<customer_site_url>

# Optional: Named Firestore database
NEXT_PUBLIC_FIREBASE_DATABASE_ID=<database_id>
```

Note: `NEXT_PUBLIC_` prefixed variables are exposed to the browser.

## Deployment

### Firebase Hosting (Static Export)

Deployed via GitHub Actions (`.github/workflows/cloudrun-deploy.yml`) on push to `master`:

**Build process:**
1. Install dependencies with `npm ci`
2. Create `.env` file from GitHub secrets
3. Build static export with `npm run build` (outputs to `out/` directory)
4. Deploy to Firebase Hosting using `FirebaseExtended/action-hosting-deploy@v0`

**Configuration files:**
- `.firebaserc` - Firebase project configuration
- `firebase.json` - Hosting configuration (serves from `out/` directory)
- `next.config.mjs` - Next.js configured with `output: 'export'`

**GitHub Secrets needed:**
- `FIREBASE_SERVICE_ACCOUNT` - Service account JSON for Firebase deployment
- `FIREBASE_PROJECT_ID` - Your Firebase project ID
- All `NEXT_PUBLIC_*` Firebase config variables
- `GEMINI_API_KEY` - For Genkit AI features

### Local Deployment

To deploy manually from your local machine:

```bash
# Build the static export
npm run build

# Deploy to Firebase Hosting
firebase deploy --only hosting
```

## Important Notes

### Security Rules

Firestore rules (`firestore.rules`) require current `traintrackStaff` and `traintrackPinVersion` claims for operational data. Customers cannot read operational collections or the request inbox. Browser writes to requests, audit events and the PIN configuration are denied; server callables validate and write these. Production callables require App Check. Deploy the backend, restrictive rules and updated staff app together before publishing the customer form. Named database rules must be deployed to the actual configured database. See `docs/customer-intake.md` and `functions/README.md` for configuration, custom-token signing permissions and the separate `firebase.customer-form.json` Hosting target.

### Build Configuration

- `next.config.mjs` - Configured for static export with `output: 'export'`
- TypeScript/ESLint errors ignored during builds (`ignoreBuildErrors: true`)
- Images unoptimized for static export (`images.unoptimized: true`)
- Trailing slash enabled for proper routing (`trailingSlash: true`)

### Known Quirks

- Development server runs on port 9020 with Turbopack (`next dev --turbopack -p 9020`)
- Date conversion required for all Firestore Timestamp fields
- React Query stale time set to 60 seconds; accounts hook has no refetch-on-focus
- All components must use `"use client"` directive for CSR
- Firebase Hosting serves all routes to `/index.html` (SPA mode)
- `TOAST_LIMIT = 1` — only one toast notification visible at a time
- Optional env var `NEXT_PUBLIC_BASE_PATH` for subdirectory deployments
- **Payment tracking**: Use `isEligibleForPaymentTracking()` helper in BookingsView to filter bookings created/updated after feature start date (March 6, 2026)
- **Group bookings**: Multiple bookings can be grouped together using `bookingGroups/` collection; supports bulk status updates and record editing. Ungrouping preserves original `createdAt` and uses deduplication to keep counts stable.
- **Ungroup Firestore constraint**: `deleteField()` must never appear inside `addDoc()`. The `ungroupBookings()` function separates the creation path (clean data, no `deleteField`) from the update path (uses `deleteField` for `groupId`, `bookingIds`, `trainName`).
- **Account assignment conflict prevention**: When adding accounts via `BookingRequirementsSheet`, the `AccountSelect` dropdown filters out accounts already assigned to other pending bookings. This is powered by `usePendingBookings()` → `excludedUsernames` → `AccountSelect.excludedUsernames` prop. Conflicts update in real-time via Firestore `onSnapshot`. In group mode, all bookings in the group are excluded from the conflict check.

## Testing

The intake backend has Node test-runner unit tests in `functions/test/` and real Firebase Auth/Firestore/Functions integration tests in `functions/test/emulator/`. Use `npm run intake:test` and the emulator workflow in `functions/README.md`. Emulator tests require a disposable `demo-*` project and never access live customer data. Also run explicit staff/customer type checks, lint and both static builds. Production App Check attestation requires staging verification.

## Genkit Development

To test AI flows:
1. Run `npm run genkit:dev`
2. Open Genkit Dev UI (typically http://localhost:4000)
3. Test flows interactively with sample inputs
4. Flow outputs are type-safe with Zod schemas
