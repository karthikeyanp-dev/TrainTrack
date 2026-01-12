# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TrainTrack is a Next.js 15 train booking management application with Firebase Firestore backend and Genkit AI integration. It uses the App Router with React Server Components, TypeScript, and a mobile-first design with Tailwind CSS and Radix UI (shadcn/ui).

## Development Commands

```bash
# Start Next.js development server on port 9002
npm run dev

# Start Genkit AI development server (run in separate terminal)
npm run genkit:dev

# Start Genkit with auto-reload on changes
npm run genkit:watch

# Build for production
npm run build

# Start production server
npm start

# Run ESLint
npm run lint

# Type checking (no build)
npm run typecheck
```

## Architecture

### App Router Structure

- **Server Components by default** - Pages in `src/app/` are Server Components unless marked `"use client"`
- **Dynamic routes** - Edit booking uses `src/app/bookings/edit/[id]/page.tsx`
- **Force dynamic rendering** - Home page uses `export const dynamic = 'force-dynamic'` to prevent caching
- **API routes** - Health check at `src/app/api/health/route.ts`

### Server Actions Pattern

All data mutations go through Server Actions in `src/actions/`:

- `bookingActions.ts` - CRUD operations for bookings (20+ functions)
- `accountActions.ts` - IRCTC account management
- `bookingRecordActions.ts` - Booking completion records
- `handlerActions.ts` - Handler/agent management

**Important patterns:**
- All actions marked with `"use server"`
- Zod validation for all inputs
- Firestore Timestamp conversion handled explicitly
- Use `revalidatePath()` after mutations to invalidate cache
- Return flattened errors for form display

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

All forms use React Hook Form + Zod + Server Actions:

1. Define Zod schema for validation
2. Use `useForm` with zodResolver
3. On submit, call Server Action
4. Handle success/error with toast notifications

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
2. **Create Server Action** in `src/actions/` with Zod validation
3. **Build component** in `src/components/`
4. **Create/update page** in `src/app/`
5. Use `revalidatePath()` after mutations

### Search Implementation

The search bar (`SearchBarClient.tsx`) passes query to home page via URL params. Server component filters bookings on backend before rendering.

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

### Cloud Run Configuration

Deployed via GitHub Actions (`.github/workflows/cloudrun-deploy.yml`) on push to `master`:

- **Docker image** built from `Dockerfile`
- **Memory**: 2Gi, **CPU**: 2
- **Instances**: 1-10 with concurrency 80
- **Region**: us-central1
- **Service name**: studio

### Firebase Hosting

`firebase.json` routes all requests to Cloud Run service "studio". Static files served from `public/`.

## Important Notes

### Security Rules

Current Firestore rules (`firestore.rules`) allow unrestricted read/write. In production, add:
- Authentication checks (`request.auth != null`)
- User-specific access rules
- Data validation

### Build Configuration

- `next.config.mjs` - Uses .mjs extension to avoid TypeScript runtime dependency
- TypeScript/ESLint errors ignored during builds (`ignoreBuildErrors: true`)
- Server packages: `handlebars` externalized

### Known Quirks

- Home page uses `force-dynamic` to prevent caching issues with search
- PORT must be 8080 for Cloud Run deployment
- Date conversion required for all Firestore Timestamp fields
- React Query stale time set to 60 seconds

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
