// newsletter.mjs — runs in GitHub Actions to fetch live data center news
// and send it as a formatted HTML email.

import Anthropic from "@anthropic-ai/sdk";
import nodemailer from "nodemailer";

// ── Config from environment (GitHub Secrets) ──────────────────────────────────
const {
  ANTHROPIC_API_KEY,
  SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS,
  FROM_EMAIL, TO_EMAILS,
} = process.env;

// ── Anthropic client ──────────────────────────────────────────────────────────
const client = new Anthropic({
  apiKey: ANTHROPIC_API_KEY,
  defaultHeaders: { "anthropic-beta": "web-search-2025-03-05" },
});

// ── Prompt ────────────────────────────────────────────────────────────────────
const prompt = `Today is ${new Date().toDateString()}.

You are a professional technology journalist producing the daily US Data Center Dispatch newsletter. Search the web for news articles published in the past 24-48 hours about new data center developments in the United States.

Search for: new campus announcements, construction starts, expansions, investment rounds, hyperscaler projects (AWS, Azure, Google Cloud, Meta, Oracle, Microsoft), colocation facility openings, power purchase agreements, and land acquisitions.

After searching, return ONLY a raw JSON object — no markdown fences, no explanation, no preamble. Use exactly this structure:

{
  "generated_at": "${new Date().toISOString()}",
  "summary": "2-3 sentence executive overview of today's US data center landscape",
  "articles": [
    {
      "title": "headline",
      "source": "publication name",
      "published": "e.g. Feb 18, 2026 or 3 hours ago",
      "location": "US state or city",
      "category": "Hyperscaler or Colocation or Investment or Policy or Power & Land",
      "summary": "3-4 sentence factual summary of the article",
      "url": "article URL or null"
    }
  ]
}

Include 4-8 of the most significant and recent articles. Your entire response must be only the JSON object — nothing else.`;

// ── Fetch briefing from Anthropic ─────────────────────────────────────────────
async function fetchBriefing() {
  console.log("Fetching briefing from Anthropic API...");

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4000,
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
    messages: [{ role: "user", content: prompt }],
  });

  console.log(`stop_reason: ${response.stop_reason}`);

  const text = response.content
    .filter(b => b.type === "text")
    .map(b => b.text)
    .join("")
    .trim();

  if (!text) throw new Error("No text in API response.");

  let s = text.replace(/^```(?:json)?/im, "").replace(/```\s*$/im, "").trim();
  const a = s.indexOf("{");
  const z = s.lastIndexOf("}");
  if (a === -1 || z === -1) throw new Error("No JSON object found in response.");

  const briefing = JSON.parse(s.slice(a, z + 1));
  if (!briefing.summary || !Array.isArray(briefing.articles)) {
    throw new Error("Response JSON missing required fields.");
  }

  console.log(`Parsed ${briefing.articles.length} articles.`);
  return briefing;
}

// ── Render HTML email ─────────────────────────────────────────────────────────
function renderEmail(briefing) {
  const dateStr = new Date().toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  });
  const timeStr = new Date(briefing.generated_at).toLocaleTimeString("en-US", {
    hour: "2-digit", minute: "2-digit"
  });

  const categoryColors = {
    "hyperscaler": "#1a56a0",
    "colocation":  "#166534",
    "investment":  "#92400e",
    "policy":      "#6b21a8",
    "power":       "#9f1239",
  };

  function catColor(cat) {
    if (!cat) return "#374151";
    const lower = cat.toLowerCase();
    for (const [key, color] of Object.entries(categoryColors)) {
      if (lower.includes(key)) return color;
    }
    return "#374151";
  }

  const articleRows = briefing.articles.map((a, i) => {
    const color = catColor(a.category);
    const source = a.url
      ? `<a href="${a.url}" style="color:#4b5563;font-size:11px;font-family:monospace;text-decoration:none;border-bottom:1px dotted #9ca3af;">${a.source} ↗</a>`
      : `<span style="color:#9ca3af;font-size:11px;font-family:monospace;">${a.source}</span>`;

    return `
    <tr>
      <td style="padding:22px 0;border-top:1px solid #e5e7eb;vertical-align:top;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="vertical-align:top;padding-right:16px;">
            <p style="margin:0 0 6px;font-family:monospace;font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:${color};">
              ${a.category || ""} &nbsp;·&nbsp; ${a.location || ""} &nbsp;·&nbsp; ${a.published || ""}
            </p>
            <h3 style="margin:0 0 8px;font-family:Georgia,serif;font-size:18px;font-weight:700;line-height:1.3;color:#111827;">
              ${a.title}
            </h3>
            <p style="margin:0 0 10px;font-size:14px;line-height:1.7;color:#374151;font-weight:300;">
              ${a.summary}
            </p>
            ${source}
          </td>
          <td style="vertical-align:top;text-align:right;padding-left:8px;white-space:nowrap;">
            <span style="font-family:Georgia,serif;font-size:42px;font-weight:900;color:#e5e7eb;line-height:1;">
              ${String(i + 1).padStart(2, "0")}
            </span>
          </td>
        </tr></table>
      </td>
    </tr>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>The DataCenter Dispatch</title></head>
<body style="margin:0;padding:0;background:#f3ede0;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3ede0;padding:24px 0;">
<tr><td align="center">
<table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#f5f0e8;">

  <!-- MASTHEAD -->
  <tr><td style="padding:32px 48px 20px;text-align:center;border-bottom:3px double #0f0f0f;">
    <p style="margin:0 0 6px;font-family:monospace;font-size:10px;letter-spacing:0.3em;text-transform:uppercase;color:#c8401a;">
      Automated Intelligence Briefing &nbsp;·&nbsp; U.S. Data Center Monitor
    </p>
    <h1 style="margin:0;font-family:Georgia,serif;font-size:52px;font-weight:900;line-height:1;letter-spacing:-1px;color:#0f0f0f;">
      The Data<span style="color:#c8401a;">Center</span> Dispatch
    </h1>
    <p style="margin:12px 0 0;font-family:monospace;font-size:10px;letter-spacing:0.2em;color:#6b7280;">
      — ${dateStr} —
    </p>
  </td></tr>

  <!-- SUMMARY DIVIDER -->
  <tr><td style="padding:28px 48px 0;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="border-top:1px solid #0f0f0f;"></td>
      <td style="padding:0 12px;white-space:nowrap;">
        <span style="font-family:monospace;font-size:9px;letter-spacing:0.35em;text-transform:uppercase;color:#6b7280;">Executive Summary</span>
      </td>
      <td style="border-top:1px solid #0f0f0f;"></td>
    </tr></table>
  </td></tr>

  <!-- SUMMARY -->
  <tr><td style="padding:20px 48px 28px;">
    <div style="border-top:4px solid #0f0f0f;padding-top:18px;">
      <p style="margin:0 0 8px;font-family:monospace;font-size:9px;letter-spacing:0.3em;text-transform:uppercase;color:#c8401a;">
        Today's Overview &nbsp;·&nbsp; U.S. Data Center Sector
      </p>
      <h2 style="margin:0 0 10px;font-family:Georgia,serif;font-size:26px;font-weight:700;line-height:1.25;color:#0f0f0f;">
        Data Center Investment Activity: 24-Hour Intelligence Report
      </h2>
      <p style="margin:0 0 14px;font-family:monospace;font-size:10px;color:#6b7280;letter-spacing:0.1em;border-left:3px solid #c8401a;padding-left:10px;">
        Generated ${timeStr} &nbsp;·&nbsp; Live Web Sources
      </p>
      <p style="margin:0;font-size:15px;line-height:1.8;font-weight:300;color:#1a1a1a;">
        ${briefing.summary}
      </p>
    </div>
  </td></tr>

  <!-- ARTICLES DIVIDER -->
  <tr><td style="padding:0 48px;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="border-top:1px solid #0f0f0f;"></td>
      <td style="padding:0 12px;white-space:nowrap;">
        <span style="font-family:monospace;font-size:9px;letter-spacing:0.35em;text-transform:uppercase;color:#6b7280;">
          Developing Stories &nbsp;·&nbsp; ${briefing.articles.length} Reports
        </span>
      </td>
      <td style="border-top:1px solid #0f0f0f;"></td>
    </tr></table>
  </td></tr>

  <!-- ARTICLES -->
  <tr><td style="padding:0 48px 32px;">
    <table width="100%" cellpadding="0" cellspacing="0">${articleRows}</table>
  </td></tr>

  <!-- FOOTER -->
  <tr><td style="padding:18px 48px;border-top:3px double #0f0f0f;text-align:center;">
    <p style="margin:0;font-family:monospace;font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:#9ca3af;">
      The DataCenter Dispatch &nbsp;·&nbsp; Automated &nbsp;·&nbsp; AI-generated summaries from live web sources<br/>
      For informational purposes only
    </p>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}

// ── Send email ────────────────────────────────────────────────────────────────
async function sendEmail(briefing, html) {
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
    from: `"The DataCenter Dispatch" <${FROM_EMAIL}>`,
    to: recipients.join(", "),
    subject: `The DataCenter Dispatch — ${dateStr} · ${briefing.articles.length} Stories`,
    html,
  });

  console.log(`Email sent to: ${recipients.join(", ")}`);
}

// ── Run ───────────────────────────────────────────────────────────────────────
try {
  const briefing = await fetchBriefing();
  const html     = renderEmail(briefing);
  await sendEmail(briefing, html);
  console.log("Done.");
} catch (err) {
  console.error("ERROR:", err.message);
  process.exit(1);
}
