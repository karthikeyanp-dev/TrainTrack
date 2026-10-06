# Separate customer booking requests

The customer form is an independently deployed static site in `customer-form/`. It can live at a subdomain such as `request.example.com`; the staff application remains on its existing domain. Both connect to the same Firebase project through different browser applications. No domain has been registered, deployment performed or live booking data modified by this change.

## Workflow

1. Staff share the customer site link through WhatsApp.
2. Customers choose their exact stations, boarding date, class and booking method, then enter travellers and contact details. “Help me choose” is an explicit choice where they need advice. Names are never autocorrected.
3. Customers review a readable summary and confirm it. Submission returns a request reference, clearly stating that no ticket is booked.
4. TrainTrack's **Requests** tab shows the submitted details, possible duplicates and review warnings. Staff contact the customer to resolve uncertainties, select the book-by date and confirm the booking plan.
5. **Approve and create booking** atomically creates one ordinary `Requested` booking with station codes, contact details and its request reference. Repeated taps, network retries and simultaneous approvals return the same booking.

Clarification and rejection store internal notes. They do not send WhatsApp messages. A material correction to a passenger or journey requires a new customer-confirmed request. Under-five travellers can submit their needs, but standard approval is blocked because the existing booking model does not represent infant ticket requirements. Staff must handle these separately. The form does not search trains, quote prices, take payments or issue tickets.

Customer draft saving is opt-in on their device. After a send attempt, the details are locked so retry uses the same UUID and payload, including after midnight. Successful delivery removes the saved draft and displayed passenger details. Clearing browser identity can prevent recovery of a lost receipt; customers should keep the page open during retry.

## Local builds and checks

Use Node.js 22 for the Functions runtime/tooling. Install the root dependencies once; the customer app reuses the locked root dependencies and UI primitives. Install Functions separately:

```powershell
npm ci
npm --prefix functions ci
npm run typecheck
npm run lint
npm run customer:typecheck
npm run customer:lint
npm run intake:test
npm run build
npm run customer:build
```

The staff export is `out/`; the separate customer export is `customer-form/out/`. Both preserve Next.js static export compatibility. New server operations live in Firebase Functions, not Next.js API routes. Root build ignores some compiler checks, so run the explicit type checks above.

`npm run customer:dev` opens the customer development server at `http://localhost:9030`. Without configured Firebase/App Check, sending is visibly disabled. To explore all steps without submitting anything, set `NEXT_PUBLIC_CUSTOMER_FORM_PREVIEW=true` in `customer-form/.env.local`; this demonstration mode is ignored by production builds and never produces a real receipt.

The [backend README](../functions/README.md) gives unit and Firebase emulator commands. The six emulator integration tests use synthetic data in a disposable `demo-*` project. For browser integration, both frontends support `NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true` in development on localhost; the customer app additionally requires a `demo-*` project. Use the same demo project and default database, with Auth 9099, Firestore 8080 and Functions 5001. Emulator mode is ignored in production. Disable preview mode for actual local submission. Staff emulator development uses a separate `.next-emulators/` build directory; choose another port with `npm run dev -- --port 9021` if a normal development server is already running.

## Firebase setup before publishing

Use a staging project first. Cloud Functions deployment requires Firebase's [Blaze plan](https://firebase.google.com/docs/functions/get-started).

1. Register a separate Firebase Web App for the customer site in the same project. Copy public configuration from `.env.example` and `customer-form/.env.example` into their respective `.env.local` files. Never put service-account credentials in either frontend.
2. Enable **Anonymous** Firebase Authentication for customers. Staff use server-issued custom tokens after entering the existing PIN; no staff password account is necessary.
3. Register both web apps with **App Check / reCAPTCHA Enterprise**, including each deployed domain. Supply the appropriate `NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY` at each build. Missing keys disable submission/sign-in. Production callables enforce App Check, which emulators cannot validate; check attestation in staging.
4. Confirm that the Functions runtime service account can sign Firebase custom tokens (`iam.serviceAccounts.signBlob`); see the [backend IAM instructions](../functions/README.md). Existing `appConfig/pin` hashes are supported without resetting the PIN. If no PIN exists, use the backend's private administrator bootstrap command.
5. Keep the backend parameter `TRAINTRACK_FIRESTORE_DATABASE_ID` equal to the staff app's `NEXT_PUBLIC_FIREBASE_DATABASE_ID` (default `(default)`). **For a named database**, add `"database": "YOUR_DATABASE_ID"` to the `firestore` object in `firebase.json` before deploying rules. Rules must protect the database that actually stores the bookings; deploying only to the default database is insufficient. See [Firebase CLI database configuration](https://firebase.google.com/docs/cli).
6. Add the deployed domains to the relevant Firebase Auth and reCAPTCHA allowed-domain settings. Set optional `NEXT_PUBLIC_CUSTOMER_FORM_URL` for the public-form shortcut in the staff inbox. Frontend environment values are baked into builds; rebuild after changes.

The new rules permit operational collections only for current staff claims. Customers cannot read bookings, account credentials, request lists, the PIN hash or other customers' details. Customer submissions and approvals use server callables. PIN changes revoke older staff sessions. Set `NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY` in GitHub secrets before the existing hosting workflow can deploy the updated staff app; it now checks this prerequisite.

## Coordinated rollout

Prepare both static exports and verify staff sign-in in staging before changing production rules. Publishing restrictive rules while serving the old staff app will interrupt its booking access. Arrange a short coordinated rollout of Functions, rules and the updated staff export, then publish the public form.

From the repository root, using your authorized Firebase CLI account and actual project ID:

```powershell
firebase deploy --only functions:booking-intake --project YOUR_PROJECT_ID
firebase deploy --only firestore:rules --project YOUR_PROJECT_ID
firebase deploy --only hosting --project YOUR_PROJECT_ID
```

The existing GitHub workflow deploys **staff hosting only**. It does not deploy Functions, rules or the customer site. Its App Check key check cannot prove that backend setup is complete.

## Hosting the customer subdomain

Create an additional Hosting site in the same project, using an available site ID of your choosing. The separate config targets only that site:

```powershell
firebase hosting:sites:create YOUR_CUSTOMER_SITE_ID --project YOUR_PROJECT_ID
firebase target:apply hosting customer-form YOUR_CUSTOMER_SITE_ID --project YOUR_PROJECT_ID
npm run customer:build
firebase deploy --config firebase.customer-form.json --only hosting:customer-form --project YOUR_PROJECT_ID
```

This serves `customer-form/out/`. To use your subdomain, choose **Add custom domain** on that customer Hosting site and apply Firebase's supplied DNS records with your domain provider. Wait for its domain verification and HTTPS certificate, register that hostname with Auth/App Check, and check a staging or test submission on the final URL before sharing it with customers. Follow [Firebase multisite setup](https://firebase.google.com/docs/hosting/multisites) and [custom domain setup](https://firebase.google.com/docs/hosting/custom-domain).

You may instead upload `customer-form/out/` to another static host. The callable backend still needs Firebase Auth, App Check and the correct domain registration.

## Operational limits

The offline station catalogue uses dated official directories and reviewed aliases; see [station provenance and refresh instructions](../shared/STATIONS.md). Staff must verify route, boarding date, child requirements, train availability and fares before buying tickets.

Configure TTL for `intakeRateLimits.expiresAt` and monitoring appropriate to the business as described in the backend README. Requests contain passenger/contact information; choose a retention period and restrict administrator access before opening intake. These operational settings and the actual subdomain/DNS are not changed by this implementation.
