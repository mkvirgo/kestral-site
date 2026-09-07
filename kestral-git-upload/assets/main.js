(function(){
  var form = document.getElementById('contact-form');
  var btn = document.getElementById('contact-submit');
  var note = document.getElementById('contact-note');
  var turnstileToken = '';
  window.onTurnstileVerified = function(token){ turnstileToken = token; };

  form.addEventListener('submit', function(e){
    e.preventDefault();
    var name = document.getElementById('name').value.trim();
    var email = document.getElementById('email').value.trim();
    var kind = document.getElementById('kind').value;
    var msg = document.getElementById('msg').value.trim();
    var company = document.getElementById('hp_check').value; // honeypot
    if (!name || !email) return;

    btn.disabled = true;
    btn.textContent = 'Sending…';

    fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name, email: email, kind: kind, message: msg,
        company: company, turnstileToken: turnstileToken
      })
    }).then(function(res){
      return res.json().then(function(data){
        if (!res.ok || !data.ok) throw new Error(data.error || 'Send failed');
        return data;
      });
    }).then(function(){
      form.hidden = true;
      note.textContent = 'Thanks, ' + name + ' — this has been sent, and Kestrel will reply at ' + email + ' within one business day.';
      note.style.color = 'var(--ok)';
      note.style.marginTop = '0';
    }).catch(function(err){
      btn.disabled = false;
      btn.textContent = 'Send message';
      note.textContent = (err && err.message) ? err.message : 'Couldn\'t send the form right now — please email kestrelitconsulting@gmail.com directly instead.';
      note.style.color = 'var(--accent)';
      if (window.turnstile && typeof window.turnstile.reset === 'function') {
        window.turnstile.reset();
        turnstileToken = '';
      }
    });
  });
})();
