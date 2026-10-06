import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { newPinRecord, PIN_PATH } from "./security";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function secretPrompt(prompt: string): Promise<string> {
  process.stdout.write(prompt);
  const silentOutput = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
  const reader = createInterface({ input: process.stdin, output: silentOutput, terminal: Boolean(process.stdin.isTTY) });
  return new Promise((resolve) => {
    reader.question("", (answer) => { reader.close(); process.stdout.write("\n"); resolve(answer); });
  });
}

async function main() {
  const projectId = argument("--project");
  const databaseId = argument("--database") ?? "(default)";
  if (!projectId || projectId.startsWith("--")) throw new Error("Pass an explicit Firebase project: npm run bootstrap:pin -- --project PROJECT_ID [--database DATABASE_ID]");
  const pin = await secretPrompt("New staff PIN (6 to 12 digits; input hidden): ");
  const confirmation = await secretPrompt("Repeat PIN: ");
  if (!/^\d{6,12}$/.test(pin)) throw new Error("PIN must contain 6 to 12 digits.");
  if (pin !== confirmation) throw new Error("PINs do not match.");
  // Requires operator ADC. No credentials or PIN are accepted as command-line args.
  const db = getFirestore(initializeApp({ projectId }), databaseId);
  const reference = db.doc(PIN_PATH);
  await db.runTransaction(async (transaction) => {
    if ((await transaction.get(reference)).exists) throw new Error("A PIN document already exists. Bootstrap will not overwrite it; use staff Change PIN.");
    transaction.create(reference, { ...newPinRecord(pin, 1), updatedAt: FieldValue.serverTimestamp(), bootstrappedBy: "admin-cli" });
  });
  console.log(`Staff PIN initialized in project ${projectId}, database ${databaseId}.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "PIN setup failed.");
  process.exitCode = 1;
});
