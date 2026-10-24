// Dev helper: run the support workflow on sample questions without the chat layer.
// Usage: npm run try -- "your question"
import { DNotifier } from "@dnotifier-realtime/dnotifier";
import { creds, BOT_ID } from "./config.js";
import { supportWorkflow } from "./workflow.js";

const noop = () => {};
const ai = new DNotifier({ ...creds, transport: "http", userId: BOT_ID, onConnected: noop, onMessage: noop, onDisconnected: noop });
await ai.connect();

const questions = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      "How long does delivery take in Karachi?",
      "Delivery kitni der mein hoti hai Karachi mein?",
      "Do you sell gift cards for Eid?",
      "I want to talk to a person",
    ];
for (const q of questions) {
  const t0 = Date.now();
  const run = await ai.runWorkflow({ workflow: supportWorkflow, input: q });
  console.log(`\nQ: ${q}\n→ ${JSON.stringify(run.result)}  (${Date.now() - t0}ms, exec ${run.executionId ?? "?"})`);
}
process.exit(0);
