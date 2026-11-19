/* =====================================================================
   LSV Regensburg – Bildersammlung (gemeinsame Funktionen)
   Die Bilder liegen im Repository im Ordner „bilder/“ (mit Unterordnern).
   Leere Ordner werden mit einer unsichtbaren Datei „.ordner“ angelegt.
   Genutzt von seiten/bilder.html (Verwaltung) und vom Bearbeitungsmodus
   („Bild einfügen“ → „Aus der Bildersammlung“).
   ===================================================================== */
window.LSVBilder = (() => {
  const WURZEL = 'bilder';
  const MARKE = '.ordner';
  const BILD = /\.(jpe?g|png|webp|gif)$/i;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

  // Dateiname/Ordnername → sicher für Adressen
  const slug = s => String(s).normalize('NFKD').toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

  /** Alle Ordner und Bilder der Sammlung */
  async function liste(gh){
    const eintraege = (gh.listTree ? await gh.listTree() : (await gh.listFiles()).map(path => ({path})))
      .filter(e => e.path.startsWith(WURZEL + '/'));
    const alle = eintraege.map(e => e.path);
    const ordner = new Set(['']), bilder = [];
    for (const e of eintraege){
      const p = e.path, teile = p.slice(WURZEL.length + 1).split('/');
      for (let i = 1; i < teile.length; i++) ordner.add(teile.slice(0, i).join('/'));
      if (BILD.test(p)) bilder.push({pfad: p, ordner: teile.slice(0, -1).join('/'), name: teile[teile.length - 1], sha: e.sha, groesse: e.size});
    }
    bilder.sort((a, b) => b.name.localeCompare(a.name));
    return {ordner: [...ordner].sort((a, b) => a.localeCompare(b, 'de')), bilder, dateien: alle};
  }
  const kinder = (ordner, aktuell) => ordner.filter(o => o && o !== aktuell && o.startsWith(aktuell ? aktuell + '/' : '') && !o.slice(aktuell ? aktuell.length + 1 : 0).includes('/'));
  const ordnerName = o => o ? o.split('/').pop() : 'Alle Bilder';

  // Vorschau direkt aus dem Repository (sofort verfügbar, auch bevor die Website neu veröffentlicht ist)
  function vorschau(cfg, pfad){
    const pre = cfg.pfad ? cfg.pfad.replace(/^\/|\/$/g, '') + '/' : '';
    return `https://raw.githubusercontent.com/${cfg.owner}/${cfg.repo}/${cfg.branch || 'main'}/${(pre + pfad).split('/').map(encodeURIComponent).join('/')}`;
  }

  /** Bild verkleinern (max. 2000 px breit); GIFs bleiben unverändert (Animation) */
  async function vorbereiten(file, maxW = 2000){
    const m = /\.([a-z0-9]+)$/i.exec(file.name || ''), endung = m ? m[1].toLowerCase() : '';
    const name = slug((file.name || 'bild').replace(/\.[^.]+$/, '')) || 'bild';
    if (file.size > 30 * 1024 * 1024) throw new Error(`„${file.name}“ ist größer als 30 MB.`);
    if (file.type === 'image/gif' || endung === 'gif'){
      if (file.size > 15 * 1024 * 1024) throw new Error(`„${file.name}“ ist größer als 15 MB.`);
      return {bytes: new Uint8Array(await file.arrayBuffer()), ext: 'gif', name, url: URL.createObjectURL(file)};
    }
    if (!/^image\//.test(file.type)) throw new Error(`„${file.name}“ ist kein Bild.`);
    let bmp;
    try { bmp = await createImageBitmap(file); }
    catch { throw new Error(`„${file.name}“ kann der Browser nicht öffnen (bitte als JPG oder PNG speichern).`); }
    const s = Math.min(1, maxW / bmp.width);
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const png = file.type === 'image/png';
    const blob = await new Promise(r => c.toBlob(r, png ? 'image/png' : 'image/jpeg', 0.85));
    return {bytes: new Uint8Array(await blob.arrayBuffer()), ext: png ? 'png' : 'jpg', name, url: URL.createObjectURL(blob)};
  }

  function cssLaden(){
    if (document.querySelector('link[data-bilder-css]')) return;
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.dataset.bilderCss = '';
    l.href = new URL('../css/bilder.css?v=1', document.querySelector('script[src*="bildersammlung.js"]').src).href;
    document.head.appendChild(l);
  }

  /** Auswahlfenster: liefert den Pfad des gewählten Bildes (z. B. „bilder/fluglager/x.jpg“) oder null */
  function waehlen(gh, cfg){
    cssLaden();
    return new Promise(fertig => {
      const m = document.createElement('div');
      m.className = 'lsv-modal lsv-ui bs-modal';
      m.innerHTML = `<div class="lsv-dialog bs-waehler" role="dialog" aria-label="Bild aus der Bildersammlung wählen">
          <div class="bs-kopf"><h2>Bildersammlung</h2><button type="button" class="bs-x" aria-label="Schließen">✕</button></div>
          <nav class="bs-pfad"></nav>
          <div class="bs-inhalt"><p class="bs-leer">Lade Bilder …</p></div>
        </div>`;
      document.body.appendChild(m);
      const zu = wert => { m.remove(); document.removeEventListener('keydown', taste, true); fertig(wert); };
      const taste = e => { if (e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); zu(null); } };
      document.addEventListener('keydown', taste, true);
      m.addEventListener('click', e => { if (e.target === m) zu(null); });
      m.querySelector('.bs-x').onclick = () => zu(null);
      let daten = null, aktuell = '';
      const zeichnen = () => {
        const teile = aktuell ? aktuell.split('/') : [];
        m.querySelector('.bs-pfad').innerHTML = `<button type="button" data-o="">🗂 Alle Bilder</button>` +
          teile.map((t, i) => `<span>›</span><button type="button" data-o="${esc(teile.slice(0, i + 1).join('/'))}">${esc(t)}</button>`).join('');
        const ord = kinder(daten.ordner, aktuell);
        const bil = daten.bilder.filter(b => b.ordner === aktuell);
        m.querySelector('.bs-inhalt').innerHTML = (ord.length || bil.length) ? `<div class="bs-raster">
            ${ord.map(o => `<button type="button" class="bs-ordner" data-o="${esc(o)}"><span class="bs-ico">📁</span><span>${esc(ordnerName(o))}</span></button>`).join('')}
            ${bil.map(b => `<button type="button" class="bs-bild" data-p="${esc(b.pfad)}" title="${esc(b.name)}"><img loading="lazy" alt="" src="${esc(vorschau(cfg, b.pfad))}"><span>${esc(b.name)}</span></button>`).join('')}
          </div>` : `<p class="bs-leer">Dieser Ordner ist leer. Bilder lädst du unter <a href="${esc(new URL('../seiten/bilder.html', document.querySelector('script[src*="bildersammlung.js"]').src).href)}" target="_blank">Bilder</a> (Fußzeile) hoch.</p>`;
      };
      m.addEventListener('click', e => {
        const o = e.target.closest('[data-o]'); if (o){ aktuell = o.dataset.o; zeichnen(); return; }
        const b = e.target.closest('[data-p]'); if (b) zu(b.dataset.p);
      });
      liste(gh).then(d => { daten = d; zeichnen(); })
        .catch(err => { m.querySelector('.bs-inhalt').innerHTML = `<p class="bs-leer">Bilder konnten nicht geladen werden: ${esc(err.message)}</p>`; });
    });
  }

  return {WURZEL, MARKE, BILD, esc, slug, liste, kinder, ordnerName, vorschau, vorbereiten, waehlen, cssLaden};
})();
