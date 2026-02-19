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
const today      = new Date();
const twoDaysAgo = new Date(today);
twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

const dateStr    = today.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
const cutoffStr  = twoDaysAgo.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

// ── Refined prompt ────────────────────────────────────────────────────────────
const prompt = `Today is ${today.toDateString()}. Your cutoff is ${cutoffStr} — do not cite any article published before that date. If a section has no qualifying news, omit it entirely rather than noting the absence.

You are a senior analyst producing the Daily Data Center Intelligence Briefing for Hubbell Incorporated's Business Development, Sales, and Executive teams. Hubbell sells electrical infrastructure into data centers: power distribution units, switchgear, connectors, cable management, wiring devices, and utility-scale power systems. Every insight should be filtered through that commercial lens.

Search the web broadly — run multiple searches across U.S. news, international news, hyperscaler announcements, infrastructure trade press (Data Center Dynamics, DCD, DCK, The Register, Bloomberg, Reuters), and competitor newsrooms. Prioritize stories with direct implications for electrical infrastructure spend, construction activity, and power procurement.

Produce the briefing in clean Markdown using the structure below. Write with executive economy: tight bullets, no filler, no repetition. Include the publication date and a clickable Markdown link for every cited source.

---

# Daily Data Center Intelligence Briefing
**${dateStr}**
*Hubbell Incorporated — Business Development Intelligence*

---

## Top Headlines
For each story (aim for 4–6):
- **[Headline]** ([Publication], [Date]) — [one crisp sentence on what happened]. [Read more →](URL)
  - *Hubbell Signal:* **High / Medium / Low** — [one sentence on the specific commercial implication for Hubbell]

---

## U.S. Market Pulse
Three to five bullets on the most actionable U.S. developments — new campuses, construction starts, power procurement deals, permitting milestones, and regional capacity trends. Focus on projects large enough to drive electrical infrastructure spend. Cite each bullet.

---

## Global Watch
Two to four bullets on international developments most likely to affect U.S. supply chains, competitor positioning, or Hubbell's export markets. Omit this section if nothing relevant was published in the window.

---

## Hyperscaler Tracker
One tight bullet per hyperscaler with confirmed news in the window. Include spend figures, MW capacity, or location where reported. Skip any hyperscaler with no qualifying news.
- **AWS:**
- **Microsoft Azure:**
- **Google Cloud:**
- **Meta:**
- **Oracle / OpenAI / xAI:**

---

## Infrastructure & Technology Signals
Two to four bullets on power density trends, cooling-electrical integration, grid interconnection developments, AI-driven load growth, and emerging product categories relevant to Hubbell's portfolio. Cite each bullet.

---

## Competitor Intelligence
One bullet per competitor with news in the window — product launches, contract wins, partnerships, or strategic moves. Skip any competitor with no qualifying news.
- **Eaton:**
- **Schneider Electric:**
- **Vertiv:**
- **ABB:**
- **nVent:**

---

## Hubbell Implications
Three to five direct, actionable bullets for Hubbell's BD and sales teams based on today's news. Tie each implication to a specific story or trend from above. Be blunt and commercial.

---

## 60-Second Brief
Eight to ten bullets — the absolute essentials for an executive who has one minute. Start each with a bolded topic label.

---

Tone: Direct, analytical, executive-ready. No hedging, no preamble, no summary of what you are about to say.
Output only the briefing. Nothing before the opening # heading, nothing after the last bullet.`;

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
  console.log(`Briefing length: ${text.length} characters`);
  return text;
}

// ── Markdown → HTML ───────────────────────────────────────────────────────────
function markdownToHTML(md) {
  let h = md;

  // Headings
  h = h.replace(/^# (.+)$/gm, (_, t) =>
    `<h1 style="font-family:'Playfair Display',Georgia,serif;font-size:30px;font-weight:900;color:#0f0f0f;margin:0 0 4px;line-height:1.15;letter-spacing:-0.5px;">${t}</h1>`);

  h = h.replace(/^## (.+)$/gm, (_, t) =>
    `<table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0 12px;"><tr>
      <td style="border-top:2px solid #0f0f0f;width:18px;padding-top:5px;"></td>
      <td style="padding:0 10px;white-space:nowrap;">
        <span style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:9px;font-weight:700;letter-spacing:0.35em;text-transform:uppercase;color:#c8401a;">${t}</span>
      </td>
      <td style="border-top:2px solid #0f0f0f;padding-top:5px;"></td>
    </tr></table>`);

  h = h.replace(/^### (.+)$/gm, (_, t) =>
    `<h3 style="font-family:'Playfair Display',Georgia,serif;font-size:14px;font-weight:700;color:#0f0f0f;margin:14px 0 5px;">${t}</h3>`);

  // Bold italic
  h = h.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');

  // Hubbell Signal badges — before general bold
  h = h.replace(/\*Hubbell Signal:\*\s*\*\*High\*\*/gi,
    `<span style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:10px;font-style:normal;">⬆ <strong>Hubbell Signal:</strong> <span style="background:#166534;color:#fff;padding:1px 7px;border-radius:2px;font-size:10px;font-weight:600;letter-spacing:0.04em;">HIGH</span></span>`);
  h = h.replace(/\*Hubbell Signal:\*\s*\*\*Medium\*\*/gi,
    `<span style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:10px;font-style:normal;">◆ <strong>Hubbell Signal:</strong> <span style="background:#92400e;color:#fff;padding:1px 7px;border-radius:2px;font-size:10px;font-weight:600;letter-spacing:0.04em;">MEDIUM</span></span>`);
  h = h.replace(/\*Hubbell Signal:\*\s*\*\*Low\*\*/gi,
    `<span style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:10px;font-style:normal;">▸ <strong>Hubbell Signal:</strong> <span style="background:#374151;color:#fff;padding:1px 7px;border-radius:2px;font-size:10px;font-weight:600;letter-spacing:0.04em;">LOW</span></span>`);

  // Also handle inline High/Medium/Low without the italic wrapper
  h = h.replace(/\*\*Hubbell Signal:\*\*\s*High/gi,
    `<span style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:10px;">⬆ <strong>Hubbell Signal:</strong> <span style="background:#166534;color:#fff;padding:1px 7px;border-radius:2px;font-size:10px;font-weight:600;">HIGH</span></span>`);
  h = h.replace(/\*\*Hubbell Signal:\*\*\s*Medium/gi,
    `<span style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:10px;">◆ <strong>Hubbell Signal:</strong> <span style="background:#92400e;color:#fff;padding:1px 7px;border-radius:2px;font-size:10px;font-weight:600;">MEDIUM</span></span>`);
  h = h.replace(/\*\*Hubbell Signal:\*\*\s*Low/gi,
    `<span style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:10px;">▸ <strong>Hubbell Signal:</strong> <span style="background:#374151;color:#fff;padding:1px 7px;border-radius:2px;font-size:10px;font-weight:600;">LOW</span></span>`);

  // Markdown links → HTML
  h = h.replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g,
    `<a href="$2" style="color:#c8401a;font-family:Georgia,serif;text-decoration:none;border-bottom:1px solid rgba(200,64,26,0.35);" target="_blank">$1</a>`);

  // Bold
  h = h.replace(/\*\*(.+?)\*\*/g,
    `<strong style="font-family:Georgia,serif;color:#0f0f0f;">$1</strong>`);

  // Italic
  h = h.replace(/\*([^*\n]+?)\*/g, '<em style="color:#4b5563;">$1</em>');

  // Horizontal rules
  h = h.replace(/^---$/gm,
    '<hr style="border:none;border-top:1px solid #d4c9b0;margin:16px 0;"/>');

  // Bullet points — top-level headlines get special treatment
  // First pass: nested bullets (sub-items starting with spaces)
  h = h.replace(/^  - (.+)$/gm,
    `<li style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:12px;line-height:1.65;color:#4b5563;margin:5px 0 5px 0;padding-left:2px;list-style:none;border-left:2px solid #e5e7eb;padding-left:10px;">$1</li>`);

  // Top-level bullets
  h = h.replace(/^- (.+)$/gm,
    `<li style="font-family:Georgia,serif;font-size:14px;line-height:1.75;color:#1a1a1a;margin-bottom:8px;padding-left:2px;">$1</li>`);

  // Wrap nested <li> (with border-left) in a sub-ul
  h = h.replace(/(<li[^>]*border-left[^>]*>[\s\S]*?<\/li>\n?)+/g,
    '<ul style="margin:4px 0 8px 0;padding:0;list-style:none;">$&</ul>');

  // Wrap remaining <li> in <ul>
  h = h.replace(/(<li[^>]*font-family:Georgia[^>]*>[\s\S]*?<\/li>\n?)+/g,
    '<ul style="margin:8px 0 14px 16px;padding:0;">$&</ul>');

  // Paragraphs
  h = h.replace(/^(?!<)(?!$)(.+)$/gm,
    `<p style="font-family:Georgia,serif;font-size:14px;line-height:1.75;color:#1a1a1a;margin:0 0 10px;">$1</p>`);

  // Clean empty paragraphs
  h = h.replace(/<p[^>]*>\s*<\/p>/g, '');

  return h;
}

// ── Render full email ─────────────────────────────────────────────────────────
function renderEmail(markdown) {
  const body = markdownToHTML(markdown);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Data Center Intelligence Briefing — ${dateStr}</title>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;900&display=swap" rel="stylesheet"/>
</head>
<body style="margin:0;padding:0;background:#ede8dc;font-family:Georgia,serif;">

<table width="100%" cellpadding="0" cellspacing="0" style="background:#ede8dc;padding:28px 0;">
<tr><td align="center">
<table width="680" cellpadding="0" cellspacing="0" style="max-width:680px;width:100%;background:#f5f0e8;border:1px solid #c9bfaa;">

  <!-- TOP RULE -->
  <tr><td style="padding:0 44px;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="height:4px;background:#0f0f0f;"></td>
    </tr></table>
  </td></tr>

  <!-- MASTHEAD -->
  <tr><td style="padding:28px 44px 22px;text-align:center;background:#f5f0e8;border-bottom:3px double #0f0f0f;">
    <p style="margin:0 0 8px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:9px;font-weight:700;letter-spacing:0.4em;text-transform:uppercase;color:#c8401a;">
      Daily Intelligence Briefing &nbsp;·&nbsp; Data Center Market Monitor
    </p>
    <h1 style="margin:0;font-family:'Playfair Display',Georgia,serif;font-size:48px;font-weight:900;line-height:1;letter-spacing:-1.5px;color:#0f0f0f;">
      DataCenter<span style="color:#c8401a;">IQ</span>
    </h1>
    <p style="margin:10px 0 0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:9px;letter-spacing:0.25em;color:#6b7280;text-transform:uppercase;">
      ${dateStr}
    </p>
    <!-- Decorative rule with label -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;"><tr>
      <td style="border-top:1px solid #c9bfaa;"></td>
      <td style="padding:0 12px;white-space:nowrap;">
        <span style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:8px;letter-spacing:0.3em;text-transform:uppercase;color:#9ca3af;">
          Prepared exclusively for Hubbell Incorporated
        </span>
      </td>
      <td style="border-top:1px solid #c9bfaa;"></td>
    </tr></table>
  </td></tr>

  <!-- BODY -->
  <tr><td style="padding:30px 44px 36px;background:#f5f0e8;">
    ${body}
  </td></tr>

  <!-- FOOTER -->
  <tr><td style="padding:16px 44px 20px;border-top:3px double #0f0f0f;text-align:center;background:#f5f0e8;">
    <p style="margin:0 0 4px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:8px;letter-spacing:0.25em;text-transform:uppercase;color:#9ca3af;">
      DataCenterIQ &nbsp;·&nbsp; Automated via Claude AI + Live Web Search
    </p>
    <p style="margin:0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:8px;letter-spacing:0.2em;text-transform:uppercase;color:#c9bfaa;">
      For internal use only &nbsp;·&nbsp; ${dateStr}
    </p>
  </td></tr>

  <!-- BOTTOM RULE -->
  <tr><td style="padding:0 44px;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="height:4px;background:#c8401a;"></td>
    </tr></table>
  </td></tr>

</table>
</td></tr></table>

</body>
</html>`;
}

// ── Send email ────────────────────────────────────────────────────────────────
async function sendEmail(markdown, html) {
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
    text: markdown,
    html,
  });

  console.log(`Email sent to: ${recipients.join(", ")}`);
}

// ── Run ───────────────────────────────────────────────────────────────────────
try {
  const markdown = await fetchBriefing();
  const html     = renderEmail(markdown);
  await sendEmail(markdown, html);
  console.log("Done.");
} catch (err) {
  console.error("ERROR:", err.message);
  process.exit(1);
}
