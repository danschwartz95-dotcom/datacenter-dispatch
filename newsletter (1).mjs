// newsletter.mjs — Daily Data Center Intelligence Briefing for Hubbell
// Runs in GitHub Actions on a daily schedule.

import Anthropic from "@anthropic-ai/sdk";
import nodemailer from "nodemailer";

// ── Config from environment (GitHub Secrets) ──────────────────────────────────
const {
  ANTHROPIC_API_KEY,
  SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS,
  FROM_EMAIL, TO_EMAILS,
} = process.env;

console.log("API key starts with:", ANTHROPIC_API_KEY?.slice(0, 10));

// ── Anthropic client ──────────────────────────────────────────────────────────
const client = new Anthropic({
  apiKey: ANTHROPIC_API_KEY,
  defaultHeaders: { "anthropic-beta": "web-search-2025-03-05" },
});

// ── Prompt ────────────────────────────────────────────────────────────────────
const prompt = `Today is ${new Date().toDateString()}.

Search the web for the most important U.S. and global data center news, analysis, and market signals published within the past 24-48 hours. Then produce a Daily Data Center Intelligence Briefing tailored for Business Development at Hubbell Incorporated.

The briefing must emphasize developments affecting electrical infrastructure, power distribution, grid capacity, switchgear, connectors, cable management, utility-scale power systems, cooling-electrical integration, and construction activity.

Structure the output with exactly these 8 sections using clean HTML formatting (use <h2>, <h3>, <ul>, <li>, <strong>, <p>, <table> tags — no markdown):

<h2>1. Top Headlines</h2>
3-7 headlines, each with:
- The headline as a bold item
- A 2-3 sentence summary
- Source and URL as a citation link
- A "Hubbell Relevance" tag (High / Medium / Low) with a one-sentence explanation

<h2>2. U.S. Market Update</h2>
A 150-200 word narrative summary of US data center market activity — construction, investment, permitting, power capacity, grid interconnection, and regional hotspots.

<h2>3. International Market Update</h2>
A 100-150 word narrative covering key international developments (Europe, Asia-Pacific, Middle East) relevant to global data center infrastructure trends.

<h2>4. Hyperscaler-Specific Activity</h2>
Bullet points for each relevant hyperscaler: AWS, Microsoft Azure, Google Cloud, Meta, OpenAI / xAI / Oracle / SB Energy, Alibaba / Tencent / Baidu. Include only those with news today. For each: what they announced, where, scale (MW/sqft if known), and infrastructure implications.

<h2>5. Technology & Infrastructure Trends</h2>
3-5 bullet points covering emerging trends in power density, cooling-electrical integration, grid interconnection, modular construction, backup power, and related infrastructure technology.

<h2>6. Competitor Tracking</h2>
Bullet points for each relevant competitor with news today: Eaton, Schneider Electric, ABB, Vertiv, nVent. Include product launches, contracts won, partnerships, earnings commentary, or strategic moves.

<h2>7. Implications for Hubbell</h2>
A 150-200 word strategic narrative written for Hubbell sales, product management, and executive teams. Identify specific product categories (e.g. switchgear, connectors, cable management, power distribution units) where today's news creates near-term opportunities or risks. Be direct and actionable.

<h2>8. Quick-Scan Summary</h2>
8-12 bullet points — one crisp sentence each — covering the most important takeaways from today's briefing.

Then append a Hubbell Relevance Chart as an HTML table with columns: Topic | Category | Hubbell Relevance (High/Med/Low) | Key Implication. Include one row per major story or trend from today.

Tone: Executive-ready, concise, strategic.
Length: 800-1000 words of body content.
Citations: Include source name and URL for all factual claims.
Format: Return only the HTML content for the email body — no <html>, <head>, or <body> tags, no markdown, no explanation. Start directly with the first <h2> tag.`;

// ── Fetch briefing from Anthropic ─────────────────────────────────────────────
async function fetchBriefing() {
  console.log("Fetching briefing from Anthropic API...");

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8000,
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 8 }],
    messages: [{ role: "user", content: prompt }],
  });

  console.log(`stop_reason: ${response.stop_reason}`);

  const text = response.content
    .filter(b => b.type === "text")
    .map(b => b.text)
    .join("")
    .trim();

  if (!text) throw new Error("No text in API response.");

  console.log(`Briefing length: ${text.length} characters`);
  return text;
}

// ── Wrap briefing HTML in a full email template ───────────────────────────────
function renderEmail(briefingHtml) {
  const dateStr = new Date().toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Daily Data Center Intelligence Briefing</title>
</head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5;padding:24px 0;">
<tr><td align="center">
<table width="680" cellpadding="0" cellspacing="0" style="max-width:680px;width:100%;background:#ffffff;border-radius:4px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">

  <!-- HEADER -->
  <tr><td style="background:#1a2744;padding:32px 48px;text-align:center;">
    <p style="margin:0 0 4px;font-size:10px;letter-spacing:0.3em;text-transform:uppercase;color:#93a8d0;font-family:monospace;">
      Daily Intelligence Briefing &nbsp;·&nbsp; Data Center Infrastructure
    </p>
    <h1 style="margin:0;font-family:Georgia,serif;font-size:32px;font-weight:700;line-height:1.2;color:#ffffff;">
      Hubbell Data Center Dispatch
    </h1>
    <p style="margin:10px 0 0;font-size:12px;color:#93a8d0;letter-spacing:0.1em;">
      ${dateStr}
    </p>
  </td></tr>

  <!-- LABEL BAR -->
  <tr><td style="background:#c8401a;padding:8px 48px;">
    <p style="margin:0;font-size:10px;letter-spacing:0.25em;text-transform:uppercase;color:#fff;font-family:monospace;">
      Prepared for: Business Development &nbsp;·&nbsp; Hubbell Incorporated
    </p>
  </td></tr>

  <!-- BRIEFING BODY -->
  <tr><td style="padding:36px 48px;color:#1f2937;font-size:14px;line-height:1.7;">
    <style>
      /* Scoped styles for briefing content */
      .briefing h2 {
        font-family: Georgia, serif;
        font-size: 18px;
        font-weight: 700;
        color: #1a2744;
        margin: 32px 0 12px;
        padding-bottom: 6px;
        border-bottom: 2px solid #e5e7eb;
      }
      .briefing h2:first-child { margin-top: 0; }
      .briefing h3 {
        font-size: 14px;
        font-weight: 700;
        color: #111827;
        margin: 16px 0 6px;
      }
      .briefing p {
        margin: 0 0 12px;
        color: #374151;
        font-size: 14px;
        line-height: 1.75;
      }
      .briefing ul {
        margin: 8px 0 16px;
        padding-left: 20px;
      }
      .briefing li {
        margin-bottom: 8px;
        color: #374151;
        font-size: 14px;
        line-height: 1.65;
      }
      .briefing strong { color: #111827; }
      .briefing a {
        color: #c8401a;
        text-decoration: none;
        border-bottom: 1px dotted #c8401a;
      }
      .briefing table {
        width: 100%;
        border-collapse: collapse;
        margin: 16px 0 24px;
        font-size: 13px;
      }
      .briefing table th {
        background: #1a2744;
        color: #ffffff;
        padding: 10px 12px;
        text-align: left;
        font-weight: 600;
        font-size: 12px;
        letter-spacing: 0.05em;
      }
      .briefing table td {
        padding: 9px 12px;
        border-bottom: 1px solid #e5e7eb;
        color: #374151;
        vertical-align: top;
      }
      .briefing table tr:nth-child(even) td { background: #f9fafb; }
      .relevance-high   { color: #166534; font-weight: 700; }
      .relevance-medium { color: #92400e; font-weight: 700; }
      .relevance-low    { color: #6b7280; font-weight: 700; }
    </style>
    <div class="briefing">
      ${briefingHtml}
    </div>
  </td></tr>

  <!-- FOOTER -->
  <tr><td style="background:#f9fafb;padding:20px 48px;border-top:1px solid #e5e7eb;text-align:center;">
    <p style="margin:0;font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:#9ca3af;font-family:monospace;">
      Hubbell Data Center Dispatch &nbsp;·&nbsp; Automated &nbsp;·&nbsp; AI-generated from live web sources<br/>
      For internal business development use only
    </p>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}

// ── Send email ────────────────────────────────────────────────────────────────
async function sendEmail(html) {
  const transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT || "587"),
    secure: SMTP_PORT === "465",
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  await transport.verify();
  console.log("SMTP connection verified.");

  const recipients = TO_EMAILS.split(",").map(e => e.trim()).filter(Boolean);
  const dateStr = new Date().toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric"
  });

  await transport.sendMail({
    from: `"Hubbell Data Center Dispatch" <${FROM_EMAIL}>`,
    to: recipients.join(", "),
    subject: `Data Center Intelligence Briefing — ${dateStr}`,
    html,
  });

  console.log(`Email sent to: ${recipients.join(", ")}`);
}

// ── Run ───────────────────────────────────────────────────────────────────────
try {
  const briefingHtml = await fetchBriefing();
  const email        = renderEmail(briefingHtml);
  await sendEmail(email);
  console.log("Done.");
} catch (err) {
  console.error("ERROR:", err.message);
  process.exit(1);
}
