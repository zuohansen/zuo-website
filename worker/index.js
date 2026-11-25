// Zuo Property Management website: serves the page and receives the contact form.
//
// Cloudflare runs this script for any address that isn't a file in the site, so the page itself is served
// straight from the files. The form posts to /api/contact. Each lead is saved to the database first, then
// emailed, so a failed email never loses a lead.
//
// Settings, set in Cloudflare and never written in this public file:
//   LEAD_TO   the email address that receives new leads (a secret)
// Bindings, set in wrangler.jsonc:
//   DB          the database that keeps the leads
//   LEAD_EMAIL  Cloudflare's email sender, which only sends to addresses confirmed in Email Routing
//   ASSETS      the site's files

import { EmailMessage } from "cloudflare:email";

const FROM = "leads@zuopropertymanagement.com";

// Longest value each field may hold, and which fields must be filled.
const LIMITS = {
  first_name: 80, last_name: 80, street: 200, unit: 60, city: 100, state: 40,
  zip: 10, email: 200, phone: 40, units: 4, notes: 2000,
};
const REQUIRED = ["first_name", "last_name", "street", "city", "state", "zip", "email", "phone"];
const UNITS = ["", "1", "2", "3", "4", "5+"];

// Short links for each outreach channel. Each one opens the home page with tags that analytics reads, so you can
// see which channel each visitor came from. To add a channel, add a line here.
const CHANNELS = {
  "/letter": "utm_source=letter&utm_medium=mail",
  "/realtor": "utm_source=realtor&utm_medium=referral",
  "/friend": "utm_source=network&utm_medium=referral",
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const channel = CHANNELS[url.pathname.replace(/\/+$/, "").toLowerCase()];
    if (channel) return Response.redirect(`${url.origin}/?${channel}`, 302);
    if (url.pathname === "/api/contact") {
      if (request.method !== "POST") return reply({ ok: false, error: "Use POST." }, 405);
      return contact(request, env, ctx);
    }
    return env.ASSETS.fetch(request);
  },
};

async function contact(request, env, ctx) {
  // Only accept forms sent from this site.
  const origin = request.headers.get("Origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) {
    return reply({ ok: false, error: "Wrong site." }, 403);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return reply({ ok: false, error: "Send the form as JSON." }, 400);
  }

  // Spam check: people never see the "company_website" box, so only bots fill it in. Bots also tend to
  // submit within a second or two of the page loading. Either way, answer as if it worked and save nothing.
  const elapsed = Number(body.elapsed_ms);
  if (String(body.company_website || "").trim() || !(elapsed >= 3000)) {
    return reply({ ok: true });
  }

  const lead = {};
  for (const [name, max] of Object.entries(LIMITS)) {
    lead[name] = String(body[name] ?? "").trim().slice(0, max);
  }

  const problems = REQUIRED.filter((name) => !lead[name]);
  if (lead.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) problems.push("email");
  if (lead.phone && lead.phone.replace(/\D/g, "").length < 10) problems.push("phone");
  if (lead.zip && !/^\d{5}(-\d{4})?$/.test(lead.zip)) problems.push("zip");
  if (!UNITS.includes(lead.units)) problems.push("units");
  if (problems.length) return reply({ ok: false, error: "Some details need fixing.", fields: problems }, 400);

  const saved = await env.DB.prepare(
    `INSERT INTO leads (first_name, last_name, street, unit, city, state, zip, email, phone, units, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`
  ).bind(
    lead.first_name, lead.last_name, lead.street, lead.unit, lead.city, lead.state, lead.zip,
    lead.email, lead.phone, lead.units, lead.notes
  ).first();

  // Email in the background, so the owner sees "Thanks" right away.
  if (env.LEAD_EMAIL && env.LEAD_TO) ctx.waitUntil(notify(env, saved.id, lead));

  return reply({ ok: true });
}

async function notify(env, id, lead) {
  const address = [lead.street, lead.unit, `${lead.city}, ${lead.state} ${lead.zip}`].filter(Boolean).join(", ");
  const text = [
    `New lead #${id} from the website.`,
    "",
    `Name: ${lead.first_name} ${lead.last_name}`,
    `Property: ${address}`,
    `Units: ${lead.units || "not given"}`,
    `Email: ${lead.email}`,
    `Phone: ${lead.phone}`,
    "",
    "Anything else:",
    lead.notes || "(nothing)",
    "",
    "Reply to this email to answer the owner directly.",
  ].join("\n");

  const subject = `New lead: ${lead.first_name} ${lead.last_name}, ${lead.city}, ${lead.state}`;
  const raw = [
    `From: Zuo website <${FROM}>`,
    `To: <${env.LEAD_TO}>`,
    `Reply-To: <${lead.email}>`,
    `Subject: ${encodeHeader(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <lead-${id}-${Date.now()}@zuopropertymanagement.com>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64(text).replace(/.{76}/g, "$&\r\n"),
  ].join("\r\n");

  try {
    await env.LEAD_EMAIL.send(new EmailMessage(FROM, env.LEAD_TO, raw));
    await env.DB.prepare("UPDATE leads SET emailed = 1 WHERE id = ?").bind(id).run();
  } catch (err) {
    console.error("Lead email failed", id, err && err.message);
  }
}

// Header text with accents or other non-English letters must be encoded, and line breaks removed.
function encodeHeader(s) {
  const clean = s.replace(/[\r\n]+/g, " ");
  return /^[\x20-\x7e]*$/.test(clean) ? clean : `=?UTF-8?B?${base64(clean)}?=`;
}

function base64(s) {
  let bin = "";
  for (const byte of new TextEncoder().encode(s)) bin += String.fromCharCode(byte);
  return btoa(bin);
}

function reply(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
