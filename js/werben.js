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
  document.querySelectorAll('[data-drucken]').forEach(k => k.addEventListener('click', () => print()));
})();
