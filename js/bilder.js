/* =====================================================================
   LSV Regensburg – Seite „Bilder“ (seiten/bilder.html)
   Bilder hochladen, Ordner anlegen, löschen. Geschützt mit einem eigenen
   Passwort: admin/bilder-zugang.json enthält den GitHub-Schlüssel, mit dem
   Bilder-Passwort verschlüsselt (wie admin/zugang.json für den
   Bearbeitungsmodus). Mit dem Passwort des Bearbeitungsmodus kann man sich
   ebenfalls anmelden und dann das Bilder-Passwort festlegen oder ändern.
   ===================================================================== */
(() => {
  const B = LSVBilder, esc = B.esc;
  const base = new URL('..', document.currentScript.src);
  const app = document.getElementById('bs-app');
  const SKEY = 'lsv-bilder-session';
  const pause = ms => new Promise(r => setTimeout(r, ms));

  const sitzung = {
    get(){
      try { const s = JSON.parse(sessionStorage.getItem(SKEY)); if (s) return s; } catch {}
      const e = LSVGit.session.get();                                     // schon im Bearbeitungsmodus angemeldet
      return e ? {cfg: e.cfg, token: e.token, rolle: 'admin'} : null;
    },
    set(s){ try { sessionStorage.setItem(SKEY, JSON.stringify(s)); } catch {} },
    clear(){ try { sessionStorage.removeItem(SKEY); } catch {} }
  };
  const ladeJson = async pfad => {
    const r = await fetch(new URL(pfad, base).href + '?v=' + Date.now(), {cache: 'no-store'});
    return r.ok ? r.json() : null;
  };
  const oeffentlich = c => ({owner: c.owner, repo: c.repo, branch: c.branch, pfad: c.pfad});

  /* ---------------- Anmeldung ---------------- */
  function anmelden(){
    app.innerHTML = `<form class="bs-login k-karte">
        <span class="bs-schloss" aria-hidden="true">🔒</span>
        <h2>Bildersammlung</h2>
        <p>Bitte gib das Passwort für die Bildersammlung ein.</p>
        <label>Passwort<input name="pw" type="password" required autocomplete="current-password"></label>
        <p class="bs-fehler" role="alert"></p>
        <button class="btn primary" type="submit">Öffnen</button>
      </form>`;
    const f = app.querySelector('form'), fehler = f.querySelector('.bs-fehler'), knopf = f.querySelector('button');
    f.pw.focus();
    f.onsubmit = async e => {
      e.preventDefault();
      knopf.disabled = true; knopf.textContent = 'Prüfe …'; fehler.textContent = '';
      try {
        const pw = f.pw.value;
        const [bz, ez] = await Promise.all([ladeJson('admin/bilder-zugang.json'), ladeJson('admin/zugang.json')]);
        let token = null, cfg = null, rolle = 'bilder';
        if (bz){ try { token = await LSVGit.decryptToken(bz, pw); cfg = bz; } catch {} }
        if (!token && ez){ try { token = await LSVGit.decryptToken(ez, pw); cfg = ez; rolle = 'admin'; } catch {} }
        if (!token) throw new Error(bz ? 'Das Passwort ist falsch.' : 'Das Passwort ist falsch. (Das Bilder-Passwort ist noch nicht eingerichtet – einmal mit dem Passwort des Bearbeitungsmodus anmelden und festlegen.)');
        const pub = oeffentlich(cfg);
        if (!await LSVGit.client(pub, token).check()) throw new Error('Kein Schreibzugriff mit diesem Schlüssel.');
        sitzung.set({cfg: pub, token, rolle});
        start();
      } catch (err){
        fehler.textContent = err.message;
        await pause(1000);                                   // kurze Pause gegen schnelles Durchprobieren
        knopf.disabled = false; knopf.textContent = 'Öffnen';
      }
    };
  }

  /* ---------------- Sammlung ---------------- */
  let s, gh, daten = {ordner: [''], bilder: [], dateien: []}, aktuell = '', beschaeftigt = false;
  const lokal = new Map();                                   // frisch hochgeladene Bilder sofort zeigen

  function start(){
    s = sitzung.get(); if (!s) return anmelden();
    gh = LSVGit.client(s.cfg, s.token);
    try { aktuell = decodeURIComponent((location.hash.match(/^#ordner=(.*)$/) || [])[1] || ''); } catch { aktuell = ''; }
    app.innerHTML = `
      <div class="bs-leiste">
        <nav class="bs-pfad" aria-label="Ordner"></nav>
        <div class="bs-knoepfe">
          <button type="button" class="btn ghost bs-neu-ordner">＋ Neuer Ordner</button>
          <label class="btn primary bs-hoch">⬆ Bilder hochladen<input type="file" accept="image/*" multiple hidden></label>
        </div>
      </div>
      <p class="bs-status" aria-live="polite"></p>
      <div class="bs-zone"><div class="bs-inhalt"><p class="bs-leer">Lade Bilder …</p></div>
        <div class="bs-drop" aria-hidden="true"><span>Bilder hier loslassen</span></div></div>
      <div class="bs-unten">
        ${s.rolle === 'admin' ? '<button type="button" class="bs-link bs-pw">🔑 Bilder-Passwort festlegen</button>' : ''}
        <button type="button" class="bs-link bs-ab">Abmelden</button>
      </div>`;
    app.querySelector('.bs-ab').onclick = () => { sitzung.clear(); location.hash = ''; anmelden(); };
    const pwKnopf = app.querySelector('.bs-pw'); if (pwKnopf) pwKnopf.onclick = passwortFestlegen;
    app.querySelector('.bs-neu-ordner').onclick = neuerOrdner;
    const inp = app.querySelector('.bs-hoch input');
    inp.onchange = () => { const f = [...inp.files]; inp.value = ''; if (f.length) hochladen(f); };
    // Ziehen & Ablegen
    const zone = app.querySelector('.bs-zone');
    let tiefe = 0;
    zone.addEventListener('dragenter', e => { if (e.dataTransfer.types.includes('Files')){ e.preventDefault(); tiefe++; zone.classList.add('bs-ueber'); } });
    zone.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); });
    zone.addEventListener('dragleave', () => { if (--tiefe <= 0){ tiefe = 0; zone.classList.remove('bs-ueber'); } });
    zone.addEventListener('drop', e => {
      e.preventDefault(); tiefe = 0; zone.classList.remove('bs-ueber');
      const f = [...e.dataTransfer.files].filter(x => /^image\//.test(x.type) || /\.(jpe?g|png|webp|gif)$/i.test(x.name));
      if (f.length) hochladen(f);
    });
    laden();
  }

  const status = (t, fehler) => { const el = app.querySelector('.bs-status'); if (!el) return; el.textContent = t || ''; el.classList.toggle('bs-rot', !!fehler); };
  async function laden(){
    try { daten = await B.liste(gh); if (!daten.ordner.includes(aktuell)) aktuell = ''; zeichnen(); }
    catch (err){ app.querySelector('.bs-inhalt').innerHTML = `<p class="bs-leer">Bilder konnten nicht geladen werden: ${esc(err.message)}</p>`; }
  }
  const bildUrl = b => lokal.get(b.pfad) || B.vorschau(s.cfg, b.pfad);
  const seitenUrl = p => new URL(p.split('/').map(encodeURIComponent).join('/'), base).href;

  function zeichnen(){
    history.replaceState(null, '', aktuell ? '#ordner=' + encodeURIComponent(aktuell) : location.pathname + location.search);
    const teile = aktuell ? aktuell.split('/') : [];
    app.querySelector('.bs-pfad').innerHTML = `<button type="button" data-o="">🗂 Alle Bilder</button>` +
      teile.map((t, i) => `<span>›</span><button type="button" data-o="${esc(teile.slice(0, i + 1).join('/'))}">${esc(t)}</button>`).join('');
    const ord = B.kinder(daten.ordner, aktuell);
    const bil = daten.bilder.filter(b => b.ordner === aktuell);
    const anzahl = o => daten.bilder.filter(b => b.ordner === o || b.ordner.startsWith(o + '/')).length;
    app.querySelector('.bs-inhalt').innerHTML = (ord.length || bil.length) ? `<div class="bs-raster">
        ${ord.map(o => `<div class="bs-kachel bs-ordner-k">
            <button type="button" class="bs-ordner" data-o="${esc(o)}"><span class="bs-ico">📁</span><span>${esc(B.ordnerName(o))}</span><small>${anzahl(o)} Bild${anzahl(o) === 1 ? '' : 'er'}</small></button>
            <div class="bs-aktionen"><button type="button" data-ordner-weg="${esc(o)}" title="Ordner löschen">🗑</button></div>
          </div>`).join('')}
        ${bil.map(b => `<div class="bs-kachel">
            <a class="bs-bild" href="${esc(bildUrl(b))}" target="_blank" rel="noopener" title="${esc(b.name)}"><img loading="lazy" alt="" src="${esc(bildUrl(b))}"><span>${esc(b.name)}</span></a>
            <div class="bs-aktionen"><button type="button" data-kopie="${esc(b.pfad)}" title="Adresse kopieren">🔗</button><button type="button" data-weg="${esc(b.pfad)}" title="Bild löschen">🗑</button></div>
          </div>`).join('')}
      </div>` : `<div class="bs-leer bs-leer-gross"><span aria-hidden="true">🖼</span><p>${aktuell ? 'Dieser Ordner ist noch leer.' : 'Noch keine Bilder.'}</p><p>Klicke auf „Bilder hochladen“ oder ziehe Bilder hierher.</p></div>`;
  }

  async function klick(e){
    const o = e.target.closest('[data-o]'); if (o){ aktuell = o.dataset.o; zeichnen(); return; }
    const k = e.target.closest('[data-kopie]');
    if (k){
      const url = seitenUrl(k.dataset.kopie);
      try { await navigator.clipboard.writeText(url); status('Adresse kopiert ✓'); } catch { prompt('Adresse des Bildes:', url); }
      return;
    }
    const w = e.target.closest('[data-weg]');
    if (w){
      const name = w.dataset.weg.split('/').pop();
      if (!confirm(`„${name}“ wirklich löschen?\n\nFalls das Bild auf einer Seite der Website verwendet wird, fehlt es dort danach.`)) return;
      speichern([{path: w.dataset.weg, remove: true}], `Bild gelöscht: ${w.dataset.weg}`, 'Bild gelöscht ✓');
      return;
    }
    const ow = e.target.closest('[data-ordner-weg]');
    if (ow){
      const pre = B.WURZEL + '/' + ow.dataset.ordnerWeg + '/';
      const dateien = daten.dateien.filter(p => p.startsWith(pre));
      const n = dateien.filter(p => B.BILD.test(p)).length;
      if (!confirm(n ? `Ordner „${B.ordnerName(ow.dataset.ordnerWeg)}“ mit ${n} Bild${n === 1 ? '' : 'ern'} wirklich löschen?\n\nBilder, die auf der Website verwendet werden, fehlen dort danach.` : `Leeren Ordner „${B.ordnerName(ow.dataset.ordnerWeg)}“ löschen?`)) return;
      speichern(dateien.map(p => ({path: p, remove: true})), `Ordner gelöscht: ${pre}`, 'Ordner gelöscht ✓');
    }
  }

  async function speichern(dateien, nachricht, fertigText){
    if (beschaeftigt) return status('Bitte warten, es wird noch gespeichert …');
    beschaeftigt = true; app.classList.add('bs-busy'); status('Speichere …');
    try { await gh.commit(dateien, nachricht); await laden(); status(fertigText); }
    catch (err){ status('Nicht gespeichert: ' + err.message, true); }
    beschaeftigt = false; app.classList.remove('bs-busy');
  }

  const ordnerSicher = n => n.replace(/[\\/:*?"<>|#%&{}$!'@+`=~^\[\]]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
  function neuerOrdner(){
    const n = prompt(aktuell ? `Name des neuen Ordners in „${B.ordnerName(aktuell)}“:` : 'Name des neuen Ordners (z. B. „Fluglager 2027“):');
    if (n === null) return;
    const name = ordnerSicher(n);
    if (!name || name === '.' || name === '..') return status('Bitte einen gültigen Ordnernamen eingeben.', true);
    const ziel = aktuell ? aktuell + '/' + name : name;
    if (daten.ordner.some(o => o.toLowerCase() === ziel.toLowerCase())) return status(`Den Ordner „${name}“ gibt es hier schon.`, true);
    speichern([{path: `${B.WURZEL}/${ziel}/${B.MARKE}`, text: 'Ordner der Bildersammlung\n'}], `Ordner angelegt: ${ziel}`, `Ordner „${name}“ angelegt ✓`).then(() => { aktuell = ziel; zeichnen(); });
  }

  async function hochladen(dateien){
    if (beschaeftigt) return status('Bitte warten, es wird noch gespeichert …');
    beschaeftigt = true; app.classList.add('bs-busy');
    const stempel = Date.now().toString(36), liste = [], fehler = [];
    const vergeben = new Set(daten.dateien);
    for (let i = 0; i < dateien.length; i++){
      status(`Bereite Bild ${i + 1} von ${dateien.length} vor …`);
      try {
        const im = await B.vorbereiten(dateien[i]);
        let pfad = `${B.WURZEL}/${aktuell ? aktuell + '/' : ''}${im.name}.${im.ext}`;
        if (vergeben.has(pfad)) pfad = pfad.replace(/(\.[a-z]+)$/, `-${stempel}${i}$1`);
        vergeben.add(pfad);
        liste.push({path: pfad, bytes: im.bytes});
        lokal.set(pfad, im.url);
      } catch (err){ fehler.push(err.message); }
    }
    beschaeftigt = false; app.classList.remove('bs-busy');
    if (!liste.length) return status(fehler.join(' '), true);
    await speichern(liste, `${liste.length} Bild${liste.length === 1 ? '' : 'er'} hochgeladen: ${B.WURZEL}/${aktuell}`,
      `${liste.length} Bild${liste.length === 1 ? '' : 'er'} hochgeladen ✓` + (fehler.length ? ' – nicht geklappt: ' + fehler.join(' ') : ''));
  }

  function passwortFestlegen(){
    const m = document.createElement('div');
    m.className = 'bs-modal';
    m.innerHTML = `<form class="k-karte bs-dialog">
        <h2>Bilder-Passwort festlegen</h2>
        <p>Mit diesem Passwort können Vereinsmitglieder Bilder hochladen und Ordner anlegen – ohne Zugang zum Bearbeitungsmodus der Website.</p>
        <label>Neues Passwort<input name="a" type="password" required minlength="6" autocomplete="new-password"></label>
        <label>Noch einmal<input name="b" type="password" required minlength="6" autocomplete="new-password"></label>
        <p class="bs-fehler" role="alert"></p>
        <div class="bs-dialog-knoepfe"><button type="button" class="btn ghost bs-abbruch">Abbrechen</button><button class="btn primary">Speichern</button></div>
      </form>`;
    document.body.appendChild(m);
    const f = m.querySelector('form'), fe = f.querySelector('.bs-fehler');
    f.a.focus();
    m.querySelector('.bs-abbruch').onclick = () => m.remove();
    f.onsubmit = async e => {
      e.preventDefault();
      if (f.a.value !== f.b.value){ fe.textContent = 'Die beiden Passwörter stimmen nicht überein.'; return; }
      const k = f.querySelector('.btn.primary'); k.disabled = true; k.textContent = 'Verschlüssele …';
      try {
        const v = await LSVGit.encryptToken(s.token, f.a.value);
        const inhalt = JSON.stringify({...s.cfg, ...v, art: 'bilder'}, null, 2) + '\n';
        await gh.commit([{path: 'admin/bilder-zugang.json', text: inhalt}], 'Passwort der Bildersammlung festgelegt');
        m.remove(); status('Bilder-Passwort gespeichert ✓ – gilt in ca. 1 Minute.');
      } catch (err){ fe.textContent = err.message; k.disabled = false; k.textContent = 'Speichern'; }
    };
  }

  app.addEventListener('click', e => { if (gh && app.querySelector('.bs-leiste')) klick(e); });
  start();
})();
