document.addEventListener('DOMContentLoaded', function () {
  const form = document.getElementById('contact-form');
  if (!form) return;

  const submitBtn = document.getElementById('contact-submit');
  const noteEl = document.getElementById('contact-note');

  form.addEventListener('submit', async function (e) {
    e.preventDefault();

    // Reset UI state
    if (noteEl) {
      noteEl.textContent = 'Sending message...';
      noteEl.style.color = 'var(--ink-soft)';
    }
    submitBtn.disabled = true;

    // 1. Honeypot check: If the hidden honeypot input is filled out, reject quietly
    const honeypot = form.querySelector('[name="hp_check"]');
    if (honeypot && honeypot.value.trim() !== '') {
      if (noteEl) {
        noteEl.textContent = 'Message sent successfully!';
        noteEl.style.color = 'var(--ok)';
      }
      form.reset();
      submitBtn.disabled = false;
      return;
    }

    // 2. Gather form data
    const formData = {
      name: form.querySelector('[name="name"]')?.value || '',
      email: form.querySelector('[name="email"]')?.value || '',
      kind: form.querySelector('[name="kind"]')?.value || '',
      msg: form.querySelector('[name="msg"]')?.value || '',
      'cf-turnstile-response': form.querySelector('[name="cf-turnstile-response"]')?.value || ''
    };

    try {
      // 3. Dispatch POST request
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      // 4. Inspect content-type header before parsing as JSON
      const contentType = response.headers.get('content-type') || '';
      let data = {};

      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        // Fallback if Cloudflare returns an HTML page (e.g. 502 Bad Gateway)
        const rawText = await response.text();
        throw new Error(
          `Server returned non-JSON response (${response.status} ${response.statusText}). Check server logs.`
        );
      }

      // 5. Check response status
      if (!response.ok) {
        throw new Error(data.message || data.error || `Server error (${response.status})`);
      }

      // Success feedback
      if (noteEl) {
        noteEl.textContent = 'Thank you! Your message has been sent successfully.';
        noteEl.style.color = 'var(--ok)';
      }
      form.reset();

      // Reset Cloudflare Turnstile widget if available
      if (window.turnstile) {
        window.turnstile.reset();
      }

    } catch (err) {
      console.error('Submission error:', err);
      if (noteEl) {
        noteEl.textContent = err.message || 'An error occurred while sending your message.';
        noteEl.style.color = '#e53e3e';
      }
    } finally {
      submitBtn.disabled = false;
    }
  });
});

// Optional callback for Turnstile execution
function onTurnstileVerified(token) {
  const noteEl = document.getElementById('contact-note');
  if (noteEl && noteEl.style.color === 'rgb(229, 62, 62)') {
    noteEl.textContent = 'Verification complete. You can now submit your message.';
    noteEl.style.color = 'var(--ink-soft)';
  }
}
