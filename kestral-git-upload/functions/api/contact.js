// Cloudflare Pages Function — handles POST /api/contact
//
// Sends a notification email via Resend (https://resend.com) whenever
// someone submits the contact form, with basic hardening against bots
// and abuse: a honeypot field, a Cloudflare Turnstile check, input
// length limits, and strict validation. None of this is bulletproof on
// its own — pair it with the Cloudflare dashboard settings in
// DEPLOY.md (Bot Fight Mode, a rate limiting rule, HTTPS enforcement).
//
// Environment variables (set as secrets in the Pages dashboard, or via
// `wrangler pages secret put <NAME>`):
//
//   RESEND_API_KEY        — required. Your Resend API key.
//   TURNSTILE_SECRET_KEY  — required for the CAPTCHA check to run.
//                           Without it, submissions are still accepted
//                           (fails open) so the form doesn't break if
//                           you skip Turnstile setup — see DEPLOY.md.
//   NOTIFY_EMAIL          — optional, where submissions are sent.

const MAX_LEN = { name: 120, email: 254, kind: 60, message: 4000 };

export async function onRequestPost({ request, env }) {
  // Reject anything that isn't actually JSON up front.
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return json({ ok: false, error: "Invalid request." }, 400);
  }

  // Hard cap on body size before parsing, so a huge payload can't tie
  // up the function.
  const raw = await request.text();
  if (raw.length > 20_000) {
    return json({ ok: false, error: "Request too large." }, 413);
  }

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ ok: false, error: "Invalid request body." }, 400);
  }

  // Honeypot: a field named "company" that's hidden from real visitors
  // via CSS. Bots that fill in every field trip this; humans never see
  // it. Pretend success so bots don't learn to skip it.
  if (String(body.company || "").trim() !== "") {
    return json({ ok: true });
  }

  const name = clean(body.name, MAX_LEN.name);
  const email = clean(body.email, MAX_LEN.email);
  const kind = clean(body.kind, MAX_LEN.kind);
  const message = clean(body.message, MAX_LEN.message);

  if (!name || !email) {
    return json({ ok: false, error: "Name and email are required." }, 400);
  }
  // Reasonably strict email check — no whitespace (rules out header
  // injection via newlines), one @, a dot in the domain part.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > MAX_LEN.email) {
    return json({ ok: false, error: "That email address doesn't look right." }, 400);
  }

  // Cloudflare Turnstile verification (skipped, not failed, if you
  // haven't set it up yet — see DEPLOY.md to turn this on for real).
  if (env.TURNSTILE_SECRET_KEY) {
    const token = String(body.turnstileToken || "");
    if (!token) {
      return json({ ok: false, error: "Verification failed — please try again." }, 400);
    }
    const verify = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: env.TURNSTILE_SECRET_KEY,
        response: token,
        remoteip: request.headers.get("cf-connecting-ip") || "",
      }),
    }).then((r) => r.json()).catch(() => ({ success: false }));

    if (!verify.success) {
      return json({ ok: false, error: "Verification failed — please try again." }, 400);
    }
  }

  if (!env.RESEND_API_KEY) {
    console.error("RESEND_API_KEY is not set.");
    return json({ ok: false, error: "Form is not configured yet." }, 500);
  }

  const notifyTo = env.NOTIFY_EMAIL || "kestrelitconsulting@gmail.com";

  const html = `
    <h2>New inquiry from kestrelitconsulting.com</h2>
    <p><strong>Name:</strong> ${escapeHtml(name)}</p>
    <p><strong>Email:</strong> ${escapeHtml(email)}</p>
    <p><strong>Interested in:</strong> ${escapeHtml(kind || "Not specified")}</p>
    <p><strong>Message:</strong><br>${escapeHtml(message).replace(/\n/g, "<br>")}</p>
  `;

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Kestrel IT Consulting <onboarding@resend.dev>",
      to: [notifyTo],
      reply_to: email,
      subject: `New inquiry from ${name}`,
      html,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    console.error("Resend error:", resp.status, errText);
    return json({ ok: false, error: "Couldn't send the message. Please try again shortly." }, 502);
  }

  return json({ ok: true });
}

function clean(value, maxLen) {
  return String(value || "").trim().slice(0, maxLen);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
