// newsletter.mjs — runs in GitHub Actions to fetch live data center news
// and send a Hubbell-focused intelligence briefing as a formatted HTML email.

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

Search the web for data center news, analysis, and market signals published within the past 24-48 hours — both U.S. and global. Then produce the following briefing in full.

Create a professionally written Daily Data Center Intelligence Briefing tailored for Business Development at Hubbell Incorporated. Emphasize developments affecting electrical infrastructure, power distribution, grid capacity, switchgear, connectors, cable management, utility-scale power systems, cooling-electrical integration, and construction activity.

Structure the output exactly as follows, using clean Markdown formatting:

# Daily Data Center Intelligence Briefing
**${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}**
*Prepared for: Hubbell Incorporated — Sales, Product Management, Executives & Strategy Teams*

---

## 1. Top Headlines
List 3-7 of the most important stories. For each headline include:
- A one-sentence summary
- Source and publication date
- **Hubbell Relevance:** [High / Medium / Low] — one sentence explaining why it matters to Hubbell

---

## 2. U.S. Market Update
2-3 paragraphs covering the most significant U.S. data center developments: new campus announcements, construction activity, power procurement, permitting, and regional market trends. Cite sources.

---

## 3. International Market Update
2-3 paragraphs covering notable global developments: Europe, Asia-Pacific, Middle East. Focus on trends that may affect U.S. supply chains, competitor positioning, or Hubbell's international business. Cite sources.

---

## 4. Hyperscaler-Specific Activity
Cover each of the following if news is available in the past 24-48 hours: AWS, Microsoft Azure, Google Cloud, Meta, OpenAI / xAI / Oracle / SB Energy, Alibaba / Tencent / Baidu. For each, summarize their latest data center investments, construction, or infrastructure announcements. Cite sources.

---

## 5. Technology & Infrastructure Trends
2-3 paragraphs on emerging trends in data center electrical infrastructure, power density, cooling-electrical integration, AI-driven power demand, grid interconnection challenges, and new product categories. Cite sources.

---

## 6. Competitor Tracking
For each competitor listed below, summarize any news, product launches, partnerships, or contract wins from the past 24-48 hours. If no news is available, state "No significant activity identified."
- **Eaton**
- **Schneider Electric**
- **ABB**
- **Vertiv**
- **nVent**

Cite sources where available.

---

## 7. Implications for Hubbell
3-5 strategic bullet points summarizing what today's news means specifically for Hubbell's business development, product strategy, and sales priorities. Be direct and actionable.

---

## 8. Quick-Scan Summary
A bulleted list of 8-12 key takeaways from today's briefing for executives who need the essential information in under 60 seconds.

---

## Hubbell Relevance Chart
A table summarizing all Top Headlines with their relevance rating and a brief rationale:

| # | Headline | Relevance | Rationale |
|---|----------|-----------|-----------|
| 1 | ... | High/Medium/Low | ... |

---

Tone: Executive-ready, concise, strategic.
Length: 800-1,000 words (excluding the relevance chart and quick-scan).
Citations: Include sources for all factual items drawn from today's search results.
Output the full briefing in clean, well-formatted Markdown. Do not include any text before or after the briefing itself.`;

// ── Fetch briefing from Anthropic ─────────────────────────────────────────────
async function fetchBriefing() {
  console.log("Fetching briefing from Anthropic API...");

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 6000,
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

// ── Convert Markdown to HTML ──────────────────────────────────────────────────
function markdownToHTML(md) {
  let html = md;

  // H1
  html = html.replace(/^# (.+)$/gm,
    '<h1 style="font-family:Georgia,serif;font-size:28px;font-weight:900;color:#0f0f0f;margin:0 0 4px 0;line-height:1.2;">$1</h1>');

  // H2 section headers
  html = html.replace(/^## (.+)$/gm,
    '<h2 style="font-family:Georgia,serif;font-size:17px;font-weight:700;color:#0f0f0f;margin:28px 0 10px 0;padding-top:18px;border-top:2px solid #0f0f0f;">$1</h2>');

  // H3
  html = html.replace(/^### (.+)$/gm,
    '<h3 style="font-family:Georgia,serif;font-size:15px;font-weight:700;color:#0f0f0f;margin:14px 0 6px 0;">$1</h3>');

  // Bold italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');

  // Hubbell Relevance badges (before general bold so we can style them)
  html = html.replace(/\*\*Hubbell Relevance:\*\* High/g,
    '<strong style="color:#0f0f0f;">Hubbell Relevance:</strong> <span style="display:inline-block;background:#166534;color:#fff;padding:1px 8px;border-radius:3px;font-size:11px;font-family:monospace;letter-spacing:0.05em;">HIGH</span>');
  html = html.replace(/\*\*Hubbell Relevance:\*\* Medium/g,
    '<strong style="color:#0f0f0f;">Hubbell Relevance:</strong> <span style="display:inline-block;background:#92400e;color:#fff;padding:1px 8px;border-radius:3px;font-size:11px;font-family:monospace;letter-spacing:0.05em;">MEDIUM</span>');
  html = html.replace(/\*\*Hubbell Relevance:\*\* Low/g,
    '<strong style="color:#0f0f0f;">Hubbell Relevance:</strong> <span style="display:inline-block;background:#374151;color:#fff;padding:1px 8px;border-radius:3px;font-size:11px;font-family:monospace;letter-spacing:0.05em;">LOW</span>');

  // Remaining bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Italic (but not bullet points)
  html = html.replace(/\*([^*\n]+?)\*/g, '<em>$1</em>');

  // Horizontal rule
  html = html.replace(/^---$/gm,
    '<hr style="border:none;border-top:1px solid #d4c9b0;margin:18px 0;"/>');

  // Tables — detect and convert
  const tableRegex = /(\|.+\|\n)((\|[-: ]+\|\n)?)(\|.+\|\n)+/gm;
  html = html.replace(tableRegex, (tableBlock) => {
    const rows = tableBlock.trim().split('\n').filter(r => r.trim());
    let tableHTML = '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:16px 0;font-size:13px;">';
    let isFirst = true;
    for (const row of rows) {
      if (row.match(/^\|[-| :]+\|$/)) continue; // skip separator row
      const cells = row.split('|').filter((_, i, arr) => i > 0 && i < arr.length - 1);
      if (isFirst) {
        tableHTML += '<tr>' + cells.map(c =>
          `<th style="background:#0f0f0f;color:#f5f0e8;font-family:monospace;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;padding:8px 12px;text-align:left;white-space:nowrap;">${c.trim()}</th>`
        ).join('') + '</tr>';
        isFirst = false;
      } else {
        tableHTML += '<tr>' + cells.map((c, i) =>
          `<td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;vertical-align:top;${i === 2 ? 'white-space:nowrap;' : ''}">${c.trim()}</td>`
        ).join('') + '</tr>';
      }
    }
    tableHTML += '</table>';
    return tableHTML;
  });

  // Bullet points
  html = html.replace(/^- (.+)$/gm,
    '<li style="font-size:14px;line-height:1.7;color:#1a1a1a;margin-bottom:5px;padding-left:4px;">$1</li>');

  // Wrap consecutive <li> tags in <ul>
  html = html.replace(/(<li[^>]*>[\s\S]*?<\/li>\n?)+/g,
    '<ul style="margin:8px 0 12px 18px;padding:0;">$&</ul>');

  // Paragraphs — any remaining plain text lines
  html = html.replace(/^(?!<)(?!$)(.+)$/gm,
    '<p style="font-size:14px;line-height:1.75;color:#1a1a1a;margin:0 0 10px 0;font-weight:300;">$1</p>');

  // Remove empty paragraphs
  html = html.replace(/<p[^>]*>\s*<\/p>/g, '');

  return html;
}

// ── Render full HTML email ────────────────────────────────────────────────────
function renderEmail(markdownContent) {
  const dateStr = new Date().toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  });

  const bodyHTML = markdownToHTML(markdownContent);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Daily Data Center Intelligence Briefing</title>
</head>
<body style="margin:0;padding:0;background:#f3ede0;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3ede0;padding:24px 0;">
<tr><td align="center">
<table width="700" cellpadding="0" cellspacing="0" style="max-width:700px;width:100%;background:#f5f0e8;">

  <!-- MASTHEAD -->
  <tr><td style="padding:32px 48px 22px;text-align:center;border-bottom:3px double #0f0f0f;">
    <p style="margin:0 0 8px;font-family:monospace;font-size:10px;letter-spacing:0.3em;text-transform:uppercase;color:#c8401a;">
      Daily Intelligence Briefing &nbsp;·&nbsp; Data Center Market Monitor
    </p>
    <h1 style="margin:0 0 6px;font-family:Georgia,serif;font-size:40px;font-weight:900;line-height:1.1;letter-spacing:-1px;color:#0f0f0f;">
      Data Center<br/><span style="color:#c8401a;">Intelligence Briefing</span>
    </h1>
    <p style="margin:10px 0 4px;font-family:monospace;font-size:10px;letter-spacing:0.2em;color:#6b7280;">
      ${dateStr}
    </p>
    <p style="margin:0;font-family:monospace;font-size:10px;letter-spacing:0.15em;color:#c8401a;text-transform:uppercase;">
      Prepared for Hubbell Incorporated
    </p>
  </td></tr>

  <!-- BODY -->
  <tr><td style="padding:32px 48px 40px;">
    ${bodyHTML}
  </td></tr>

  <!-- FOOTER -->
  <tr><td style="padding:18px 48px;border-top:3px double #0f0f0f;text-align:center;">
    <p style="margin:0;font-family:monospace;font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:#9ca3af;">
      Hubbell Data Center Intelligence Briefing &nbsp;·&nbsp; Automated &nbsp;·&nbsp; AI-generated from live web sources<br/>
      For internal use only &nbsp;·&nbsp; ${dateStr}
    </p>
  </td></tr>

</table>
</td></tr></table>
</body>
</html>`;
}

// ── Send email ────────────────────────────────────────────────────────────────
async function sendEmail(markdownContent, html) {
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
    from: `"Data Center Intelligence Briefing" <${FROM_EMAIL}>`,
    to: recipients.join(", "),
    subject: `Data Center Intelligence Briefing — ${dateStr}`,
    text: markdownContent,
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
