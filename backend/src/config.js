import "dotenv/config";

export const creds = {
  appId: process.env.DNOTIFIER_APP_ID,
  secret: process.env.DNOTIFIER_SECRET,
};
if (!creds.appId || !creds.secret) {
  console.error("Missing DNOTIFIER_APP_ID / DNOTIFIER_SECRET in backend/.env");
  process.exit(1);
}

export const BOT_ID = "bot-support";
export const AGENT_ID = "agent-1";
export const PORT = process.env.PORT || 3000;

// AI provider/model used by the workflow. This project has no default model in the
// portal, so we name one explicitly. OpenAI is included in the DNotifier subscription.
// provider strings: open_ai, anthropic, google_gemini, hugging_face, perplexity, azure_ai, aws_bedrock, ollama
export const aiModel = {
  provider: process.env.AI_PROVIDER || "open_ai",
  model: process.env.AI_MODEL || "gpt-4o-mini",
};

// Workflow telemetry for the DNotifier dashboard. Adds ~5s per run; set to "false" for speed.
export const OBSERVABILITY = process.env.WORKFLOW_OBSERVABILITY !== "false";
