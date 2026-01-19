# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TrainTrack is a Next.js 15 train booking management application with Firebase Firestore backend and Genkit AI integration. It uses Client-Side Rendering (CSR) with Firestore client SDK, TypeScript, and a mobile-first design with Tailwind CSS and Radix UI (shadcn/ui). The app is deployed as a static site to Firebase Hosting.

## Development Commands

```bash
# Start Next.js development server on port 9002 (use this for development)
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
```

## Architecture

### Client-Side Rendering (CSR) with Static Export

- **Static export** - Next.js configured with `output: 'export'` for static site generation
- **Client components** - All pages and components use `"use client"` directive
- **Direct Firestore access** - Uses Firestore client SDK for real-time data fetching
- **React Query** - Data fetching and caching with `@tanstack/react-query`
- **Query parameter routing** - Edit booking uses `src/app/bookings/edit/page.tsx` with `?id=` query param (compatible with static export)

### Data Fetching Pattern

All data operations use Firestore client SDK with React Query hooks:

**Custom hooks in `src/hooks/`:**
- `useBookings.ts` - Real-time bookings data with infinite scroll
- `useAccounts.ts` - IRCTC account management
- `useBookingRecords.ts` - Booking completion records
- `useHandlers.ts` - Handler/agent management

**Important patterns:**
- Firestore client methods: `collection()`, `doc()`, `getDocs()`, `addDoc()`, `updateDoc()`, `deleteDoc()`
- React Query for caching and automatic refetching
- Real-time listeners with `onSnapshot()` for live updates
- Firestore Timestamp conversion to ISO strings for client compatibility

### Firebase Integration

**Initialization**: `src/lib/firebase.ts` uses singleton pattern with validation logging

**Collections:**
- `bookings/` - Main booking records
- `irctcAccounts/` - IRCTC credentials and wallet tracking
- `bookingRecords/` - Completion/payment records
- `handlers/` - Handler/agent names

**Data conversion:** Always convert Firestore Timestamps to ISO strings when reading data, as Timestamps cannot be serialized for client components.

### Genkit AI Setup

- Configuration in `src/ai/genkit.ts` with Google AI plugin
- Model: `googleai/gemini-2.0-flash`
- Flow: `smart-destination-suggestion.ts` suggests destinations from booking history
- Dev server entry: `src/ai/dev.ts`

### Form Handling

All forms use React Hook Form + Zod + Firestore client SDK:

1. Define Zod schema for validation
2. Use `useForm` with zodResolver
3. On submit, call Firestore client methods directly (addDoc, updateDoc)
4. React Query mutations invalidate cache automatically
5. Handle success/error with toast notifications

**Key forms:**
- `BookingForm.tsx` - Complex form with dynamic passenger array, prepared accounts sheet
- `BookingRecordForm.tsx` - Simple completion recording

### Type System

All types defined in `src/types/`:

- `booking.ts` - BookingStatus, TrainClass, Passenger, Booking interfaces
- `account.ts` - IrctcAccount interface
- `bookingRecord.ts` - BookingRecord, PaymentMethod
- `handler.ts` - Handler interface

### UI Components

**shadcn/ui components** in `src/components/ui/` - 34 pre-built components including button, card, dialog, form, input, select, textarea, accordion, tabs, toast, etc.

**Custom components:**
- `layout/AppShell.tsx` - Main wrapper with header, FAB, bottom nav
- `bookings/*` - Booking-specific components with infinite scroll pattern
- `accounts/*` - Account management views

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

The search bar (`SearchBarClient.tsx`) passes query to home page via URL params. Client-side filtering happens in the React Query hook.

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

Current Firestore rules (`firestore.rules`) allow unrestricted read/write. In production, add:
- Authentication checks (`request.auth != null`)
- User-specific access rules
- Data validation

### Build Configuration

- `next.config.mjs` - Configured for static export with `output: 'export'`
- TypeScript/ESLint errors ignored during builds (`ignoreBuildErrors: true`)
- Images unoptimized for static export (`images.unoptimized: true`)
- Trailing slash enabled for proper routing (`trailingSlash: true`)

### Known Quirks

- Development server runs on port 9002 (configured in `package.json`)
- Date conversion required for all Firestore Timestamp fields
- React Query stale time set to 60 seconds
- All components must use `"use client"` directive for CSR
- Firebase Hosting serves all routes to `/index.html` (SPA mode)

## Testing

Currently no test setup. When adding tests:
- Place test files alongside source: `*.test.ts(x)`
- Focus on Server Actions and form validation
- Mock Firebase in tests

## Genkit Development

To test AI flows:
1. Run `npm run genkit:dev`
2. Open Genkit Dev UI (typically http://localhost:4000)
3. Test flows interactively with sample inputs
4. Flow outputs are type-safe with Zod schemas
