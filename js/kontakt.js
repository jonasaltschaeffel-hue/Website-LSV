/* Kontaktformulare (Startseite, Seite „Kontakt“): Versand über EmailJS.
   1) Nachricht an MAIL (Antworten gehen direkt an den Absender)
   2) Eingangsbestätigung an den Absender
   Jedes <form data-kontakt> wird verknüpft. Felder: name, mail, (tel), (thema), msg, _honey (Spam-Falle).
   Danach wird das Element [data-kontakt-danke] im selben Abschnitt angezeigt. */
(() => {
  const MAIL = 'jonas.altschaeffel@gmail.com';           // vorerst zum Testen – später z. B. info@luftsportverein-regensburg.de
  const EMAILJS = {
    url: 'https://api.emailjs.com/api/v1.0/email/send',
    service: 'service_44wtzmn',
    template: 'template_2lt9yef',
    key: 'KxP5KF0h5VquyA2IX'                               // öffentlicher Schlüssel (kein Passwort)
  };

  const senden1 = (params, signal) => fetch(EMAILJS.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ service_id: EMAILJS.service, template_id: EMAILJS.template, user_id: EMAILJS.key, template_params: params }),
    signal
  }).then(async r => { if (!r.ok) throw new Error((await r.text()) || ('Status ' + r.status)); });

  // Thema aus der Adresse vorauswählen, z. B. kontakt.html?thema=schnupperflug
  const thema = new URLSearchParams(location.search).get('thema');

  document.querySelectorAll('form[data-kontakt]').forEach(form => {
    const feld = n => form.elements[n];
    const wert = n => (feld(n)?.value || '').trim();
    const knopf = form.querySelector('button[type=submit]');
    const knopfText = knopf ? knopf.textContent : '';
    let fehler = form.querySelector('.k-fehler');
    if (!fehler){ fehler = document.createElement('p'); fehler.className = 'k-fehler'; fehler.setAttribute('role', 'alert'); form.appendChild(fehler); }
    const danke = form.parentElement.querySelector('[data-kontakt-danke]');

    if (thema && feld('thema')){
      const opt = [...feld('thema').options].find(o => o.value === thema || o.dataset.thema === thema);
      if (opt) feld('thema').value = opt.value;
    }

    form.addEventListener('submit', async e => {
      e.preventDefault();
      let msg = '';
      if (!wert('name')) msg = 'Bitte gib deinen Namen ein.';
      else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(wert('mail'))) msg = 'Bitte gib eine gültige E-Mail-Adresse ein.';
      else if (!wert('msg')) msg = 'Bitte schreib uns eine Nachricht.';
      fehler.textContent = msg;
      if (msg) return;

      const name = wert('name'), absender = wert('mail');
      const anliegen = feld('thema') ? feld('thema').selectedOptions[0].textContent.trim() : 'Anfrage über die Website';
      const seite = document.title.replace(/\s*–\s*LSV Regensburg.*$/, '') || 'Website';

      const anVerein = [
        'Neue Nachricht über die Website',
        '',
        `Anliegen: ${anliegen}`,
        `Name: ${name}`,
        `E-Mail: ${absender}`,
        `Telefon: ${wert('tel') || '–'}`,
        `Gesendet von: ${seite} (${location.href.split('#')[0]})`,
        '',
        'Nachricht:',
        wert('msg'),
        '',
        'Auf diese Mail antworten = Antwort direkt an den Absender.'
      ].join('\n');

      const anAbsender = [
        `Hallo ${name},`,
        '',
        'vielen Dank für deine Nachricht an den Luftsportverein Regensburg! Sie ist bei uns angekommen – wir melden uns so bald wie möglich bei dir.',
        '',
        `Dein Anliegen: ${anliegen}`,
        'Deine Nachricht:',
        wert('msg'),
        '',
        'Am schnellsten erreichst du uns an einem Flugtag direkt am Flugplatz Oberhinkofen (Navi: Einthal, 93083 Obertraubling).',
        '',
        'Viele Grüße vom Flugplatz Oberhinkofen',
        'Luftsportverein Regensburg e. V.'
      ].join('\n');

      const abbruch = new AbortController();
      const uhr = setTimeout(() => abbruch.abort(), 30000);
      if (knopf){ knopf.disabled = true; knopf.textContent = 'Wird gesendet …'; }
      try {
        // Spam-Schutz: nur Roboter füllen das unsichtbare Feld aus – dann so tun, als ob alles geklappt hätte
        if (!wert('_honey')){
          await senden1({ to_email: MAIL, reply_to: absender, subject: `${anliegen} – ${name}`, message: anVerein }, abbruch.signal);
          try {
            await senden1({ to_email: absender, reply_to: MAIL, subject: 'Deine Nachricht an den LSV Regensburg ist angekommen', message: anAbsender }, abbruch.signal);
          } catch (err) { /* Nachricht ist angekommen; Bestätigung ist nur ein Extra */ }
        }
        form.reset();
        if (danke){
          form.hidden = true; danke.hidden = false;
          const n = danke.querySelector('[data-kontakt-name]'); if (n) n.textContent = name;
          danke.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
          fehler.textContent = 'Danke! Deine Nachricht ist angekommen. Du bekommst gleich eine Bestätigung per E-Mail.';
        }
      } catch (err) {
        const grund = err.name === 'AbortError' ? 'Zeitüberschreitung' : (err.message || 'unbekannt');
        fehler.textContent = `Die Nachricht konnte gerade nicht gesendet werden. Bitte versuche es gleich noch einmal. (Grund: ${grund})`;
      } finally {
        clearTimeout(uhr);
        if (knopf){ knopf.disabled = false; knopf.textContent = knopfText; }
      }
    });

    // „Neue Nachricht“
    danke?.querySelector('[data-kontakt-neu]')?.addEventListener('click', () => {
      danke.hidden = true; form.hidden = false; fehler.textContent = '';
      feld('name')?.focus();
    });
  });
})();
