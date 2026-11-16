/* Gutschein-Shop auf der Mitfliegen-Seite.
   Produkte, Texte und Preise stehen im HTML (im Bearbeitungsmodus änderbar).
   Die Bestellung wird über FormSubmit (formsubmit.co) direkt per E-Mail an MAIL geschickt;
   bezahlt wird per Überweisung. Beim allerersten Absenden schickt FormSubmit eine
   Aktivierungs-Mail an MAIL – dort einmal auf „Activate Form“ klicken. */
(() => {
  const shop = document.getElementById('gutscheine');
  if (!shop) return;
  const MAIL = 'jonas.altschaeffel@gmail.com';
  const ENDPUNKT = 'https://formsubmit.co/ajax/' + MAIL;
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

  // Postanschrift nur bei Versand per Post
  const adresse = $('.gs-adresse');
  form.querySelectorAll('input[name="versand"]').forEach(r => r.addEventListener('change', () => {
    adresse.hidden = form.versand.value !== 'Post';
  }));

  function fehlerZeigen(msg, mitMailLink){
    fehler.innerHTML = esc(msg) + (mitMailLink ? ` Du kannst uns die Bestellung auch an <a href="mailto:${MAIL}">${MAIL}</a> schicken.` : '');
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const p = positionen(), f = form;
    let msg = '';
    if (!p.length) msg = 'Bitte wähle mindestens einen Gutschein aus.';
    else if (!f.name.value.trim()) msg = 'Bitte gib deinen Namen ein.';
    else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.mail.value.trim())) msg = 'Bitte gib eine gültige E-Mail-Adresse ein.';
    else if (f.versand.value === 'Post' && !f.adresse.value.trim()) msg = 'Bitte gib die Postanschrift ein.';
    else if (!f.ok.checked) msg = 'Bitte bestätige die Zahlung per Überweisung.';
    fehlerZeigen(msg);
    if (msg) return;
    if (f._honey.value) return;   // Spam-Schutz: nur Roboter füllen dieses unsichtbare Feld aus

    const summe = p.reduce((s, x) => s + x.n * x.preis, 0);
    const name = f.name.value.trim();
    const daten = {
      _subject: `Gutschein-Bestellung (${euro(summe)}) – ${name}`,
      _template: 'table',
      _captcha: 'false',
      _autoresponse: `Hallo ${name}, danke für deine Gutschein-Bestellung beim LSV Regensburg über ${euro(summe)}! Wir melden uns in Kürze mit der Bankverbindung. Nach Zahlungseingang schicken wir dir den Gutschein. Viele Grüße vom Flugplatz Oberhinkofen`,
      Bestellung: p.map(x => `${x.n} × ${x.name} à ${euro(x.preis)} = ${euro(x.n * x.preis)}`).join('\n'),
      Gesamt: euro(summe),
      Name: name,
      email: f.mail.value.trim(),
      Telefon: f.tel.value.trim() || '–',
      'Gutschein für': f.fuer.value.trim() || '–',
      Zustellung: f.versand.value,
      Anschrift: f.versand.value === 'Post' ? f.adresse.value.trim() : '–',
      Nachricht: f.msg.value.trim() || '–',
      Zahlung: 'Überweisung'
    };

    // als Formulardaten senden (keine Vorab-Anfrage nötig) und nach 20 Sekunden aufgeben
    const fd = new FormData();
    Object.entries(daten).forEach(([k, v]) => fd.append(k, v));
    const abbruch = new AbortController();
    const uhr = setTimeout(() => abbruch.abort(), 20000);
    senden.disabled = true; senden.classList.add('gs-laedt');
    $('.gs-senden-text').textContent = 'Wird gesendet …';
    try {
      const r = await fetch(ENDPUNKT, { method: 'POST', headers: { Accept: 'application/json' }, body: fd, signal: abbruch.signal });
      const antwort = await r.json().catch(() => ({}));
      if (!r.ok || String(antwort.success) !== 'true') throw new Error(antwort.message || 'Fehler');
      form.hidden = true; danke.hidden = false;
      leisteZeigen();
      kasse.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      // Ausweg: Bestellung fertig vorbereitet per E-Mail-Programm senden
      const text = Object.entries(daten).filter(([k]) => !k.startsWith('_')).map(([k, v]) => `${k === 'email' ? 'E-Mail' : k}: ${v}`).join('\n');
      const href = `mailto:${MAIL}?subject=${encodeURIComponent(daten._subject)}&body=${encodeURIComponent(text)}`;
      fehler.innerHTML = 'Das Senden über die Website klappt gerade nicht. Du kannst die fertige Bestellung stattdessen per E-Mail schicken:'
        + ` <a class="gs-mail-knopf" href="${esc(href)}">✉️ Bestellung per E-Mail senden</a>`;
    } finally {
      clearTimeout(uhr);
      senden.disabled = false; senden.classList.remove('gs-laedt');
      $('.gs-senden-text').textContent = 'Jetzt bestellen';
    }
  });

  $('.gs-neu').addEventListener('click', () => {
    mengen.forEach((n, el) => setze(el, 0));
    wert = []; zeichnen();
    form.reset(); adresse.hidden = true; fehler.textContent = '';
    form.hidden = false; danke.hidden = true;
  });

  zeichnen();
})();
