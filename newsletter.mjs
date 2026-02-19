// newsletter.mjs — Daily Data Center Intelligence Briefing for Hubbell Incorporated

import Anthropic from "@anthropic-ai/sdk";
import nodemailer from "nodemailer";

const {
  ANTHROPIC_API_KEY,
  SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS,
  FROM_EMAIL, TO_EMAILS,
} = process.env;

console.log("API key starts with:", ANTHROPIC_API_KEY?.slice(0, 10));

const client = new Anthropic({
  apiKey: ANTHROPIC_API_KEY,
  defaultHeaders: { "anthropic-beta": "web-search-2025-03-05" },
});

// ── Date helpers ──────────────────────────────────────────────────────────────
const today     = new Date();
const twoDaysAgo = new Date(today);
twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

const dateStr   = today.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
const cutoffStr = twoDaysAgo.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

// ── Prompt ────────────────────────────────────────────────────────────────────
const prompt = `Today is ${today.toDateString()}. Only include articles published on or after ${cutoffStr}. Do not use any source older than 48 hours. If a section has no qualifying news, omit it entirely.

You are a senior analyst producing the Daily Data Center Intelligence Briefing for Hubbell Incorporated's Business Development, Sales, and Executive teams. Hubbell sells electrical infrastructure into data centers: power distribution, switchgear, connectors, cable management, wiring devices, and utility-scale power systems. Filter every insight through that commercial lens.

Search the web broadly — run multiple searches across U.S. and international news, hyperscaler announcements, and infrastructure trade press (Data Center Dynamics, DCD, DCK, The Register, Bloomberg, Reuters). Prioritize stories with direct implications for electrical infrastructure spend, construction activity, and power procurement.

Return ONLY a raw JSON object — no markdown, no explanation, no preamble. Use exactly this structure:

{
  "generated_at": "${today.toISOString()}",
  "summary": "2-3 sentence executive overview of today's data center landscape, focused on electrical infrastructure and power trends most relevant to Hubbell",
  "sections": [
    {
      "title": "U.S. Market Pulse",
      "articles": []
    },
    {
      "title": "Hyperscaler Tracker",
      "articles": []
    },
    {
      "title": "Infrastructure & Technology Signals",
      "articles": []
    },
    {
      "title": "Competitor Intelligence",
      "articles": []
    },
    {
      "title": "Hubbell Implications",
      "articles": []
    }
  ]
}

Each article object must follow this shape:
{
  "title": "headline",
  "source": "publication name",
  "published": "exact date e.g. Feb 18, 2026",
  "location": "city or country",
  "category": "one of: Hyperscaler | Colocation | Investment | Policy | Power & Land | Infrastructure | Competitor",
  "summary": "2-3 sentence factual summary focused on electrical infrastructure implications",
  "url": "article URL or null"
}

Guidelines:
- Include 2-4 articles per section where news exists; omit the section entirely if no qualifying news was found
- Hubbell Implications section: 3-5 direct strategic bullets as article objects with title = the implication and summary = supporting rationale, source = "Analysis", url = null
- 60-Second Brief section: 6-8 key takeaways as article objects with title = the takeaway, summary = one supporting sentence, source = "Brief", url = null
- All cited articles must be from the past 48 hours
- Your entire response must be only the JSON object`;

// ── Fetch briefing ────────────────────────────────────────────────────────────
async function fetchBriefing() {
  console.log("Fetching briefing from Anthropic API...");

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 6000,
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 12 }],
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
  if (!briefing.summary || !Array.isArray(briefing.sections)) {
    throw new Error("Response JSON missing required fields.");
  }

  console.log(`Parsed ${briefing.sections.length} sections.`);
  return briefing;
}

// ── Render HTML email ─────────────────────────────────────────────────────────
function renderEmail(briefing) {
  const timeStr = (() => {
    try {
      return new Date(briefing.generated_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    } catch { return ""; }
  })();

  const categoryColors = {
    "hyperscaler":  "#1a56a0",
    "colocation":   "#166534",
    "investment":   "#92400e",
    "policy":       "#6b21a8",
    "power":        "#9f1239",
    "infrastructure": "#0f766e",
    "competitor":   "#c8401a",
  };

  function catColor(cat) {
    if (!cat) return "#374151";
    const lower = cat.toLowerCase();
    for (const [key, color] of Object.entries(categoryColors)) {
      if (lower.includes(key)) return color;
    }
    return "#374151";
  }

  // Render a divider with centered label — matching original style
  function sectionDivider(label, count) {
    const countStr = count ? ` &nbsp;·&nbsp; ${count} ${count === 1 ? "Item" : "Items"}` : "";
    return `
    <tr><td style="padding:28px 48px 0;">
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="border-top:1px solid #0f0f0f;"></td>
        <td style="padding:0 12px;white-space:nowrap;">
          <span style="font-family:monospace;font-size:9px;letter-spacing:0.35em;text-transform:uppercase;color:#6b7280;">
            ${label}${countStr}
          </span>
        </td>
        <td style="border-top:1px solid #0f0f0f;"></td>
      </tr></table>
    </td></tr>`;
  }

  // Render articles for standard sections
  function renderArticles(articles, isImplications = false, isBrief = false) {
    if (!articles || articles.length === 0) return "";

    if (isBrief) {
      // 60-second brief: compact numbered list
      const items = articles.map((a, i) => `
        <tr>
          <td style="padding:10px 0;border-top:1px solid #e5e7eb;vertical-align:top;">
            <table width="100%" cellpadding="0" cellspacing="0"><tr>
              <td style="vertical-align:top;width:28px;">
                <span style="font-family:Georgia,serif;font-size:20px;font-weight:900;color:#e5e7eb;line-height:1;">${String(i + 1).padStart(2, "0")}</span>
              </td>
              <td style="vertical-align:top;padding-left:12px;">
                <p style="margin:0 0 2px;font-size:14px;font-weight:700;color:#111827;font-family:Georgia,serif;line-height:1.3;">${a.title}</p>
                <p style="margin:0;font-size:13px;line-height:1.6;color:#374151;font-weight:300;">${a.summary}</p>
              </td>
            </tr></table>
          </td>
        </tr>`).join("");
      return `<table width="100%" cellpadding="0" cellspacing="0">${items}</table>`;
    }

    if (isImplications) {
      // Implications: styled bullet points
      const items = articles.map(a => `
        <tr>
          <td style="padding:10px 0;border-top:1px solid #e5e7eb;vertical-align:top;">
            <table cellpadding="0" cellspacing="0"><tr>
              <td style="vertical-align:top;padding-right:10px;color:#c8401a;font-size:18px;line-height:1.2;">→</td>
              <td style="vertical-align:top;">
                <p style="margin:0 0 3px;font-size:14px;font-weight:700;color:#111827;font-family:Georgia,serif;line-height:1.3;">${a.title}</p>
                <p style="margin:0;font-size:13px;line-height:1.65;color:#374151;font-weight:300;">${a.summary}</p>
              </td>
            </tr></table>
          </td>
        </tr>`).join("");
      return `<table width="100%" cellpadding="0" cellspacing="0">${items}</table>`;
    }

    // Standard articles — matching original style with large number on right
    const items = articles.map((a, i) => {
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

    return `<table width="100%" cellpadding="0" cellspacing="0">${items}</table>`;
  }

  // Build all sections
  const sectionRows = briefing.sections.map(section => {
    if (!section.articles || section.articles.length === 0) return "";
    const isImplications = section.title.toLowerCase().includes("implication");
    const isBrief = section.title.toLowerCase().includes("brief");
    const articlesHTML = renderArticles(section.articles, isImplications, isBrief);
    return `
      ${sectionDivider(section.title, isImplications || isBrief ? 0 : section.articles.length)}
      <tr><td style="padding:0 48px 8px;">
        ${articlesHTML}
      </td></tr>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>DataCenterIQ — Hubbell Intelligence Briefing</title>
</head>
<body style="margin:0;padding:0;background:#f3ede0;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3ede0;padding:24px 0;">
<tr><td align="center">
<table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#f5f0e8;">

  <!-- MASTHEAD -->
  <tr><td style="padding:32px 48px 20px;text-align:center;border-bottom:3px double #0f0f0f;">
    <p style="margin:0 0 6px;font-family:monospace;font-size:10px;letter-spacing:0.3em;text-transform:uppercase;color:#c8401a;">
      Daily Intelligence Briefing &nbsp;·&nbsp; Data Center Market Monitor
    </p>
    <h1 style="margin:0;font-family:Georgia,serif;font-size:52px;font-weight:900;line-height:1;letter-spacing:-1px;color:#0f0f0f;">
      DataCenter<span style="color:#c8401a;">IQ</span>
    </h1>
    <p style="margin:12px 0 0;font-family:monospace;font-size:10px;letter-spacing:0.2em;color:#6b7280;">
      — ${dateStr} —
    </p>
    <p style="margin:6px 0 0;font-family:monospace;font-size:9px;letter-spacing:0.15em;color:#c8401a;text-transform:uppercase;">
      Prepared for Hubbell Incorporated
    </p>
  </td></tr>

  <!-- EXECUTIVE SUMMARY DIVIDER -->
  <tr><td style="padding:28px 48px 0;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="border-top:1px solid #0f0f0f;"></td>
      <td style="padding:0 12px;white-space:nowrap;">
        <span style="font-family:monospace;font-size:9px;letter-spacing:0.35em;text-transform:uppercase;color:#6b7280;">Executive Summary</span>
      </td>
      <td style="border-top:1px solid #0f0f0f;"></td>
    </tr></table>
  </td></tr>

  <!-- EXECUTIVE SUMMARY -->
  <tr><td style="padding:20px 48px 28px;">
    <div style="border-top:4px solid #0f0f0f;padding-top:18px;">
      <p style="margin:0 0 8px;font-family:monospace;font-size:9px;letter-spacing:0.3em;text-transform:uppercase;color:#c8401a;">
        Today's Overview &nbsp;·&nbsp; Data Center Sector
      </p>
      <h2 style="margin:0 0 10px;font-family:Georgia,serif;font-size:26px;font-weight:700;line-height:1.25;color:#0f0f0f;">
        Data Center Intelligence Report: ${today.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
      </h2>
      <p style="margin:0 0 14px;font-family:monospace;font-size:10px;color:#6b7280;letter-spacing:0.1em;border-left:3px solid #c8401a;padding-left:10px;">
        Generated ${timeStr} &nbsp;·&nbsp; Live Web Sources &nbsp;·&nbsp; Past 48 Hours Only
      </p>
      <p style="margin:0;font-size:15px;line-height:1.8;font-weight:300;color:#1a1a1a;">
        ${briefing.summary}
      </p>
    </div>
  </td></tr>

  <!-- DYNAMIC SECTIONS -->
  ${sectionRows}

  <!-- FOOTER -->
  <tr><td style="padding:18px 48px;border-top:3px double #0f0f0f;text-align:center;">
    <p style="margin:0;font-family:monospace;font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:#9ca3af;">
      DataCenterIQ &nbsp;·&nbsp; Hubbell Incorporated &nbsp;·&nbsp; Automated via Claude AI + Live Web Search<br/>
      For internal use only &nbsp;·&nbsp; ${dateStr}
    </p>
  </td></tr>

</table>
</td></tr></table>
</body>
</html>`;
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
  const subject = `DataCenterIQ — ${today.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

  await transport.sendMail({
    from: `"DataCenterIQ — Hubbell Intelligence" <${FROM_EMAIL}>`,
    to: recipients.join(", "),
    subject,
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

