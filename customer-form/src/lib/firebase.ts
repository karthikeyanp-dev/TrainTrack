import { getApps, initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider, getToken, type AppCheck } from 'firebase/app-check';
import { browserLocalPersistence, connectAuthEmulator, getAuth, setPersistence, signInAnonymously } from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};
const siteKey = process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY;
const emulatorEnabled = process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === 'true' && config.projectId?.startsWith('demo-');
export const isConfigured = Object.values(config).every(Boolean) && (Boolean(siteKey) || emulatorEnabled);
export const previewEnabled = process.env.NEXT_PUBLIC_CUSTOMER_FORM_PREVIEW === 'true' && process.env.NODE_ENV !== 'production';

let clientPromise: Promise<ReturnType<typeof getFunctions>> | undefined;
let appCheck: AppCheck | undefined;

export function getSubmissionClient() {
  if (!isConfigured) throw new Error('Online requests are not available yet. Please contact your booking agent.');
  if (!clientPromise) {
    clientPromise = (async () => {
      const app = getApps().find((item) => item.name === 'customer-intake') ?? initializeApp(config, 'customer-intake');
      const auth = getAuth(app);
      const functions = getFunctions(app, process.env.NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION || 'asia-south1');
      const useEmulators = emulatorEnabled && ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
      if (emulatorEnabled && !useEmulators) throw new Error('Local emulators are available only on localhost.');
      if (useEmulators) {
        const localState = globalThis as typeof globalThis & { __customerIntakeEmulatorsConnected?: boolean };
        if (!localState.__customerIntakeEmulatorsConnected) {
          connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
          connectFunctionsEmulator(functions, '127.0.0.1', 5001);
          localState.__customerIntakeEmulatorsConnected = true;
        }
      } else {
        appCheck ??= initializeAppCheck(app, {
          provider: new ReCaptchaEnterpriseProvider(siteKey!),
          isTokenAutoRefreshEnabled: true,
        });
      }
      // The anonymous device identity lets a saved draft retry the same request.
      // No customer database reads or edit operations are exposed by this app.
      await setPersistence(auth, browserLocalPersistence);
      await auth.authStateReady();
      if (!auth.currentUser) await signInAnonymously(auth);
      // Fail closed before sending any passenger information if attestation fails.
      if (!useEmulators) await getToken(appCheck!, false);
      return functions;
    })().catch((error: unknown) => {
      clientPromise = undefined;
      throw error;
    });
  }
  return clientPromise;
}
