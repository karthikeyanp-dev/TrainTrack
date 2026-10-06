# TrainTrack customer request form

This is a separate static Next.js application. It has no staff shell, PIN screen, account pages or direct Firestore access. Publish `customer-form/out/` on the customer subdomain; continue publishing the staff application's `out/` on its existing domain.

## Local development

Install the repository's dependencies at the repository root (`npm ci`). This application resolves those dependencies and reuses the existing Button and Input primitives plus the shared station directory and request schema.

```powershell
npm.cmd --prefix customer-form run dev
```

Open `http://localhost:9030`. Without configuration, the form can be explored but sending is visibly unavailable.

To demonstrate the entire form locally, create `customer-form/.env.local` with `NEXT_PUBLIC_CUSTOMER_FORM_PREVIEW=true`, then restart development. The preview never calls Firebase and displays “Preview complete”, never a real request receipt. This switch is ignored in production builds.

## Connected configuration

Copy `.env.example` to `.env.local` and fill in the public configuration for the same Firebase project as TrainTrack. Never put a service account, private key or admin credential in this app.

Online submission requires:

- Deployed `submitBookingRequest` callable in the configured region (`asia-south1` by default).
- Firebase anonymous authentication enabled.
- This website registered with Firebase App Check using reCAPTCHA Enterprise; set `NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY`.
- The customer subdomain added to the appropriate Firebase Auth and reCAPTCHA allowed domains.
- The backend's staff identity, database protections and callable permissions configured as described in the repository's customer intake documentation.

Missing Firebase or App Check configuration disables submission. Requests go through the authenticated and attested callable; this app does not import the Firestore SDK, query booking data, or read customer submissions.

```powershell
npm.cmd --prefix customer-form run typecheck
npm.cmd --prefix customer-form run build
```

The production artifact is `customer-form/out/`. It contains only static files; no Next.js server is needed. The browser calls Firebase Functions separately.

## Customer privacy and retry behavior

Draft storage is off by default. Customers can opt into saving traveller and contact details on their own device, resume or delete the draft, or dismiss the reminder. Successful delivery removes the saved draft and the passenger details from the rendered form. Firebase stores an anonymous device identity to allow safe retries; the website exposes no public retrieval or edit operations.

After the first send attempt, details are locked and retry uses the same UUID and payload. This prevents a slow network or repeated tap from creating duplicate bookings. If draft saving is enabled, the request UUID is retained with the draft so that reopening the same browser can retry. The customer must review and confirm restored details again. Without saved drafts, keep the page open while retrying.

An existing request can recover its receipt even after the boarding date passes. The server still rejects a new request for a past date. For local integration testing, `NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true` works only in development with a `demo-*` project on localhost; Auth uses port 9099 and Functions 5001. Disable demonstration preview to exercise the backend.

The receipt explicitly says that a request has been received and a ticket has not been booked. The staff inbox must approve the request before it becomes a TrainTrack booking.

See [deployment and subdomain instructions](../docs/customer-intake.md) and [station sources](../shared/STATIONS.md).
