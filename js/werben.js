/* Seiten „Pilot werden“ und „Jugend“: Zahlen hochzählen, Zeitstrahl mit Segelflieger,
   sanftes Einblenden und mitlaufender „Schnupperflug“-Knopf.
   Im Bearbeitungsmodus wird nichts animiert, damit keine Zwischenstände gespeichert werden. */
(() => {
  let bearbeiten = false;
  try { bearbeiten = !!sessionStorage.getItem('lsv-edit-session'); } catch {}
  const ruhig = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- Links übernehmen (z. B. Instagram-Karte = Adresse des Instagram-Knopfs) ----------
  document.querySelectorAll('[data-link-von]').forEach(a => {
    const q = document.querySelector(`[data-e="${a.dataset.linkVon}"]`);
    if (q && q.getAttribute('href')) a.href = q.getAttribute('href');
  });

  // ---------- Einblenden ----------
  if (!bearbeiten && !ruhig && 'IntersectionObserver' in window){
    document.documentElement.classList.add('w-js');
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting){ e.target.classList.add('da'); io.unobserve(e.target); } }), {rootMargin: '0px 0px -8% 0px'});
    document.querySelectorAll('.w-zeigen').forEach(el => io.observe(el));
  }

  // ---------- Zahlen hochzählen (z. B. „3.500 €“, „14“, „14–27“) ----------
  if (!bearbeiten && !ruhig){
    const zaehl = el => {
      const text = el.textContent, m = text.match(/\d[\d.]*/);
      if (!m) return;
      const ziel = parseInt(m[0].replace(/\./g, ''), 10);
      if (!ziel || ziel < 5) return;
      if (/^(19|20)\d\d$/.test(text.trim())) return;        // Jahreszahlen (z. B. „1950“) nicht hochzählen
      const punkt = m[0].includes('.'), vor = text.slice(0, m.index), nach = text.slice(m.index + m[0].length);
      const t0 = performance.now(), dauer = 1200;
      const schritt = t => {
        const p = Math.min(1, (t - t0) / dauer), v = Math.round(ziel * (1 - Math.pow(1 - p, 3)));
        el.textContent = vor + (punkt ? v.toLocaleString('de-DE') : v) + nach;
        if (p < 1) requestAnimationFrame(schritt); else el.textContent = text;
      };
      requestAnimationFrame(schritt);
    };
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting){ zaehl(e.target); io.unobserve(e.target); } }), {threshold: .6});
    document.querySelectorAll('.w-zahl').forEach(el => io.observe(el));
  }

  // ---------- Zeitstrahl: Linie füllt sich, Segelflieger fliegt mit ----------
  const weg = document.querySelector('.w-weg');
  if (weg){
    const flieger = document.createElement('span');
    flieger.className = 'w-flieger';
    flieger.setAttribute('aria-hidden', 'true');
    // derselbe Segelflieger wie auf der Startseite, Nase nach unten
    flieger.innerHTML = '<svg viewBox="-24 -24 48 48"><g transform="rotate(90) translate(1 0) scale(.8)">' +
      '<path fill="#fff" stroke="#0f2c4c" stroke-width="1.1" stroke-linejoin="round" d="M16 0 C14 -1.6 8 -2.2 5 -2.1 L3.6 -27 L1.4 -27.6 L0 -2 L-13.5 -0.9 L-14.5 -0.8 L-15.6 -8.5 L-17.8 -8.5 L-18 -0.6 L-18 0.6 L-17.8 8.5 L-15.6 8.5 L-14.5 0.8 L-13.5 0.9 L0 2 L1.4 27.6 L3.6 27 L5 2.1 C8 2.2 14 1.6 16 0 Z"/></g></svg>';
    weg.appendChild(flieger);
    // ruckelfrei: höchstens einmal pro Bild neu setzen, nur per transform
    let geplant = false;
    const setzen = () => {
      geplant = false;
      const r = weg.getBoundingClientRect(), mitte = innerHeight * .6;
      const p = bearbeiten ? 1 : Math.max(0, Math.min(1, (mitte - r.top) / r.height));
      weg.style.setProperty('--fortschritt', p.toFixed(4));
      flieger.style.transform = `translateY(${(8 + p * (weg.offsetHeight - 16)).toFixed(1)}px)`;
    };
    const anstossen = () => { if (!geplant){ geplant = true; requestAnimationFrame(setzen); } };
    addEventListener('scroll', anstossen, {passive: true}); addEventListener('resize', anstossen); setzen();
  }

  // ---------- mitlaufender Knopf ----------
  const leiste = document.querySelector('.w-leiste'), hero = document.querySelector('.w-hero'), aufruf = document.querySelector('.w-aufruf');
  if (leiste && hero && !bearbeiten){
    document.body.appendChild(leiste);                 // außerhalb des animierten Artikels, damit „fixed“ greift
    let heroWeg = false, aufrufDa = false;
    const zeigen = () => leiste.classList.toggle('an', heroWeg && !aufrufDa);
    new IntersectionObserver(([e]) => { heroWeg = !e.isIntersecting; zeigen(); }).observe(hero);
    if (aufruf) new IntersectionObserver(([e]) => { aufrufDa = e.isIntersecting; zeigen(); }).observe(aufruf);
  }

  // ---------- Vorher / Nachher: Regler verschiebt die Trennlinie ----------
  document.querySelectorAll('.w-vergleich').forEach(v => {
    const r = v.querySelector('input[type=range]');
    if (!r) return;
    const setzen = () => v.style.setProperty('--pos', r.value + '%');
    r.addEventListener('input', setzen); setzen();
  });

  // ---------- Kopieren (z. B. Frequenz, Koordinaten) ----------
  document.querySelectorAll('[data-kopieren]').forEach(k => {
    k.addEventListener('click', async () => {
      const q = document.querySelector(`[data-e="${k.dataset.kopieren}"]`);
      const text = (q?.textContent || '').trim();
      try { await navigator.clipboard.writeText(text); }
      catch { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
      const alt = k.textContent; k.textContent = '✓ Kopiert'; k.classList.add('ok');
      setTimeout(() => { k.textContent = alt; k.classList.remove('ok'); }, 1600);
    });
  });
  // ---------- Drucken (Anflug-Seite): kompaktes A5-Blatt nur mit den wichtigen Angaben ----------
  // Das Blatt wird beim Drucken aus dem aktuellen Seiteninhalt gebaut – Änderungen im Bearbeitungsmodus sind also automatisch drin.
  const karte = document.querySelector('.a-karte');
  if (karte){
    const txt = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
    const sauber = el => {                       // Kopie ohne Knöpfe und Bearbeitungs-Kennungen
      const c = el.cloneNode(true);
      c.querySelectorAll('button,.a-kopier,script').forEach(x => x.remove());
      [c, ...c.querySelectorAll('*')].forEach(x => { x.removeAttribute('data-e'); x.removeAttribute('id'); x.classList?.remove('w-zeigen', 'da'); });
      return c;
    };
    const mk = (tag, cls, inhalt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (inhalt != null) e.textContent = inhalt; return e; };
    let blatt = null, stil = null;
    const bauen = () => {
      abbauen();
      blatt = mk('div', 'a-druck');
      blatt.setAttribute('aria-hidden', 'true');
      // Kopf
      const kopf = mk('div', 'ad-kopf');
      const wappen = document.querySelector('#topbar .brand img:not([hidden])');
      if (wappen){ const w = new Image(); w.src = wappen.src; w.alt = ''; kopf.appendChild(w); }
      const kt = mk('div');
      kt.append(mk('b', null, txt(document.querySelector('h1')) || 'Anflug'), mk('span', null, txt(karte.querySelector('.a-karte-kopf span')) || txt(document.querySelector('.article .date'))));
      kopf.append(kt, mk('small', null, 'Stand: ' + new Date().toLocaleDateString('de-DE')));
      blatt.appendChild(kopf);
      // Platzdaten
      const daten = mk('div', 'ad-daten');
      karte.querySelectorAll('.a-feld').forEach(f => {
        const wert = txt(f.querySelector('.a-wert'));
        if (!wert) return;
        const d = mk('div', 'ad-feld' + (f.classList.contains('a-gross') ? ' ad-gross' : '') + (f.classList.contains('a-breit') ? ' ad-breit' : ''));
        d.append(mk('span', null, txt(f.querySelector('.a-lbl'))), mk('b', null, wert));
        daten.appendChild(d);
      });
      blatt.appendChild(daten);
      // Skizze mit Legende
      const skizze = document.querySelector('.a-skizze svg');
      if (skizze){
        const s = mk('div', 'ad-skizze');
        const svg = skizze.cloneNode(true);
        // eigene Kennungen, sonst zeigt das Muster auf die (beim Drucken ausgeblendete) Original-Skizze
        svg.querySelectorAll('[id]').forEach(el => {
          const alt = el.id, neu = alt + '-druck'; el.id = neu;
          svg.querySelectorAll('*').forEach(x => [...x.attributes].forEach(a => { if (a.value.includes('#' + alt + ')')) x.setAttribute(a.name, a.value.split('#' + alt + ')').join('#' + neu + ')')); }));
        });
        s.appendChild(svg);
        const leg = document.querySelector('.a-skizze .a-legende');
        if (leg) s.appendChild(sauber(leg));
        blatt.appendChild(s);
      }
      // Hinweise
      const warn = [...document.querySelectorAll('.a-warnung')];
      if (warn.length){
        const w = mk('div', 'ad-warn');
        warn.forEach(a => {
          const d = mk('div');
          d.append(mk('i', null, txt(a.querySelector('.w-ico'))), mk('b', null, txt(a.querySelector('h3'))), mk('span', null, txt(a.querySelector('p'))));
          w.appendChild(d);
        });
        blatt.appendChild(w);
      }
      // weitere Textabschnitte (z. B. Vor dem Anflug, Betrieb, Kontakt) – ohne Live-Tafel und Webcams
      const spalten = mk('div', 'ad-text');
      document.querySelectorAll('.article .w-abschnitt').forEach(ab => {
        if (ab.querySelector('.a-skizze,.a-warnungen,.a-live,iframe')) return;
        const h = ab.querySelector('h2');
        const inhalt = [...ab.children].filter(c => !c.matches('h2,.w-eyebrow'));
        if (!h || !inhalt.length) return;
        const d = mk('div', 'ad-abschnitt');
        d.appendChild(mk('h4', null, txt(h)));
        inhalt.forEach(c => d.appendChild(sauber(c)));
        spalten.appendChild(d);
      });
      // Telefonnummer der Flugleitung immer mitdrucken, falls sie irgendwo auf der Seite steht und noch fehlt
      const tel = document.querySelector('.article a[href^="tel:"]');
      if (tel && !spalten.textContent.includes(txt(tel))){
        const d = mk('div', 'ad-abschnitt');
        d.append(mk('h4', null, 'Telefon'), mk('p', null, txt(tel)));
        spalten.appendChild(d);
      }
      if (spalten.children.length) blatt.appendChild(spalten);
      // Fuß
      const fuss = mk('div', 'ad-fuss');
      fuss.append(mk('span', null, 'Ohne Gewähr – vor jedem Flug AIP VFR und NOTAMs prüfen. Skizze nicht maßstäblich, nicht zur Navigation.'),
                  mk('span', null, location.host + location.pathname.replace(/\/[^/]*$/, '/').replace(/\/seiten\/$/, '/')));
      blatt.appendChild(fuss);
      document.body.appendChild(blatt);
      // A5-Format nur für dieses Blatt (andere Seiten drucken weiter normal)
      stil = mk('style');
      stil.textContent = '@page{size:A5 portrait;margin:7mm}';
      document.head.appendChild(stil);
      document.documentElement.classList.add('a-druck-an');
    };
    const abbauen = () => {
      blatt?.remove(); stil?.remove(); blatt = stil = null;
      document.documentElement.classList.remove('a-druck-an');
    };
    addEventListener('beforeprint', bauen);       // auch bei Strg+P
    addEventListener('afterprint', abbauen);
    document.querySelectorAll('[data-drucken]').forEach(k => k.addEventListener('click', () => { bauen(); print(); }));
  } else {
    document.querySelectorAll('[data-drucken]').forEach(k => k.addEventListener('click', () => print()));
  }
})();
