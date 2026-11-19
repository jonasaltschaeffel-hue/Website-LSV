/* Gutschein-Shop auf der Mitfliegen-Seite.
   Produkte, Texte und Preise stehen im HTML (im Bearbeitungsmodus änderbar).
   Versand über EmailJS (emailjs.com): eine Mail mit der Bestellung an MAIL und eine
   Bestätigung mit Zahlungsaufforderung an den Käufer. Bezahlt wird per Überweisung.
   EmailJS-Vorlage „LSV Gutscheine“: Betreff {{subject}}, Inhalt {{message}},
   Empfänger {{to_email}}, Antwort an {{reply_to}}. */
(() => {
  const shop = document.getElementById('gutscheine');
  if (!shop) return;
  const MAIL = 'jonas.altschaeffel@gmail.com';            // Empfänger der Bestellungen
  const EMAILJS = {
    url: 'https://api.emailjs.com/api/v1.0/email/send',
    service: 'service_44wtzmn',
    template: 'template_2lt9yef',
    key: 'KxP5KF0h5VquyA2IX'                               // öffentlicher Schlüssel (kein Passwort)
  };
  const $ = (s, r = shop) => r.querySelector(s);
  const euro = n => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  const preisAus = el => {
    const m = (el?.textContent || '').replace(/\./g, '').match(/\d+(?:,\d{1,2})?/);
    return m ? parseFloat(m[0].replace(',', '.')) : 0;
  };
  const text = el => (el?.textContent || '').trim();
  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const mengen = new Map();   // Produkt-Element -> Anzahl
  let wert = [];              // Beträge der Wertgutscheine

  const liste = $('.gs-liste'), leer = $('.gs-leer'), summeEl = $('.gs-summe strong');
  const form = $('.gs-form'), fehler = $('.gs-fehler'), danke = $('.gs-danke');
  const anzahlEl = $('.gs-anzahl'), sendenSumme = $('.gs-senden-summe'), senden = $('.gs-senden');
  const leiste = $('.gs-leiste'), leisteText = $('.gs-leiste-text'), kasse = $('.gs-kasse');
  let kasseSichtbar = false, anzahl = 0;
  document.body.appendChild(leiste);   // außerhalb des animierten Artikels, sonst klebt sie nicht am Bildschirmrand

  function positionen(){
    const p = [];
    mengen.forEach((n, el) => { if (n > 0) p.push({ name: text($('.gs-name', el)), n, preis: preisAus($('.gs-preis', el)), el }); });
    wert.forEach((b, i) => p.push({ name: 'Wertgutschein', n: 1, preis: b, wert: i }));
    return p;
  }

  function leisteZeigen(){
    leiste.hidden = !(anzahl > 0 && !kasseSichtbar && danke.hidden && !document.body.classList.contains('lsv-edit'));
  }
  if ('IntersectionObserver' in window){
    new IntersectionObserver(e => { kasseSichtbar = e[0].isIntersecting; leisteZeigen(); }).observe(kasse);
  }

  function zeichnen(){
    const p = positionen();
    liste.innerHTML = '';
    let summe = 0;
    anzahl = 0;
    p.forEach(pos => {
      summe += pos.n * pos.preis;
      anzahl += pos.n;
      const li = document.createElement('li');
      li.innerHTML = `<span class="gs-pos-n">${pos.n}×</span><span class="gs-pos-name">${esc(pos.name)}<small>je ${euro(pos.preis)}</small></span><span class="gs-pos-preis">${euro(pos.n * pos.preis)}</span>`;
      const x = document.createElement('button');
      x.type = 'button'; x.className = 'gs-weg'; x.setAttribute('aria-label', 'Entfernen'); x.title = 'Entfernen'; x.textContent = '×';
      x.onclick = () => { if (pos.el) setze(pos.el, 0); else { wert.splice(pos.wert, 1); zeichnen(); } };
      li.appendChild(x);
      liste.appendChild(li);
    });
    leer.hidden = p.length > 0;
    summeEl.textContent = euro(summe);
    anzahlEl.textContent = anzahl; anzahlEl.hidden = anzahl === 0;
    sendenSumme.textContent = summe ? euro(summe) : '';
    leisteText.textContent = `${anzahl} ${anzahl === 1 ? 'Gutschein' : 'Gutscheine'} · ${euro(summe)}`;
    shop.classList.toggle('gs-voll', p.length > 0);
    leisteZeigen();
  }

  function stupsen(el){
    el.classList.remove('gs-stups'); void el.offsetWidth; el.classList.add('gs-stups');
  }

  function setze(el, n){
    n = Math.max(0, Math.min(20, n));
    mengen.set(el, n);
    $('output', el).textContent = n;
    el.classList.toggle('gs-aktiv', n > 0);
    zeichnen();
    stupsen(anzahlEl);
  }

  shop.querySelectorAll('.gs-produkt:not(.gs-wert)').forEach(el => {
    mengen.set(el, 0);
    $('.gs-plus', el).addEventListener('click', () => setze(el, mengen.get(el) + 1));
    $('.gs-minus', el).addEventListener('click', () => setze(el, mengen.get(el) - 1));
  });

  // Info-Sprechblasen: „!“ öffnet/schließt, Klick daneben oder Esc schließt
  const infoZu = ausser => shop.querySelectorAll('.gs-info-offen').forEach(k => {
    if (k === ausser) return;
    k.classList.remove('gs-info-offen');
    $('.gs-info', k).setAttribute('aria-expanded', 'false');
  });
  shop.querySelectorAll('.gs-info').forEach(knopf => {
    const karte = knopf.closest('.gs-produkt');
    knopf.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      infoZu(karte);
      const offen = karte.classList.toggle('gs-info-offen');
      knopf.setAttribute('aria-expanded', String(offen));
    });
  });
  document.addEventListener('click', e => { if (!e.target.closest('.gs-blase, .gs-info')) infoZu(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && shop.querySelector('.gs-info-offen')){ e.preventDefault(); infoZu(); }
  }, true);
  const betrag = $('.gs-wert input'), add = $('.gs-add');
  add.addEventListener('click', () => {
    const b = Math.round(parseFloat(betrag.value));
    if (!(b >= 10 && b <= 1000)){ betrag.focus(); betrag.setCustomValidity('Bitte einen Betrag zwischen 10 und 1000 € eingeben.'); betrag.reportValidity(); return; }
    betrag.setCustomValidity('');
    wert.push(b);
    zeichnen();
    stupsen(anzahlEl);
    const karte = add.closest('.gs-produkt');
    karte.classList.add('gs-aktiv'); add.textContent = '✓';
    setTimeout(() => { karte.classList.remove('gs-aktiv'); add.textContent = '+'; }, 1200);
  });
  betrag.addEventListener('input', () => betrag.setCustomValidity(''));
  betrag.addEventListener('keydown', e => { if (e.key === 'Enter'){ e.preventDefault(); add.click(); } });

  function fehlerZeigen(msg){
    fehler.textContent = msg;
  }

  // Bankverbindung aus dem Feld „Bankverbindung“ (nur im Bearbeitungsmodus sichtbar)
  const bankZeile = sel => text($(sel)).replace(/\s+/g, ' ');

  // Text der automatischen Bestätigungs-E-Mail an den Käufer (mit Zahlungsaufforderung)
  function bestaetigung({ name, nummer, frist, posten, summe, versand }){
    return [
      `Hallo ${name},`,
      '',
      'vielen Dank für deine Gutschein-Bestellung beim Luftsportverein Regensburg! Hier ist deine Übersicht:',
      '',
      `Bestellnummer: ${nummer}`,
      posten,
      `Gesamtbetrag: ${euro(summe)}`,
      `Zustellung: ${versand}`,
      '',
      'ZAHLUNGSAUFFORDERUNG',
      `Bitte überweise den Gesamtbetrag von ${euro(summe)} bis zum ${frist} auf folgendes Konto:`,
      '',
      bankZeile('.gs-bank-empf'),
      bankZeile('.gs-bank-iban'),
      bankZeile('.gs-bank-bic'),
      bankZeile('.gs-bank-bank'),
      `Verwendungszweck: ${nummer} ${name}`,
      '',
      'Sobald dein Geld bei uns eingegangen ist, schicken wir dir den Gutschein zu.',
      '',
      'Viele Grüße vom Flugplatz Oberhinkofen',
      'Luftsportverein Regensburg e. V.'
    ].join('\n');
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const p = positionen(), f = form;
    let msg = '';
    if (!p.length) msg = 'Bitte wähle mindestens einen Gutschein aus.';
    else if (!f.name.value.trim()) msg = 'Bitte gib deinen Namen ein.';
    else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.mail.value.trim())) msg = 'Bitte gib eine gültige E-Mail-Adresse ein.';
    else if (!f.ok.checked) msg = 'Bitte bestätige die Zahlung per Überweisung.';
    fehlerZeigen(msg);
    if (msg) return;

    const summe = p.reduce((s, x) => s + x.n * x.preis, 0);
    const name = f.name.value.trim();
    const jetzt = new Date();
    const zwei = n => String(n).padStart(2, '0');
    const nummer = `GS-${zwei(jetzt.getFullYear() % 100)}${zwei(jetzt.getMonth() + 1)}${zwei(jetzt.getDate())}-${zwei(jetzt.getHours())}${zwei(jetzt.getMinutes())}`;
    const frist = new Date(jetzt.getTime() + 14 * 864e5).toLocaleDateString('de-DE');
    const posten = p.map(x => `${x.n} × ${x.name} à ${euro(x.preis)} = ${euro(x.n * x.preis)}`).join('\n');
    const kaeufer = f.mail.value.trim();
    const zustellung = f.versand.value;
    const zeile = (k, v) => `${k}: ${v}`;

    // 1) Bestellung an den Verein
    const bestellText = [
      'Neue Gutschein-Bestellung über die Website',
      '',
      zeile('Bestellnummer', nummer),
      posten,
      zeile('Gesamt', euro(summe)),
      '',
      zeile('Name', name),
      zeile('E-Mail', kaeufer),
      zeile('Telefon', f.tel.value.trim() || '–'),
      zeile('Gutschein für', f.fuer.value.trim() || '–'),
      zeile('Zustellung', zustellung),
      zeile('Nachricht', f.msg.value.trim() || '–'),
      zeile('Zahlung', 'Überweisung, fällig bis ' + frist),
      '',
      'Der Käufer hat automatisch eine Bestätigung mit der Zahlungsaufforderung bekommen.',
      'Auf diese Mail antworten = Antwort direkt an den Käufer.'
    ].filter(z => z !== null).join('\n');

    // 2) Bestätigung mit Zahlungsaufforderung an den Käufer
    const bestaetigungText = bestaetigung({ name, nummer, frist, posten, summe, versand: zustellung });

    const senden1 = params => fetch(EMAILJS.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service_id: EMAILJS.service, template_id: EMAILJS.template, user_id: EMAILJS.key, template_params: params }),
      signal: abbruch.signal
    }).then(async r => { if (!r.ok) throw new Error((await r.text()) || ('Status ' + r.status)); });

    const abbruch = new AbortController();
    const uhr = setTimeout(() => abbruch.abort(), 30000);
    senden.disabled = true; senden.classList.add('gs-laedt');
    $('.gs-senden-text').textContent = 'Wird gesendet …';
    try {
      // Spam-Schutz: nur Roboter füllen das unsichtbare Feld aus – dann so tun, als ob alles geklappt hätte
      if (!f._honey.value){
        await senden1({ to_email: MAIL, reply_to: kaeufer, subject: `Gutschein-Bestellung ${nummer} (${euro(summe)}) – ${name}`, message: bestellText });
        try {
          await senden1({ to_email: kaeufer, reply_to: MAIL, subject: `Deine Gutschein-Bestellung ${nummer} beim LSV Regensburg`, message: bestaetigungText });
        } catch (err) { /* Bestellung ist angekommen; Bestätigung notfalls von Hand nachschicken */ }
      }
      form.hidden = true; danke.hidden = false;
      sperren(true);
      leisteZeigen();
      kasse.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      const grund = err.name === 'AbortError' ? 'Zeitüberschreitung' : (err.message || 'unbekannt');
      fehlerZeigen(`Die Bestellung konnte gerade nicht gesendet werden. Bitte versuche es gleich noch einmal. (Grund: ${grund})`);
    } finally {
      clearTimeout(uhr);
      senden.disabled = false; senden.classList.remove('gs-laedt');
      $('.gs-senden-text').textContent = 'Jetzt bestellen';
    }
  });

  // nach dem Absenden: Auswahl sperren, bis „Neue Bestellung“ geklickt wird
  function sperren(an){
    shop.classList.toggle('gs-fertig', an);
    shop.querySelectorAll('.gs-grid button, .gs-grid input, .gs-liste button').forEach(el => { el.disabled = an; });
  }

  $('.gs-neu').addEventListener('click', () => {
    sperren(false);
    mengen.forEach((n, el) => setze(el, 0));
    wert = []; zeichnen();
    form.reset(); fehler.textContent = '';
    form.hidden = false; danke.hidden = true;
  });

  zeichnen();
})();
