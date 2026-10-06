# Booking intake backend

These Node.js 22 Firebase callable functions run separately from both static frontends, in `asia-south1`. The deployment codebase is `booking-intake`; its `lib/` output contains the compiled shared schema and station catalogue, so deployment does not depend on files outside the `functions/` upload. Firebase's predeploy step compiles locally; the empty `gcp-build` script prevents the remote buildpack from trying to compile shared source that is outside the upload.

## Build and checks

From the repository root:

```powershell
npm --prefix functions ci
npm --prefix functions run typecheck
npm --prefix functions test
```

The transaction tests cover authorization, forged station names, unknown station codes, submission retries/ownership, stale review revisions, concurrent approval, children, PIN changes, and rate limits.

For an actual Firestore/Auth/Functions integration test, use Firebase CLI and Java. Only a disposable `demo-*` project and loopback emulators are accepted by the tests:

```powershell
npm --prefix functions run build
firebase emulators:exec --project demo-traintrack-intake --only auth,firestore,functions "npm --prefix functions run test:emulator"
```

On hosts where the CLI's localhost function discovery fails, set `$env:FIREBASE_FUNCTIONS_DISCOVERY_OUTPUT_PATH='true'` before starting the emulators. This enables the CLI's supported file-based discovery. The local emulators must use the default database for this integration suite.

App Check is bypassed exclusively inside the Functions emulator (`FUNCTIONS_EMULATOR=true`). Production always enforces App Check. Emulator tests cannot verify reCAPTCHA attestation; test a registered web app and valid App Check token on a staging deployment before opening intake.

## Configuration and first staff PIN

Enable Firebase Authentication's Anonymous provider for the customer app. Configure App Check for both web apps and register their domains. Staff authenticate through the current PIN, which is verified on the server and exchanged for a Firebase custom token. Existing `appConfig/pin` SHA-256 records work without resetting the PIN; clients must no longer read or write that document directly.

The Functions runtime service account needs `iam.serviceAccounts.signBlob` to create custom tokens. Grant the appropriate [Service Account Token Creator permission](https://firebase.google.com/docs/auth/admin/create-custom-tokens#service_account_does_not_have_required_permissions) if the staging staff login reports a signing permission error. Check this before switching the production staff app to the new authentication flow.

The runtime parameter `TRAINTRACK_FIRESTORE_DATABASE_ID` defaults to `(default)`. Set it to the same database as both frontends if using a named database. Keep `NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION` / the customer region at `asia-south1` unless changing the server region as well.

If no PIN exists, an authorized operator initializes it using Application Default Credentials. The script requires an explicit project, prompts without displaying the PIN, and refuses to overwrite any existing PIN document. Do not pass the PIN or credentials in command arguments:

```powershell
gcloud auth application-default login
npm --prefix functions run bootstrap:pin -- --project YOUR_PROJECT_ID
# Named database, if applicable:
npm --prefix functions run bootstrap:pin -- --project YOUR_PROJECT_ID --database YOUR_DATABASE_ID
```

New PINs use 6–12 digits. Existing digit-only PINs with at least four digits can sign in, preserving the previous gate's unrestricted maximum. PIN changes increment a version checked by callables and Firestore rules, invalidating older staff sessions. There is no public PIN creation or reset endpoint.

## Callable contracts

All endpoints require App Check in production. Customer submission additionally requires Anonymous Firebase Auth; staff endpoints require `traintrackStaff: true` and a current `traintrackPinVersion` claim.

| Callable | Input | Result |
| --- | --- | --- |
| `submitBookingRequest` | `{requestId: UUID, request: CustomerBookingRequestInput}` | `{receiptReference}` |
| `staffPinStatus` | `{}` | `{configured, pinVersion}` |
| `signInWithStaffPin` | `{pin}` | `{customToken}` |
| `changeStaffPin` | `{currentPin, newPin}` | `{success: true}` |
| `approveBookingRequest` | `{requestId, expectedRevision, booking: ApprovalPlan}` | `{bookingId}` |
| `updateBookingRequestStatus` | `{requestId, expectedRevision, status: "clarification" \| "rejected", message}` | `{revision}` |

Customer request UUIDs are stable across retries; they are bound to the anonymous UID and normalized payload. Reusing the UUID for another owner or changed payload fails. A customer receives only a receipt reference and cannot read the inbox or operational collections.

Approval atomically creates `bookings/intake-<requestId>` with `Requested` status, the immutable customer snapshot, approval plan and staff provenance; it then closes the inbox request. Concurrent approvals and retries return the same booking ID. Critical customer fields cannot be edited by the approval plan. Under-five travel requires separate handling because the existing booking model does not support infant ticket semantics.

Clarification and rejection update only review state and notes, with revision checking and an audit event. They do not send WhatsApp messages. Staff contact the customer themselves; a materially corrected journey or passenger identity must be submitted as a new confirmed request.

## Deployment and operations

Deployment is a separate operator action and requires a Firebase project on the [Blaze plan](https://firebase.google.com/docs/functions/get-started). Coordinate the new staff app, authentication, backend and Firestore rules together before publishing the customer form. Deploying staff-only rules before the updated staff app is ready will prevent older sessions from accessing bookings.

```powershell
firebase deploy --only functions:booking-intake --project YOUR_PROJECT_ID
```

Enable Firestore TTL on `intakeRateLimits.expiresAt` to remove expired limiter documents. Submission quotas are 10/hour per anonymous UID and 40/hour per source IP; PIN login allows 10 attempts per IP and 60 globally per 15 minutes. Configure monitoring and operational quotas to fit the business before launch. Rate limits are server-side transactions and do not rely on browser timers.

The root deployment guide covers the staff-only Firestore rules and the separate customer hosting site. The existing application hosting configuration is preserved in `firebase.json`.

References: [callable functions](https://firebase.google.com/docs/functions/callable), [App Check enforcement](https://firebase.google.com/docs/app-check/cloud-functions), [custom tokens](https://firebase.google.com/docs/auth/admin/create-custom-tokens).
