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

// ── Prompt ────────────────────────────────────────────────────────────────────
const today = new Date();
const yesterday = new Date(today);
yesterday.setDate(yesterday.getDate() - 1);
const twoDaysAgo = new Date(today);
twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

const dateStr = today.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
const cutoffStr = twoDaysAgo.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

const prompt = `Today is ${today.toDateString()}.

CRITICAL INSTRUCTION: Only include news articles published on or after ${cutoffStr}. Do not include any article older than 48 hours from today. If you cannot find a recent article for a section, write "No developments published in the past 48 hours" for that section rather than using older articles.

Search the web thoroughly for data center news published in the past 48 hours — U.S. and global. Then write the following briefing.

Produce a Daily Data Center Intelligence Briefing for Hubbell Incorporated's Business Development team. Focus on electrical infrastructure, power distribution, grid capacity, switchgear, connectors, cable management, utility-scale power, cooling-electrical integration, and construction activity.

FORMATTING RULES — follow these exactly:
- Use consistent Georgia serif font for all headings
- Use clean bullet points for all lists — no dense paragraphs
- Every cited fact must include a clickable Markdown hyperlink: [Source Name](URL)
- Keep the total briefing to 600-800 words (excluding the relevance chart)
- Be concise — one or two bullets per point, no filler sentences

Use exactly this structure:

# Daily Data Center Intelligence Briefing
**${dateStr}**
*Prepared for: Hubbell Incorporated — Business Development*

---

## 1. Top Headlines
For each headline (3-5 only):
- **[Headline title]** — one sentence summary. [Source](URL) — Published: [exact date]
  - **Hubbell Relevance:** High / Medium / Low — one sentence on why it matters

---

## 2. U.S. Market Update
- Bullet 1 with key development. [Source](URL)
- Bullet 2 with key development. [Source](URL)
- Bullet 3 with key development. [Source](URL)

---

## 3. International Market Update
- Bullet 1. [Source](URL)
- Bullet 2. [Source](URL)

---

## 4. Hyperscaler Activity
Only include hyperscalers with news published in the past 48 hours:
- **AWS:** [one bullet]. [Source](URL)
- **Microsoft Azure:** [one bullet]. [Source](URL)
- **Google Cloud:** [one bullet]. [Source](URL)
- **Meta:** [one bullet]. [Source](URL)
- **Other (OpenAI/Oracle/xAI):** [one bullet if relevant]. [Source](URL)

---

## 5. Technology & Infrastructure Trends
- Bullet 1. [Source](URL)
- Bullet 2. [Source](URL)
- Bullet 3. [Source](URL)

---

## 6. Competitor Tracking
Only include competitors with news in the past 48 hours. If none, write "No significant activity identified."
- **Eaton:** [one bullet or "No significant activity identified"]
- **Schneider Electric:** [one bullet or "No significant activity identified"]
- **ABB:** [one bullet or "No significant activity identified"]
- **Vertiv:** [one bullet or "No significant activity identified"]
- **nVent:** [one bullet or "No significant activity identified"]

---

## 7. Implications for Hubbell
- [Actionable strategic implication 1]
- [Actionable strategic implication 2]
- [Actionable strategic implication 3]

---

## 8. Quick-Scan Summary
- [Key takeaway 1]
- [Key takeaway 2]
- [Key takeaway 3]
- [Key takeaway 4]
- [Key takeaway 5]
- [Key takeaway 6]

---

## Hubbell Relevance Chart

| # | Headline | Relevance | Rationale |
|---|----------|-----------|-----------|
| 1 | [title] | High/Medium/Low | [one sentence] |

Output only the briefing. No text before or after it.`;

// ── Fetch briefing ────────────────────────────────────────────────────────────
async function fetchBriefing() {
  console.log("Fetching briefing from Anthropic API...");

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 6000,
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 10 }],
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
  h = h.replace(/^# (.+)$/gm,
    '<h1 style="font-family:Georgia,serif;font-size:26px;font-weight:900;color:#0f0f0f;margin:0 0 6px;line-height:1.2;">$1</h1>');
  h = h.replace(/^## (.+)$/gm,
    '<h2 style="font-family:Georgia,serif;font-size:16px;font-weight:700;color:#0f0f0f;margin:26px 0 10px;padding-top:16px;border-top:2px solid #0f0f0f;">$1</h2>');
  h = h.replace(/^### (.+)$/gm,
    '<h3 style="font-family:Georgia,serif;font-size:14px;font-weight:700;color:#0f0f0f;margin:12px 0 6px;">$1</h3>');

  // Bold italic
  h = h.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');

  // Relevance badges — must come before general bold replacement
  h = h.replace(/\*\*Hubbell Relevance:\*\*\s*High/gi,
    '<strong style="font-family:Georgia,serif;color:#0f0f0f;">Hubbell Relevance:</strong> <span style="display:inline-block;background:#166534;color:#fff;padding:1px 7px;border-radius:3px;font-size:10px;font-family:\'Helvetica Neue\',Arial,sans-serif;letter-spacing:0.05em;font-weight:600;">HIGH</span>');
  h = h.replace(/\*\*Hubbell Relevance:\*\*\s*Medium/gi,
    '<strong style="font-family:Georgia,serif;color:#0f0f0f;">Hubbell Relevance:</strong> <span style="display:inline-block;background:#92400e;color:#fff;padding:1px 7px;border-radius:3px;font-size:10px;font-family:\'Helvetica Neue\',Arial,sans-serif;letter-spacing:0.05em;font-weight:600;">MEDIUM</span>');
  h = h.replace(/\*\*Hubbell Relevance:\*\*\s*Low/gi,
    '<strong style="font-family:Georgia,serif;color:#0f0f0f;">Hubbell Relevance:</strong> <span style="display:inline-block;background:#374151;color:#fff;padding:1px 7px;border-radius:3px;font-size:10px;font-family:\'Helvetica Neue\',Arial,sans-serif;letter-spacing:0.05em;font-weight:600;">LOW</span>');

  // Relevance chart badge colors
  h = h.replace(/\bHigh\b(?=\s*<\/td>)/g,
    '<span style="display:inline-block;background:#166534;color:#fff;padding:1px 7px;border-radius:3px;font-size:10px;font-weight:600;">High</span>');
  h = h.replace(/\bMedium\b(?=\s*<\/td>)/g,
    '<span style="display:inline-block;background:#92400e;color:#fff;padding:1px 7px;border-radius:3px;font-size:10px;font-weight:600;">Medium</span>');
  h = h.replace(/\bLow\b(?=\s*<\/td>)/g,
    '<span style="display:inline-block;background:#374151;color:#fff;padding:1px 7px;border-radius:3px;font-size:10px;font-weight:600;">Low</span>');

  // Markdown links → HTML links
  h = h.replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g,
    '<a href="$2" style="color:#c8401a;font-family:Georgia,serif;text-decoration:none;border-bottom:1px solid #c8401a;" target="_blank">$1</a>');

  // Bold
  h = h.replace(/\*\*(.+?)\*\*/g,
    '<strong style="font-family:Georgia,serif;">$1</strong>');

  // Italic
  h = h.replace(/\*([^*\n]+?)\*/g, '<em>$1</em>');

  // Horizontal rule
  h = h.replace(/^---$/gm,
    '<hr style="border:none;border-top:1px solid #d4c9b0;margin:16px 0;"/>');

  // Tables
  const tableRegex = /(\|.+\|\n)((\|[-: ]+\|\n))(\|.+\|\n)*/gm;
  h = h.replace(tableRegex, (block) => {
    const rows = block.trim().split('\n').filter(r => r.trim());
    let out = '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:14px 0;font-family:Georgia,serif;">';
    let first = true;
    for (const row of rows) {
      if (/^\|[-| :]+\|$/.test(row.trim())) continue;
      const cells = row.split('|').slice(1, -1);
      if (first) {
        out += '<tr>' + cells.map(c =>
          `<th style="background:#0f0f0f;color:#f5f0e8;font-family:'Helvetica Neue',Arial,sans-serif;font-size:10px;letter-spacing:0.1em;text-transform:uppercase;padding:8px 12px;text-align:left;">${c.trim()}</th>`
        ).join('') + '</tr>';
        first = false;
      } else {
        out += '<tr>' + cells.map(c =>
          `<td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-family:Georgia,serif;font-size:13px;vertical-align:top;color:#1a1a1a;">${c.trim()}</td>`
        ).join('') + '</tr>';
      }
    }
    return out + '</table>';
  });

  // Bullet points
  h = h.replace(/^- (.+)$/gm,
    '<li style="font-family:Georgia,serif;font-size:14px;line-height:1.75;color:#1a1a1a;margin-bottom:6px;padding-left:2px;">$1</li>');

  // Wrap <li> in <ul>
  h = h.replace(/(<li[\s\S]*?<\/li>\n?)+/g,
    '<ul style="margin:8px 0 14px 20px;padding:0;">$&</ul>');

  // Paragraphs
  h = h.replace(/^(?!<)(?!$)(.+)$/gm,
    '<p style="font-family:Georgia,serif;font-size:14px;line-height:1.75;color:#1a1a1a;margin:0 0 10px;font-weight:400;">$1</p>');

  // Clean empty paragraphs
  h = h.replace(/<p[^>]*>\s*<\/p>/g, '');

  return h;
}

// ── Render HTML email ─────────────────────────────────────────────────────────
function renderEmail(markdown) {
  const body = markdownToHTML(markdown);
  const dateLabel = today.toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Data Center Intelligence Briefing — ${dateLabel}</title>
</head>
<body style="margin:0;padding:0;background:#f0ebe0;font-family:Georgia,serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0ebe0;padding:24px 0;">
<tr><td align="center">
<table width="680" cellpadding="0" cellspacing="0" style="max-width:680px;width:100%;background:#faf6ee;border:1px solid #d4c9b0;">

  <!-- MASTHEAD -->
  <tr><td style="padding:30px 44px 20px;text-align:center;border-bottom:3px double #0f0f0f;background:#faf6ee;">
    <p style="margin:0 0 6px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:9px;letter-spacing:0.35em;text-transform:uppercase;color:#c8401a;">
      Daily Intelligence Briefing &nbsp;·&nbsp; Data Center Market Monitor
    </p>
    <h1 style="margin:0 0 6px;font-family:Georgia,serif;font-size:36px;font-weight:900;line-height:1.1;color:#0f0f0f;">
      Data Center<br/><span style="color:#c8401a;">Intelligence Briefing</span>
    </h1>
    <p style="margin:8px 0 2px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:9px;letter-spacing:0.2em;color:#6b7280;text-transform:uppercase;">
      ${dateLabel}
    </p>
    <p style="margin:0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:9px;letter-spacing:0.15em;color:#c8401a;text-transform:uppercase;">
      Prepared for Hubbell Incorporated
    </p>
  </td></tr>

  <!-- BODY -->
  <tr><td style="padding:28px 44px 36px;background:#faf6ee;">
    ${body}
  </td></tr>

  <!-- FOOTER -->
  <tr><td style="padding:16px 44px;border-top:3px double #0f0f0f;text-align:center;background:#faf6ee;">
    <p style="margin:0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:#9ca3af;">
      Hubbell Data Center Intelligence Briefing &nbsp;·&nbsp; Automated via Claude AI &nbsp;·&nbsp; Live Web Sources<br/>
      For internal use only &nbsp;·&nbsp; ${dateLabel}
    </p>
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
  const subject = `Data Center Intelligence Briefing — ${today.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

  await transport.sendMail({
    from: `"Data Center Intelligence Briefing" <${FROM_EMAIL}>`,
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

