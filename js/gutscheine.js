/* Gutschein-Shop auf der Mitfliegen-Seite.
   Produkte, Texte und Preise stehen im HTML (im Bearbeitungsmodus änderbar).
   Die Bestellung wird als E-Mail an MAIL vorbereitet; bezahlt wird per Überweisung. */
(() => {
  const shop = document.getElementById('gutscheine');
  if (!shop) return;
  const MAIL = 'jonas.altschaeffel@gmail.com';
  const $ = (s, r = shop) => r.querySelector(s);
  const euro = n => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  const preisAus = el => {
    const m = (el?.textContent || '').replace(/\./g, '').match(/\d+(?:,\d{1,2})?/);
    return m ? parseFloat(m[0].replace(',', '.')) : 0;
  };
  const text = el => (el?.textContent || '').trim();

  const mengen = new Map();   // Produkt-Element -> Anzahl
  let wert = [];              // Beträge der Wertgutscheine

  const liste = $('.gs-liste'), leer = $('.gs-leer'), summeEl = $('.gs-summe strong');
  const form = $('.gs-form'), fehler = $('.gs-fehler'), danke = $('.gs-danke');

  function positionen(){
    const p = [];
    mengen.forEach((n, el) => { if (n > 0) p.push({ name: text($('.gs-name', el)), n, preis: preisAus($('.gs-preis', el)), el }); });
    wert.forEach((b, i) => p.push({ name: 'Wertgutschein', n: 1, preis: b, wert: i }));
    return p;
  }

  function zeichnen(){
    const p = positionen();
    liste.innerHTML = '';
    let summe = 0;
    p.forEach(pos => {
      summe += pos.n * pos.preis;
      const li = document.createElement('li');
      li.innerHTML = `<span>${pos.n}× ${pos.name}</span><span>${euro(pos.n * pos.preis)}</span>`;
      const x = document.createElement('button');
      x.type = 'button'; x.className = 'gs-weg'; x.setAttribute('aria-label', 'Entfernen'); x.textContent = '×';
      x.onclick = () => { if (pos.el) setze(pos.el, 0); else { wert.splice(pos.wert, 1); zeichnen(); } };
      li.appendChild(x);
      liste.appendChild(li);
    });
    leer.hidden = p.length > 0;
    summeEl.textContent = euro(summe);
    shop.classList.toggle('gs-voll', p.length > 0);
  }

  function setze(el, n){
    n = Math.max(0, Math.min(20, n));
    mengen.set(el, n);
    $('output', el).textContent = n;
    el.classList.toggle('gs-aktiv', n > 0);
    zeichnen();
  }

  shop.querySelectorAll('.gs-produkt:not(.gs-wert)').forEach(el => {
    mengen.set(el, 0);
    $('.gs-plus', el).addEventListener('click', () => setze(el, mengen.get(el) + 1));
    $('.gs-minus', el).addEventListener('click', () => setze(el, mengen.get(el) - 1));
  });

  const betrag = $('.gs-wert input');
  $('.gs-add').addEventListener('click', () => {
    const b = Math.round(parseFloat(betrag.value));
    if (!(b >= 10 && b <= 1000)){ betrag.focus(); betrag.setCustomValidity('Bitte einen Betrag zwischen 10 und 1000 € eingeben.'); betrag.reportValidity(); return; }
    betrag.setCustomValidity('');
    wert.push(b);
    zeichnen();
  });
  betrag.addEventListener('input', () => betrag.setCustomValidity(''));

  // Postanschrift nur bei Versand per Post
  const adresse = $('.gs-adresse');
  form.querySelectorAll('input[name="versand"]').forEach(r => r.addEventListener('change', () => {
    adresse.hidden = form.versand.value !== 'Post';
  }));

  form.addEventListener('submit', e => {
    e.preventDefault();
    const p = positionen(), f = form;
    let msg = '';
    if (!p.length) msg = 'Bitte wähle mindestens einen Gutschein aus.';
    else if (!f.name.value.trim()) msg = 'Bitte gib deinen Namen ein.';
    else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.mail.value.trim())) msg = 'Bitte gib eine gültige E-Mail-Adresse ein.';
    else if (f.versand.value === 'Post' && !f.adresse.value.trim()) msg = 'Bitte gib die Postanschrift ein.';
    else if (!f.ok.checked) msg = 'Bitte bestätige die Zahlung per Überweisung.';
    fehler.textContent = msg;
    if (msg) return;

    const summe = p.reduce((s, x) => s + x.n * x.preis, 0);
    const zeilen = [
      'Gutschein-Bestellung über die Website',
      '',
      ...p.map(x => `${x.n} × ${x.name} à ${euro(x.preis)} = ${euro(x.n * x.preis)}`),
      '',
      `Gesamt: ${euro(summe)}`,
      '',
      `Name: ${f.name.value.trim()}`,
      `E-Mail: ${f.mail.value.trim()}`,
      f.tel.value.trim() ? `Telefon: ${f.tel.value.trim()}` : null,
      f.fuer.value.trim() ? `Gutschein für: ${f.fuer.value.trim()}` : null,
      `Zustellung: ${f.versand.value}`,
      f.versand.value === 'Post' ? `Anschrift:\n${f.adresse.value.trim()}` : null,
      f.msg.value.trim() ? `\nNachricht:\n${f.msg.value.trim()}` : null,
      '',
      'Zahlung per Überweisung – bitte schickt mir die Bankverbindung.'
    ].filter(z => z !== null);
    const body = zeilen.join('\n');
    const subject = `Gutschein-Bestellung (${euro(summe)}) – ${f.name.value.trim()}`;

    $('.gs-text-kopie').value = `An: ${MAIL}\nBetreff: ${subject}\n\n${body}`;
    $('.gs-mail-link').href = `mailto:${MAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    form.hidden = true; danke.hidden = false;
    location.href = $('.gs-mail-link').href;
  });

  $('.gs-kopieren').addEventListener('click', async e => {
    const ta = $('.gs-text-kopie');
    try { await navigator.clipboard.writeText(ta.value); } catch { ta.select(); document.execCommand('copy'); }
    e.target.textContent = 'Kopiert ✓';
    setTimeout(() => e.target.textContent = 'Bestellung kopieren', 2000);
  });

  $('.gs-neu').addEventListener('click', () => {
    mengen.forEach((n, el) => setze(el, 0));
    wert = []; zeichnen();
    form.reset(); adresse.hidden = true; fehler.textContent = '';
    form.hidden = false; danke.hidden = true;
  });

  zeichnen();
})();
