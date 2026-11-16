// Lead handler + static site server.
// Every lead from the site goes to all channels that are configured in .env:
// email (SMTP), Telegram (bot), Bitrix24 (incoming webhook). A channel with no settings is skipped.
// Run: npm install && npm start   (Node 18+)

const http = require("http");
const fs = require("fs");
const path = require("path");

// --- tiny .env loader (no dependency) ---
const envFile = path.join(__dirname, ".env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const PORT = Number(process.env.PORT || 8080);
const PUBLIC_DIR = path.resolve(__dirname, process.env.PUBLIC_DIR || "../public");
const BRAND = process.env.BRAND || "FreVigo";
const MAX_BODY = 20 * 1024;
const ALLOWED_TYPES = new Set(["rate_request", "provider_signup"]);

const TYPE_TITLE = {
  rate_request: { ru: "Запрос ставки", en: "Rate request" },
  provider_signup: { ru: "Заявка поставщика", en: "Provider application" }
};
const FIELD_LABEL = {
  from: "Откуда", to: "Куда", mode: "Вид перевозки", unit: "Контейнер", cargo: "Груз",
  name: "Имя", company: "Компания", email: "Email", phone: "Телефон/мессенджер",
  country: "Страна", role: "Роль", site: "Сайт", lanes: "Направления", consent: "Согласие на ПДн"
};

// --- simple rate limit: 5 leads per IP per 10 minutes ---
const hits = new Map();
function limited(ip) {
  const now = Date.now(), win = 10 * 60 * 1000;
  const list = (hits.get(ip) || []).filter((t) => now - t < win);
  list.push(now);
  hits.set(ip, list);
  return list.length > 5;
}

function clean(v, max = 1000) {
  return String(v == null ? "" : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max);
}

function validate(body) {
  if (!body || typeof body !== "object") return "bad body";
  if (!ALLOWED_TYPES.has(body.type)) return "bad type";
  const f = body.fields || {};
  if (clean(f.website)) return "spam"; // honeypot
  if (!clean(f.name) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(f.email))) return "missing name/email";
  if (f.consent !== true) return "no consent";
  if (body.type === "rate_request" && (!clean(f.from) || !clean(f.to))) return "missing route";
  if (body.type === "provider_signup" && (!clean(f.company) || !clean(f.country))) return "missing company";
  return null;
}

function toLead(body) {
  const f = body.fields || {};
  const fields = {};
  for (const k of Object.keys(FIELD_LABEL)) if (k in f && k !== "consent") fields[k] = clean(f[k]);
  return {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    type: body.type,
    title: TYPE_TITLE[body.type].ru,
    lang: clean(body.lang, 5),
    page: clean(body.page, 300),
    at: new Date().toISOString(),
    fields
  };
}

function asText(lead) {
  const lines = [`${BRAND}: ${lead.title} (#${lead.id})`, ""];
  for (const [k, v] of Object.entries(lead.fields)) if (v) lines.push(`${FIELD_LABEL[k] || k}: ${v}`);
  lines.push("", `Язык: ${lead.lang}`, `Время: ${lead.at}`, "Согласие на обработку ПДн: да");
  return lines.join("\n");
}

// --- channels ---
async function sendTelegram(lead) {
  const token = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return "skipped";
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text: asText(lead), disable_web_page_preview: true })
  });
  if (!r.ok) throw new Error("telegram " + r.status);
  return "ok";
}

async function sendBitrix(lead) {
  const hook = process.env.BITRIX24_WEBHOOK_URL; // e.g. https://your.bitrix24.ru/rest/1/xxxxxxxx/
  if (!hook) return "skipped";
  const f = lead.fields;
  const url = hook.replace(/\/?$/, "/") + "crm.lead.add.json";
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fields: {
        TITLE: `${BRAND}: ${lead.title}${f.from ? ` ${f.from} → ${f.to}` : f.company ? ` — ${f.company}` : ""}`,
        NAME: f.name,
        COMPANY_TITLE: f.company || "",
        EMAIL: [{ VALUE: f.email, VALUE_TYPE: "WORK" }],
        PHONE: f.phone ? [{ VALUE: f.phone, VALUE_TYPE: "WORK" }] : [],
        COMMENTS: asText(lead).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])).replace(/\n/g, "<br>"),
        SOURCE_ID: "WEB",
        SOURCE_DESCRIPTION: `${BRAND} website (${lead.lang})`
      },
      params: { REGISTER_SONET_EVENT: "Y" }
    })
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.error) throw new Error("bitrix24 " + (data.error || r.status));
  return "ok";
}

let transporter = null;
async function sendEmail(lead) {
  const host = process.env.SMTP_HOST, to = process.env.LEADS_EMAIL_TO;
  if (!host || !to) return "skipped";
  if (!transporter) {
    const nodemailer = require("nodemailer");
    transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT || 465),
      secure: String(process.env.SMTP_SECURE || "true") === "true",
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
  }
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    replyTo: lead.fields.email,
    subject: `${BRAND}: ${lead.title} #${lead.id}`,
    text: asText(lead)
  });
  return "ok";
}

// Backup: every lead is also appended to a local file, so nothing is lost if a channel is down.
function saveLocal(lead) {
  const file = process.env.LEADS_FILE || path.join(__dirname, "leads.jsonl");
  fs.appendFileSync(file, JSON.stringify(lead) + "\n");
}

async function handleLead(req, res) {
  const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  if (limited(ip)) return json(res, 429, { ok: false, error: "too many requests" });

  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > MAX_BODY) return json(res, 413, { ok: false, error: "too large" });
  }
  let body;
  try { body = JSON.parse(raw); } catch { return json(res, 400, { ok: false, error: "bad json" }); }

  const err = validate(body);
  if (err === "spam") return json(res, 200, { ok: true }); // pretend success for bots
  if (err) return json(res, 400, { ok: false, error: err });

  const lead = toLead(body);
  try { saveLocal(lead); } catch (e) { console.error("local save failed", e.message); }

  const results = await Promise.allSettled([sendEmail(lead), sendTelegram(lead), sendBitrix(lead)]);
  const names = ["email", "telegram", "bitrix24"];
  const report = {};
  results.forEach((r, i) => { report[names[i]] = r.status === "fulfilled" ? r.value : "error: " + r.reason.message; });
  console.log(new Date().toISOString(), lead.type, lead.id, report);

  // The lead is saved locally even if every channel fails, so the visitor still gets a success.
  return json(res, 200, { ok: true, id: lead.id });
}

function json(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".json": "application/json",
  ".txt": "text/plain; charset=utf-8", ".xml": "application/xml"
};

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let file = path.normalize(path.join(PUBLIC_DIR, urlPath));
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  fs.readFile(file, (e, data) => {
    if (e) { res.writeHead(404, { "Content-Type": "text/plain" }); return res.end("Not found"); }
    res.writeHead(200, {
      "Content-Type": TYPES[path.extname(file)] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin"
    });
    res.end(data);
  });
}

http.createServer((req, res) => {
  if (req.url.startsWith("/api/lead")) {
    if (req.method !== "POST") return json(res, 405, { ok: false });
    return handleLead(req, res).catch((e) => { console.error(e); json(res, 500, { ok: false }); });
  }
  if (req.url === "/healthz") return json(res, 200, { ok: true });
  serveStatic(req, res);
}).listen(PORT, () => console.log(`${BRAND} site on http://localhost:${PORT}`));
