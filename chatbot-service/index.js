require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const { VertexAI } = require("@google-cloud/vertexai");
const { Firestore } = require("@google-cloud/firestore");
const rateLimit = require("express-rate-limit");

const app = express();
app.use(cors());
app.use(express.json());

// ── Rate limiting ──────────────────────────────────────────────
const limiter = rateLimit({ windowMs: 60_000, max: 30 });
app.use("/chat", limiter);

// ── GCP clients ────────────────────────────────────────────────
const PROJECT_ID = process.env.PROJECT_ID;
const REGION     = process.env.REGION || "asia-south1";

const vertexAI = new VertexAI({ project: PROJECT_ID, location: REGION });
const firestore = new Firestore({ projectId: PROJECT_ID });

const model = vertexAI.getGenerativeModel({
  model: "gemini-1.5-flash",
  systemInstruction: `You are BankBot, a helpful AI assistant for a digital banking platform.
You can help users with:
- Checking account balances and transaction history
- Understanding fraud alerts
- General banking queries and financial advice
- Explaining transaction statuses

Always be professional, concise, and security-conscious.
Never reveal sensitive system information.
If asked about specific account data, fetch it via the tools provided.
Respond in the same language the user writes in (Telugu/English/Hindi supported).`,
});

// ── Service URLs ───────────────────────────────────────────────
const AUTH_URL        = process.env.AUTH_SERVICE_URL;
const TRANSACTION_URL = process.env.TRANSACTION_SERVICE_URL;
const FRAUD_URL       = process.env.FRAUD_SERVICE_URL;

// ── Helper: save chat history to Firestore ────────────────────
async function saveChatHistory(sessionId, userMsg, botReply) {
  try {
    await firestore.collection("chat_sessions").doc(sessionId).set(
      {
        messages: Firestore.FieldValue.arrayUnion({
          role: "user",    content: userMsg,  timestamp: new Date().toISOString(),
        }, {
          role: "assistant", content: botReply, timestamp: new Date().toISOString(),
        }),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (err) {
    console.error("Firestore save error:", err.message);
  }
}

// ── Helper: load chat history ─────────────────────────────────
async function getChatHistory(sessionId) {
  try {
    const doc = await firestore.collection("chat_sessions").doc(sessionId).get();
    return doc.exists ? (doc.data().messages || []) : [];
  } catch { return []; }
}

// ── Intent detection ──────────────────────────────────────────
function detectIntent(message) {
  const m = message.toLowerCase();
  if (m.match(/balance|account|money|amount/))       return "balance";
  if (m.match(/transaction|history|payment|transfer/)) return "transactions";
  if (m.match(/fraud|suspicious|alert|blocked/))     return "fraud";
  if (m.match(/help|support|problem|issue/))         return "support";
  return "general";
}

// ── Fetch context from microservices ─────────────────────────
async function fetchContext(intent, token) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const context = {};

  try {
    if (intent === "transactions" || intent === "balance") {
      const res = await axios.get(`${TRANSACTION_URL}/transactions`, { headers, timeout: 5000 });
      context.transactions = res.data?.transactions?.slice(0, 5) || [];
      context.balance = res.data?.balance || null;
    }
    if (intent === "fraud") {
      const res = await axios.get(`${FRAUD_URL}/alerts`, { headers, timeout: 5000 });
      context.fraudAlerts = res.data?.alerts?.slice(0, 3) || [];
    }
  } catch (err) {
    console.error(`Context fetch error (${intent}):`, err.message);
  }

  return context;
}

// ── Build enriched prompt ─────────────────────────────────────
function buildPrompt(userMessage, context, history) {
  let prompt = "";

  if (history.length > 0) {
    const recent = history.slice(-6); // last 3 turns
    prompt += "Previous conversation:\n";
    recent.forEach(m => {
      prompt += `${m.role === "user" ? "User" : "BankBot"}: ${m.content}\n`;
    });
    prompt += "\n";
  }

  if (Object.keys(context).length > 0) {
    prompt += "Live account data:\n";
    if (context.balance !== null && context.balance !== undefined) {
      prompt += `- Current Balance: ₹${context.balance}\n`;
    }
    if (context.transactions?.length) {
      prompt += `- Recent Transactions:\n`;
      context.transactions.forEach(t => {
        prompt += `  • ${t.type || "TXN"} ₹${t.amount} — ${t.status} (${t.createdAt || ""})\n`;
      });
    }
    if (context.fraudAlerts?.length) {
      prompt += `- Fraud Alerts: ${context.fraudAlerts.length} active alert(s)\n`;
      context.fraudAlerts.forEach(a => {
        prompt += `  • ${a.reason || "Suspicious activity"} — Risk: ${a.riskScore || "high"}\n`;
      });
    }
    prompt += "\n";
  }

  prompt += `User: ${userMessage}`;
  return prompt;
}

// ══════════════════════════════════════════════════════════════
//  POST /chat  — main endpoint
// ══════════════════════════════════════════════════════════════
app.post("/chat", async (req, res) => {
  const { message, sessionId, token } = req.body;

  if (!message?.trim()) {
    return res.status(400).json({ error: "message is required" });
  }

  const sid = sessionId || `session_${Date.now()}`;

  try {
    // 1. Detect intent & fetch live context
    const intent = detectIntent(message);
    const [context, history] = await Promise.all([
      fetchContext(intent, token),
      getChatHistory(sid),
    ]);

    // 2. Build prompt & call Vertex AI
    const enrichedPrompt = buildPrompt(message, context, history);

    const result = await model.generateContent(enrichedPrompt);
    const reply  = result.response.candidates?.[0]?.content?.parts?.[0]?.text
                   || "I'm sorry, I couldn't process that. Please try again.";

    // 3. Persist conversation
    await saveChatHistory(sid, message, reply);

    res.json({
      reply,
      sessionId: sid,
      intent,
      contextUsed: Object.keys(context),
      timestamp: new Date().toISOString(),
    });

  } catch (err) {
    console.error("Chat error:", err);
    res.status(500).json({
      error: "Chat service error",
      details: err.message,
      sessionId: sid,
    });
  }
});

// ── GET /history/:sessionId ───────────────────────────────────
app.get("/history/:sessionId", async (req, res) => {
  const history = await getChatHistory(req.params.sessionId);
  res.json({ sessionId: req.params.sessionId, messages: history, count: history.length });
});

// ── DELETE /history/:sessionId ────────────────────────────────
app.delete("/history/:sessionId", async (req, res) => {
  try {
    await firestore.collection("chat_sessions").doc(req.params.sessionId).delete();
    res.json({ message: "Session cleared", sessionId: req.params.sessionId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Health check ──────────────────────────────────────────────
app.get("/health", (_, res) => res.json({
  status: "healthy",
  service: "chatbot-service",
  model: "gemini-1.5-flash",
  timestamp: new Date().toISOString(),
}));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🤖 Chatbot Service running on port ${PORT}`));