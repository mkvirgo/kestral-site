export async function onRequestPost(context) {
  const { request, env } = context;

  // Global error wrapper guarantees a JSON payload and prevents 502 HTML pages
  try {
    // 1. Ensure content-type is JSON
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return new Response(
        JSON.stringify({ success: false, message: 'Invalid Content-Type. Expected application/json.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const body = await request.json();
    const { name, email, kind, msg, hp_check, 'cf-turnstile-response': turnstileToken } = body;

    // 2. Honeypot verification
    if (hp_check && hp_check.trim() !== '') {
      return new Response(
        JSON.stringify({ success: true, message: 'Message sent successfully.' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 3. Basic validation
    if (!name || !email || !msg) {
      return new Response(
        JSON.stringify({ success: false, message: 'Please fill in all required fields (Name, Email, Message).' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 4. Verify Cloudflare Turnstile token if environment secret exists
    if (env.TURNSTILE_SECRET_KEY) {
      if (!turnstileToken) {
        return new Response(
          JSON.stringify({ success: false, message: 'Please complete the captcha verification.' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const turnstileFormData = new FormData();
      turnstileFormData.append('secret', env.TURNSTILE_SECRET_KEY);
      turnstileFormData.append('response', turnstileToken);
      turnstileFormData.append('remoteip', request.headers.get('CF-Connecting-IP') || '');

      const turnstileResult = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        body: turnstileFormData,
        method: 'POST'
      });

      const turnstileOutcome = await turnstileResult.json();
      if (!turnstileOutcome.success) {
        return new Response(
          JSON.stringify({ success: false, message: 'Captcha verification failed. Please try again.' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // 5. Send Email via Resend REST API
    if (env.RESEND_API_KEY) {
      const resendResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'Kestral Contact Form <contact@kestral.us>',
          to: ['contact@kestral.us'],
          reply_to: email,
          subject: `New Contact Request: ${kind} (${name})`,
          html: `
            <h2>New Inquiry from Kestral Website</h2>
            <p><strong>Name:</strong> ${escapeHtml(name)}</p>
            <p><strong>Email:</strong> ${escapeHtml(email)}</p>
            <p><strong>Service Requested:</strong> ${escapeHtml(kind)}</p>
            <hr />
            <p><strong>Message:</strong></p>
            <p style="white-space: pre-wrap;">${escapeHtml(msg)}</p>
          `
        })
      });

      if (!resendResponse.ok) {
        const resendError = await resendResponse.text();
        console.error('Resend API Error:', resendError);
        return new Response(
          JSON.stringify({ success: false, message: 'Failed to deliver message via email provider.' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Your message has been sent successfully.' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('Unhandled Server Exception:', err);
    return new Response(
      JSON.stringify({ success: false, message: 'Internal server error', details: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// Simple HTML escaping helper for email safety
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
