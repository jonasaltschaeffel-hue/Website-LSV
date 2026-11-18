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
    // Flugzeug-Symbol, nach unten fliegend (Material-Icon „flight“, 180° gedreht)
    flieger.innerHTML = '<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="15" fill="#fff" stroke="#f08a24" stroke-width="2"/>' +
      '<g transform="translate(16 16) rotate(180) translate(-10 -10) scale(.833)" fill="#0a2350"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></g></svg>';
    weg.appendChild(flieger);
    const setzen = () => {
      const r = weg.getBoundingClientRect(), mitte = innerHeight * .6;
      const p = Math.max(0, Math.min(1, (mitte - r.top) / r.height));
      weg.style.setProperty('--fortschritt', bearbeiten ? 1 : p.toFixed(3));
    };
    addEventListener('scroll', setzen, {passive: true}); addEventListener('resize', setzen); setzen();
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
})();
