/* =====================================================================
   LSV Regensburg – Seite „Bilder“ (seiten/bilder.html)
   Bilder hochladen, Ordner anlegen, ansehen (Großansicht), auswählen,
   per Ziehen in Ordner verschieben, herunterladen (mehrere als ZIP),
   löschen und nach Datum sortieren.
   Geschützt mit einem eigenen Passwort: admin/bilder-zugang.json enthält den
   GitHub-Schlüssel, mit dem Bilder-Passwort verschlüsselt (wie admin/zugang.json
   für den Bearbeitungsmodus). Mit dem Passwort des Bearbeitungsmodus kann man
   sich ebenfalls anmelden und dann das Bilder-Passwort festlegen oder ändern.
   Datumsangaben: bilder/.info.json – Aufnahmedatum (aus den Kameradaten beim
   Hochladen) und Hochladedatum je Bild.
   ===================================================================== */
(() => {
  const B = LSVBilder, esc = B.esc;
  const base = new URL('..', document.currentScript.src);
  const app = document.getElementById('bs-app');
  const SKEY = 'lsv-bilder-session', SORTKEY = 'lsv-bilder-sortierung';
  const INFO = B.WURZEL + '/.info.json';
  const ZIEHTYP = 'application/x-lsv-bilder';
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

  /* ---------------- Zustand ---------------- */
  let s, gh, daten = {ordner: [''], bilder: [], dateien: []}, aktuell = '', beschaeftigt = false;
  let info = {}, infoGeaendert = false;                      // pfad -> {auf: Aufnahme, hoch: Hochgeladen}
  const lokal = new Map();                                   // frisch hochgeladene Bilder sofort zeigen
  const auswahl = new Set();
  let sortierung = 'neu';
  try { sortierung = localStorage.getItem(SORTKEY) || 'neu'; } catch {}

  const datumFmt = new Intl.DateTimeFormat('de-DE', {day: '2-digit', month: '2-digit', year: 'numeric'});
  const datumText = iso => { const d = iso && new Date(iso); return d && !isNaN(d) ? datumFmt.format(d) : ''; };
  const datumVon = b => { const i = info[b.pfad] || {}; return i.auf || i.hoch || ''; };
  const bildUrl = b => lokal.get(b.pfad) || B.vorschau(s.cfg, b.pfad);
  const seitenUrl = p => new URL(p.split('/').map(encodeURIComponent).join('/'), base).href;
  const bild = p => daten.bilder.find(b => b.pfad === p);
  const bilderHier = () => {
    const l = daten.bilder.filter(b => b.ordner === aktuell);
    const zeit = b => Date.parse(datumVon(b)) || 0, hoch = b => Date.parse((info[b.pfad] || {}).hoch) || 0;
    if (sortierung === 'name') l.sort((a, b) => a.name.localeCompare(b.name, 'de', {numeric: true}));
    else if (sortierung === 'alt') l.sort((a, b) => zeit(a) - zeit(b) || a.name.localeCompare(b.name));
    else if (sortierung === 'hoch') l.sort((a, b) => hoch(b) - hoch(a) || a.name.localeCompare(b.name));
    else l.sort((a, b) => zeit(b) - zeit(a) || a.name.localeCompare(b.name));
    return l;
  };

  function start(){
    s = sitzung.get(); if (!s) return anmelden();
    gh = LSVGit.client(s.cfg, s.token);
    try { aktuell = decodeURIComponent((location.hash.match(/^#ordner=(.*)$/) || [])[1] || ''); } catch { aktuell = ''; }
    app.innerHTML = `
      <div class="bs-leiste">
        <nav class="bs-pfad" aria-label="Ordner"></nav>
        <div class="bs-knoepfe">
          <label class="bs-sortierung">Sortieren
            <select>
              <option value="neu">Datum – neueste zuerst</option>
              <option value="alt">Datum – älteste zuerst</option>
              <option value="hoch">Zuletzt hochgeladen</option>
              <option value="name">Name A–Z</option>
            </select>
          </label>
          <button type="button" class="btn ghost bs-neu-ordner">＋ Neuer Ordner</button>
          <label class="btn primary bs-hoch">⬆ Bilder hochladen<input type="file" accept="image/*" multiple hidden></label>
        </div>
      </div>
      <div class="bs-auswahl" hidden>
        <b class="bs-anzahl"></b>
        <button type="button" data-akt="alle">Alle auswählen</button>
        <button type="button" data-akt="verschieben">📁 Verschieben</button>
        <button type="button" data-akt="laden">⬇ Herunterladen</button>
        <button type="button" data-akt="loeschen" class="bs-rot">🗑 Löschen</button>
        <button type="button" data-akt="keine" class="bs-x-klein" title="Auswahl aufheben" aria-label="Auswahl aufheben">✕</button>
      </div>
      <p class="bs-status" aria-live="polite"></p>
      <p class="bs-tipp">Tipp: Bilder auf einen Ordner ziehen, um sie zu verschieben · Strg+Klick oder Kästchen oben links zum Auswählen</p>
      <div class="bs-zone"><div class="bs-inhalt"><p class="bs-leer">Lade Bilder …</p></div>
        <div class="bs-drop" aria-hidden="true"><span>Bilder hier loslassen</span></div></div>
      <div class="bs-unten">
        ${s.rolle === 'admin' ? '<button type="button" class="bs-link bs-pw">🔑 Bilder-Passwort festlegen</button>' : ''}
        <button type="button" class="bs-link bs-ab">Abmelden</button>
      </div>`;
    app.querySelector('.bs-ab').onclick = () => { sitzung.clear(); location.hash = ''; anmelden(); };
    const pwKnopf = app.querySelector('.bs-pw'); if (pwKnopf) pwKnopf.onclick = passwortFestlegen;
    app.querySelector('.bs-neu-ordner').onclick = neuerOrdner;
    const sel = app.querySelector('.bs-sortierung select');
    sel.value = sortierung;
    sel.onchange = () => { sortierung = sel.value; try { localStorage.setItem(SORTKEY, sortierung); } catch {} zeichnen(); };
    const inp = app.querySelector('.bs-hoch input');
    inp.onchange = () => { const f = [...inp.files]; inp.value = ''; if (f.length) hochladen(f); };
    // Dateien vom Computer hineinziehen
    const zone = app.querySelector('.bs-zone');
    let tiefe = 0;
    const istDatei = e => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
    zone.addEventListener('dragenter', e => { if (istDatei(e)){ e.preventDefault(); tiefe++; zone.classList.add('bs-ueber'); } });
    zone.addEventListener('dragover', e => { if (istDatei(e)) e.preventDefault(); });
    zone.addEventListener('dragleave', e => { if (istDatei(e) && --tiefe <= 0){ tiefe = 0; zone.classList.remove('bs-ueber'); } });
    zone.addEventListener('drop', e => {
      if (!istDatei(e)) return;
      e.preventDefault(); tiefe = 0; zone.classList.remove('bs-ueber');
      const f = [...e.dataTransfer.files].filter(x => /^image\//.test(x.type) || /\.(jpe?g|png|webp|gif)$/i.test(x.name));
      if (f.length) hochladen(f);
    });
    laden();
  }

  const status = (t, fehler) => { const el = app.querySelector('.bs-status'); if (!el) return; el.textContent = t || ''; el.classList.toggle('bs-rot', !!fehler); };

  async function laden(){
    try {
      daten = await B.liste(gh);
      if (!daten.ordner.includes(aktuell)) aktuell = '';
      if (daten.dateien.includes(INFO)){ try { info = JSON.parse(await gh.getText(INFO)) || {}; } catch { info = {}; } }
      for (const p of [...auswahl]) if (!bild(p)) auswahl.delete(p);
      zeichnen();
      hochladeDatenErgaenzen();
    } catch (err){ app.querySelector('.bs-inhalt').innerHTML = `<p class="bs-leer">Bilder konnten nicht geladen werden: ${esc(err.message)}</p>`; }
  }
  // Für Bilder ohne gespeichertes Datum: Zeitpunkt des Hochladens aus GitHub holen (wird beim nächsten Speichern mit abgelegt)
  async function hochladeDatenErgaenzen(){
    const fehlt = daten.bilder.filter(b => !(info[b.pfad] && info[b.pfad].hoch)).slice(0, 150);
    if (!fehlt.length || !gh.lastCommitDate) return;
    let i = 0;
    const arbeiter = async () => {
      while (i < fehlt.length){
        const b = fehlt[i++];
        try { const d = await gh.lastCommitDate(b.pfad); if (d){ info[b.pfad] = {...info[b.pfad], hoch: d}; infoGeaendert = true; } } catch {}
      }
    };
    await Promise.all([1, 2, 3, 4].map(arbeiter));
    zeichnen();
  }
  // .info.json aufräumen und den Speicherungen beilegen
  function infoBeilegen(dateien, neu){
    const bleibt = new Set(daten.bilder.map(b => b.pfad));
    for (const f of dateien){ if (f.remove) bleibt.delete(f.path); else if (B.BILD.test(f.path)) bleibt.add(f.path); }
    const sauber = {};
    for (const p of Object.keys(neu).sort()) if (bleibt.has(p)) sauber[p] = neu[p];
    if (!infoGeaendert && JSON.stringify(sauber) === JSON.stringify(info)) return;
    dateien.push({path: INFO, text: JSON.stringify(sauber, null, 1) + '\n'});
    info = sauber; infoGeaendert = false;
  }

  /* ---------------- Anzeigen ---------------- */
  function zeichnen(){
    if (!app.querySelector('.bs-leiste')) return;
    history.replaceState(null, '', aktuell ? '#ordner=' + encodeURIComponent(aktuell) : location.pathname + location.search);
    const teile = aktuell ? aktuell.split('/') : [];
    app.querySelector('.bs-pfad').innerHTML = `<button type="button" data-o="" data-ziel="">🗂 Alle Bilder</button>` +
      teile.map((t, i) => { const o = esc(teile.slice(0, i + 1).join('/')); return `<span>›</span><button type="button" data-o="${o}" data-ziel="${o}">${esc(t)}</button>`; }).join('');
    const ord = B.kinder(daten.ordner, aktuell);
    const bil = bilderHier();
    const anzahl = o => daten.bilder.filter(b => b.ordner === o || b.ordner.startsWith(o + '/')).length;
    app.querySelector('.bs-inhalt').innerHTML = (ord.length || bil.length) ? `<div class="bs-raster">
        ${ord.map(o => `<div class="bs-kachel bs-ordner-k" data-ziel="${esc(o)}">
            <button type="button" class="bs-ordner" data-o="${esc(o)}"><span class="bs-ico">📁</span><span>${esc(B.ordnerName(o))}</span><small>${anzahl(o)} Bild${anzahl(o) === 1 ? '' : 'er'}</small></button>
            <div class="bs-aktionen"><button type="button" data-ordner-weg="${esc(o)}" title="Ordner löschen">🗑</button></div>
          </div>`).join('')}
        ${bil.map(b => { const i = info[b.pfad] || {}, an = auswahl.has(b.pfad); return `<div class="bs-kachel bs-bild-k${an ? ' bs-an' : ''}" draggable="true" data-pfad="${esc(b.pfad)}">
            <label class="bs-wahl" title="Auswählen"><input type="checkbox" data-wahl="${esc(b.pfad)}"${an ? ' checked' : ''} aria-label="${esc(b.name)} auswählen"></label>
            <button type="button" class="bs-bild" data-gross="${esc(b.pfad)}" title="${esc(b.name)} – groß ansehen"><img loading="lazy" alt="" draggable="false" src="${esc(bildUrl(b))}"><span>${esc(b.name)}</span>
              <small>${i.auf ? '📷 ' + datumText(i.auf) : i.hoch ? '⬆ ' + datumText(i.hoch) : '&nbsp;'}</small></button>
            <div class="bs-aktionen"><button type="button" data-kopie="${esc(b.pfad)}" title="Adresse kopieren">🔗</button><button type="button" data-weg="${esc(b.pfad)}" title="Bild löschen">🗑</button></div>
          </div>`; }).join('')}
      </div>` : `<div class="bs-leer bs-leer-gross"><span aria-hidden="true">🖼</span><p>${aktuell ? 'Dieser Ordner ist noch leer.' : 'Noch keine Bilder.'}</p><p>Klicke auf „Bilder hochladen“ oder ziehe Bilder hierher.</p></div>`;
    auswahlZeigen();
  }
  function auswahlZeigen(){
    const leiste = app.querySelector('.bs-auswahl'); if (!leiste) return;
    leiste.hidden = !auswahl.size;
    app.classList.toggle('bs-waehlen', auswahl.size > 0);
    leiste.querySelector('.bs-anzahl').textContent = `${auswahl.size} ausgewählt`;
    app.querySelectorAll('.bs-bild-k').forEach(k => {
      const an = auswahl.has(k.dataset.pfad);
      k.classList.toggle('bs-an', an);
      const c = k.querySelector('input'); if (c) c.checked = an;
    });
  }
  const umschalten = p => { auswahl.has(p) ? auswahl.delete(p) : auswahl.add(p); auswahlZeigen(); };

  /* ---------------- Großansicht ---------------- */
  let gross = null;
  function grossZeigen(p){
    const liste = bilderHier(); let i = liste.findIndex(b => b.pfad === p); if (i < 0) return;
    if (!gross){
      gross = document.createElement('div');
      gross.className = 'bs-gross';
      gross.setAttribute('role', 'dialog'); gross.setAttribute('aria-modal', 'true');
      gross.innerHTML = `<figure><img alt=""><figcaption><b></b><span class="bs-gross-info"></span>
          <span class="bs-gross-knoepfe"><button type="button" data-g="laden">⬇ Herunterladen</button><button type="button" data-g="kopie">🔗 Adresse kopieren</button></span></figcaption></figure>
        <button type="button" class="bs-gross-x" data-g="zu" aria-label="Schließen (Esc)">✕</button>
        <button type="button" class="bs-gross-pfeil bs-links" data-g="zurueck" aria-label="Vorheriges Bild">‹</button>
        <button type="button" class="bs-gross-pfeil bs-rechts" data-g="weiter" aria-label="Nächstes Bild">›</button>`;
      document.body.appendChild(gross);
      gross.addEventListener('click', e => {
        const k = e.target.closest('[data-g]');
        if (!k){ if (e.target === gross || e.target.tagName === 'FIGURE') grossZu(); return; }
        const g = k.dataset.g, b = gross._bild;
        if (g === 'zu') grossZu();
        else if (g === 'zurueck') blaettern(-1);
        else if (g === 'weiter') blaettern(1);
        else if (g === 'laden') herunterladen([b.pfad]);
        else if (g === 'kopie') kopieren(b.pfad);
      });
    }
    const zeigen = n => {
      i = (n + liste.length) % liste.length;
      const b = liste[i], inf = info[b.pfad] || {};
      gross._bild = b;
      gross.querySelector('img').src = bildUrl(b);
      gross.querySelector('b').textContent = b.name;
      gross.querySelector('.bs-gross-info').textContent = [inf.auf ? 'Aufgenommen ' + datumText(inf.auf) : '', inf.hoch ? 'Hochgeladen ' + datumText(inf.hoch) : '', `${i + 1} von ${liste.length}`].filter(Boolean).join(' · ');
      gross.querySelectorAll('.bs-gross-pfeil').forEach(x => x.hidden = liste.length < 2);
    };
    gross._blaettern = d => zeigen(i + d);
    zeigen(i);
    gross.classList.add('bs-offen');
    document.documentElement.classList.add('bs-gross-offen');
    gross.querySelector('.bs-gross-x').focus();
  }
  const blaettern = d => gross && gross._blaettern(d);
  function grossZu(){
    if (!gross || !gross.classList.contains('bs-offen')) return;
    gross.classList.remove('bs-offen');
    document.documentElement.classList.remove('bs-gross-offen');
  }
  // Esc schließt die Großansicht (vor dem „Esc = Startseite“ des Bearbeitungs-Ladeskripts), Pfeiltasten blättern
  document.addEventListener('keydown', e => {
    if (gross && gross.classList.contains('bs-offen')){
      if (e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); grossZu(); }
      else if (e.key === 'ArrowLeft'){ e.preventDefault(); blaettern(-1); }
      else if (e.key === 'ArrowRight'){ e.preventDefault(); blaettern(1); }
      return;
    }
    if (e.key === 'Escape' && auswahl.size && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)){ e.preventDefault(); auswahl.clear(); auswahlZeigen(); }
  }, true);

  /* ---------------- Klicks ---------------- */
  async function kopieren(p){
    const url = seitenUrl(p);
    try { await navigator.clipboard.writeText(url); status('Adresse kopiert ✓'); } catch { prompt('Adresse des Bildes:', url); }
  }
  async function klick(e){
    const w = e.target.closest('[data-wahl]');
    if (w){ e.stopPropagation(); umschalten(w.dataset.wahl); return; }
    if (e.target.closest('.bs-wahl')) return;
    const o = e.target.closest('[data-o]'); if (o){ aktuell = o.dataset.o; zeichnen(); return; }
    const g = e.target.closest('[data-gross]');
    if (g){
      if (e.ctrlKey || e.metaKey || e.shiftKey || auswahl.size){ umschalten(g.dataset.gross); return; }
      grossZeigen(g.dataset.gross); return;
    }
    const k = e.target.closest('[data-kopie]'); if (k){ kopieren(k.dataset.kopie); return; }
    const w2 = e.target.closest('[data-weg]'); if (w2){ loeschen([w2.dataset.weg]); return; }
    const ow = e.target.closest('[data-ordner-weg]'); if (ow){ ordnerLoeschen(ow.dataset.ordnerWeg); return; }
    const a = e.target.closest('[data-akt]');
    if (a){
      const akt = a.dataset.akt, l = [...auswahl];
      if (akt === 'alle'){ bilderHier().forEach(b => auswahl.add(b.pfad)); auswahlZeigen(); }
      else if (akt === 'keine'){ auswahl.clear(); auswahlZeigen(); }
      else if (akt === 'verschieben') verschiebenDialog(l);
      else if (akt === 'laden') herunterladen(l);
      else if (akt === 'loeschen') loeschen(l);
    }
  }
  app.addEventListener('click', e => { if (gh && app.querySelector('.bs-leiste')) klick(e); });

  /* ---------------- Bilder auf Ordner ziehen ---------------- */
  let gezogen = null;
  app.addEventListener('dragstart', e => {
    const k = e.target.closest && e.target.closest('.bs-bild-k'); if (!k) return;
    gezogen = auswahl.has(k.dataset.pfad) ? [...auswahl] : [k.dataset.pfad];
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData(ZIEHTYP, JSON.stringify(gezogen));
    e.dataTransfer.setData('text/plain', gezogen.length + ' Bild(er)');
    app.classList.add('bs-zieht');
    gezogen.forEach(p => { const x = app.querySelector(`.bs-bild-k[data-pfad="${CSS.escape(p)}"]`); if (x) x.classList.add('bs-gezogen'); });
  });
  app.addEventListener('dragend', () => {
    gezogen = null; app.classList.remove('bs-zieht');
    app.querySelectorAll('.bs-gezogen, .bs-ziel-an').forEach(x => x.classList.remove('bs-gezogen', 'bs-ziel-an'));
  });
  const zielVon = e => gezogen && e.target.closest && e.target.closest('[data-ziel]');
  app.addEventListener('dragover', e => { const z = zielVon(e); if (z){ e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } });
  app.addEventListener('dragenter', e => { const z = zielVon(e); if (z){ e.preventDefault(); app.querySelectorAll('.bs-ziel-an').forEach(x => x !== z && x.classList.remove('bs-ziel-an')); z.classList.add('bs-ziel-an'); } });
  app.addEventListener('dragleave', e => { const z = zielVon(e); if (z && !z.contains(e.relatedTarget)) z.classList.remove('bs-ziel-an'); });
  app.addEventListener('drop', e => {
    const z = zielVon(e); if (!z) return;
    e.preventDefault(); e.stopPropagation();
    const l = gezogen; gezogen = null;
    z.classList.remove('bs-ziel-an');
    verschieben(l, z.dataset.ziel);
  });

  /* ---------------- Speichern ---------------- */
  async function arbeit(fn){
    if (beschaeftigt){ status('Bitte warten, es wird noch gespeichert …'); return; }
    beschaeftigt = true; app.classList.add('bs-busy');
    try { await fn(); }
    catch (err){ status('Nicht gespeichert: ' + err.message, true); }
    finally { beschaeftigt = false; app.classList.remove('bs-busy'); }
  }

  // Seiten der Website, auf denen Bilder der Sammlung eingebaut sind
  async function verwendungen(pfade){
    const html = (await gh.listFiles()).filter(p => /\.html$/.test(p) && p.includes('/') || /^index\.html$/.test(p));
    const res = new Map(); let i = 0;
    const formen = p => [...new Set([p, encodeURI(p)])];
    const arbeiter = async () => {
      while (i < html.length){
        const f = html[i++];
        let t; try { t = await gh.getText(f); } catch { continue; }
        if (!t.includes(B.WURZEL + '/')) continue;
        const treffer = pfade.filter(p => formen(p).some(x => t.includes(x)));
        if (treffer.length) res.set(f, {text: t, treffer});
      }
    };
    await Promise.all([1, 2, 3, 4, 5, 6].map(arbeiter));
    return res;
  }
  const ersetzen = (t, alt, neu) => { for (const x of new Set([alt, encodeURI(alt)])) t = t.split(x).join(encodeURI(neu)); return t; };
  const seitenName = f => f.replace(/\.html$/, '').replace(/^seiten\//, '').replace(/^index$/, 'Startseite');

  async function verschieben(pfade, ziel){
    const liste = (pfade || []).map(bild).filter(b => b && b.ordner !== ziel);
    if (!liste.length){ status('Die Bilder liegen schon in diesem Ordner.'); return; }
    await arbeit(async () => {
      const vergeben = new Set(daten.dateien), umzug = new Map();
      for (const b of liste){
        let neu = `${B.WURZEL}/${ziel ? ziel + '/' : ''}${b.name}`, n = 2;
        while (vergeben.has(neu)) neu = `${B.WURZEL}/${ziel ? ziel + '/' : ''}${b.name.replace(/(\.[a-z0-9]+)$/i, `-${n++}$1`)}`;
        vergeben.add(neu); umzug.set(b.pfad, neu);
      }
      status('Prüfe, wo die Bilder auf der Website verwendet werden …');
      const seiten = await verwendungen([...umzug.keys()]);
      const dateien = [], neuInfo = {...info};
      for (const [alt, neu] of umzug){
        dateien.push({path: neu, sha: bild(alt).sha}, {path: alt, remove: true});
        if (neuInfo[alt]){ neuInfo[neu] = neuInfo[alt]; delete neuInfo[alt]; }
        if (lokal.has(alt)){ lokal.set(neu, lokal.get(alt)); lokal.delete(alt); }
      }
      for (const [f, {text}] of seiten){
        let t = text; for (const [alt, neu] of umzug) t = ersetzen(t, alt, neu);
        dateien.push({path: f, text: t});
      }
      infoBeilegen(dateien, neuInfo);
      status('Verschiebe …');
      await gh.commit(dateien, `${umzug.size} Bild${umzug.size === 1 ? '' : 'er'} verschoben nach ${B.WURZEL}/${ziel}`);
      auswahl.clear();
      await laden();
      status(`${umzug.size} Bild${umzug.size === 1 ? '' : 'er'} nach „${B.ordnerName(ziel)}“ verschoben ✓` +
        (seiten.size ? ` – auf ${seiten.size} Seite${seiten.size === 1 ? '' : 'n'} der Website automatisch angepasst (${[...seiten.keys()].map(seitenName).join(', ')}).` : ''));
    });
  }

  function verschiebenDialog(pfade){
    if (!pfade.length) return;
    const ziele = daten.ordner;
    const m = document.createElement('div');
    m.className = 'bs-modal';
    m.innerHTML = `<form class="k-karte bs-dialog">
        <h2>${pfade.length} Bild${pfade.length === 1 ? '' : 'er'} verschieben</h2>
        <label>In welchen Ordner?
          <select name="ziel">${ziele.map(o => `<option value="${esc(o)}"${o === aktuell ? ' selected' : ''}>${o ? '📁 ' + esc(o.split('/').join(' › ')) : '🗂 Alle Bilder (oberste Ebene)'}</option>`).join('')}</select>
        </label>
        <div class="bs-dialog-knoepfe"><button type="button" class="btn ghost bs-abbruch">Abbrechen</button><button class="btn primary">Verschieben</button></div>
      </form>`;
    document.body.appendChild(m);
    const f = m.querySelector('form');
    f.ziel.focus();
    m.querySelector('.bs-abbruch').onclick = () => m.remove();
    m.addEventListener('keydown', e => { if (e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); m.remove(); } });
    f.onsubmit = e => { e.preventDefault(); const z = f.ziel.value; m.remove(); verschieben(pfade, z); };
  }

  async function loeschen(pfade){
    pfade = pfade.filter(bild);
    if (!pfade.length) return;
    await arbeit(async () => {
      status('Prüfe, wo die Bilder auf der Website verwendet werden …');
      const seiten = await verwendungen(pfade);
      status('');
      const namen = pfade.length === 1 ? `„${pfade[0].split('/').pop()}“` : `${pfade.length} Bilder`;
      const hinweis = seiten.size ? `\n\nAchtung: verwendet auf ${[...seiten.keys()].map(seitenName).join(', ')} – dort fehlt das Bild danach.` : '';
      if (!confirm(`${namen} wirklich löschen?${hinweis}`)) return;
      const dateien = pfade.map(p => ({path: p, remove: true}));
      const neuInfo = {...info}; pfade.forEach(p => delete neuInfo[p]);
      infoBeilegen(dateien, neuInfo);
      await gh.commit(dateien, pfade.length === 1 ? `Bild gelöscht: ${pfade[0]}` : `${pfade.length} Bilder gelöscht`);
      pfade.forEach(p => auswahl.delete(p));
      await laden();
      status(pfade.length === 1 ? 'Bild gelöscht ✓' : `${pfade.length} Bilder gelöscht ✓`);
    });
  }

  async function ordnerLoeschen(o){
    const pre = B.WURZEL + '/' + o + '/';
    const dateien = daten.dateien.filter(p => p.startsWith(pre));
    const bil = dateien.filter(p => B.BILD.test(p));
    await arbeit(async () => {
      let hinweis = '';
      if (bil.length){
        status('Prüfe, wo die Bilder auf der Website verwendet werden …');
        const seiten = await verwendungen(bil);
        status('');
        if (seiten.size) hinweis = `\n\nAchtung: Bilder daraus sind verwendet auf ${[...seiten.keys()].map(seitenName).join(', ')}.`;
      }
      if (!confirm((bil.length ? `Ordner „${B.ordnerName(o)}“ mit ${bil.length} Bild${bil.length === 1 ? '' : 'ern'} wirklich löschen?` : `Leeren Ordner „${B.ordnerName(o)}“ löschen?`) + hinweis)) return;
      const liste = dateien.map(p => ({path: p, remove: true}));
      const neuInfo = {...info}; bil.forEach(p => delete neuInfo[p]);
      infoBeilegen(liste, neuInfo);
      await gh.commit(liste, `Ordner gelöscht: ${pre}`);
      await laden();
      status('Ordner gelöscht ✓');
    });
  }

  const ordnerSicher = n => n.replace(/[\\/:*?"<>|#%&{}$!'@+`=~^\[\]]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
  function neuerOrdner(){
    const n = prompt(aktuell ? `Name des neuen Ordners in „${B.ordnerName(aktuell)}“:` : 'Name des neuen Ordners (z. B. „Fluglager 2027“):');
    if (n === null) return;
    const name = ordnerSicher(n);
    if (!name || name === '.' || name === '..') return status('Bitte einen gültigen Ordnernamen eingeben.', true);
    const ziel = aktuell ? aktuell + '/' + name : name;
    if (daten.ordner.some(o => o.toLowerCase() === ziel.toLowerCase())) return status(`Den Ordner „${name}“ gibt es hier schon.`, true);
    arbeit(async () => {
      const dateien = [{path: `${B.WURZEL}/${ziel}/${B.MARKE}`, text: 'Ordner der Bildersammlung\n'}];
      infoBeilegen(dateien, info);
      await gh.commit(dateien, `Ordner angelegt: ${ziel}`);
      aktuell = ziel;
      await laden();
      status(`Ordner „${name}“ angelegt ✓`);
    });
  }

  // Aufnahmedatum aus den Kameradaten (EXIF) eines JPG lesen – vor dem Verkleinern, denn dabei gehen sie verloren
  async function aufnahmeDatum(file){
    try {
      const v = new DataView(await file.slice(0, 256 * 1024).arrayBuffer());
      if (v.byteLength < 12 || v.getUint16(0) !== 0xFFD8) return null;
      let o = 2;
      while (o + 10 < v.byteLength){
        const mark = v.getUint16(o), len = v.getUint16(o + 2);
        if (mark === 0xFFE1 && v.getUint32(o + 4) === 0x45786966){          // „Exif“
          const t = o + 10, le = v.getUint16(t) === 0x4949;
          const u16 = p => v.getUint16(t + p, le), u32 = p => v.getUint32(t + p, le);
          const lies = (ifd, tags) => {
            const r = {}, n = u16(ifd);
            for (let i = 0; i < n; i++){ const e = ifd + 2 + i * 12, tag = u16(e); if (tags.includes(tag)) r[tag] = u32(e + 8); }
            return r;
          };
          const text = off => { let x = ''; for (let i = 0; i < 19; i++) x += String.fromCharCode(v.getUint8(t + off + i)); return x; };
          const ifd0 = lies(u32(4), [0x8769, 0x0132]);
          let d = null;
          if (ifd0[0x8769]){ const ex = lies(ifd0[0x8769], [0x9003, 0x9004]); d = ex[0x9003] ? text(ex[0x9003]) : ex[0x9004] ? text(ex[0x9004]) : null; }
          if (!d && ifd0[0x0132]) d = text(ifd0[0x0132]);
          const m = d && /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(d);
          return m && m[1] !== '0000' ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}` : null;
        }
        if ((mark & 0xFF00) !== 0xFF00 || mark === 0xFFDA) break;
        o += 2 + len;
      }
    } catch {}
    return null;
  }

  async function hochladen(dateien){
    if (beschaeftigt) return status('Bitte warten, es wird noch gespeichert …');
    beschaeftigt = true; app.classList.add('bs-busy');
    const stempel = Date.now().toString(36), liste = [], fehler = [], jetzt = new Date().toISOString();
    const vergeben = new Set(daten.dateien), neuInfo = {...info};
    try {
      for (let i = 0; i < dateien.length; i++){
        status(`Bereite Bild ${i + 1} von ${dateien.length} vor …`);
        try {
          const auf = await aufnahmeDatum(dateien[i]);
          const im = await B.vorbereiten(dateien[i]);
          let pfad = `${B.WURZEL}/${aktuell ? aktuell + '/' : ''}${im.name}.${im.ext}`;
          if (vergeben.has(pfad)) pfad = pfad.replace(/(\.[a-z]+)$/, `-${stempel}${i}$1`);
          vergeben.add(pfad);
          liste.push({path: pfad, bytes: im.bytes});
          lokal.set(pfad, im.url);
          neuInfo[pfad] = auf ? {auf, hoch: jetzt} : {hoch: jetzt};
        } catch (err){ fehler.push(err.message); }
      }
    } finally { beschaeftigt = false; app.classList.remove('bs-busy'); }
    if (!liste.length) return status(fehler.join(' '), true);
    await arbeit(async () => {
      status('Lade hoch …');
      const alle = [...liste];
      infoGeaendert = true;
      infoBeilegen(alle, neuInfo);
      await gh.commit(alle, `${liste.length} Bild${liste.length === 1 ? '' : 'er'} hochgeladen: ${B.WURZEL}/${aktuell}`);
      await laden();
      status(`${liste.length} Bild${liste.length === 1 ? '' : 'er'} hochgeladen ✓` + (fehler.length ? ' – nicht geklappt: ' + fehler.join(' ') : ''));
    });
  }

  /* ---------------- Herunterladen (mehrere als ZIP) ---------------- */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++){ let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = d => { let c = 0xFFFFFFFF; for (let i = 0; i < d.length; i++) c = CRC[(c ^ d[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function zipErstellen(dateien){                            // ohne Komprimierung (Fotos sind schon komprimiert)
    const enc = new TextEncoder(), teile = [], zentral = []; let off = 0;
    const j = new Date(), zeit = (j.getHours() << 11) | (j.getMinutes() << 5) | (j.getSeconds() >> 1), tag = ((j.getFullYear() - 1980) << 9) | ((j.getMonth() + 1) << 5) | j.getDate();
    for (const f of dateien){
      const n = enc.encode(f.name), c = crc32(f.daten), l = f.daten.length;
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(10, zeit, true); h.setUint16(12, tag, true);
      h.setUint32(14, c, true); h.setUint32(18, l, true); h.setUint32(22, l, true); h.setUint16(26, n.length, true);
      teile.push(h, n, f.daten);
      const z = new DataView(new ArrayBuffer(46));
      z.setUint32(0, 0x02014b50, true); z.setUint16(4, 20, true); z.setUint16(6, 20, true); z.setUint16(8, 0x0800, true); z.setUint16(12, zeit, true); z.setUint16(14, tag, true);
      z.setUint32(16, c, true); z.setUint32(20, l, true); z.setUint32(24, l, true); z.setUint16(28, n.length, true); z.setUint32(42, off, true);
      zentral.push(z, n);
      off += 30 + n.length + l;
    }
    const groesse = zentral.reduce((x, y) => x + y.byteLength, 0);
    const e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, dateien.length, true); e.setUint16(10, dateien.length, true); e.setUint32(12, groesse, true); e.setUint32(16, off, true);
    return new Blob([...teile, ...zentral, e], {type: 'application/zip'});
  }
  const holen = async b => {
    const r = await fetch(lokal.get(b.pfad) || B.vorschau(s.cfg, b.pfad), {cache: 'no-store'});
    if (!r.ok) throw new Error(`„${b.name}“ konnte nicht geladen werden.`);
    return r.blob();
  };
  const speichernAls = (blob, name) => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  };
  async function herunterladen(pfade){
    const liste = pfade.map(bild).filter(Boolean);
    if (!liste.length) return;
    try {
      if (liste.length === 1){ status('Lade …'); speichernAls(await holen(liste[0]), liste[0].name); status(''); return; }
      const dateien = [], namen = new Set();
      for (let i = 0; i < liste.length; i++){
        status(`Packe Bild ${i + 1} von ${liste.length} …`);
        let name = liste[i].pfad.slice(B.WURZEL.length + 1), n = 2;
        while (namen.has(name)) name = name.replace(/(\.[a-z0-9]+)$/i, `-${n++}$1`);
        namen.add(name);
        dateien.push({name, daten: new Uint8Array(await (await holen(liste[i])).arrayBuffer())});
      }
      speichernAls(zipErstellen(dateien), `LSV-Bilder-${new Date().toISOString().slice(0, 10)}.zip`);
      status(`${liste.length} Bilder als ZIP-Datei heruntergeladen ✓`);
    } catch (err){ status(err.message, true); }
  }

  /* ---------------- Bilder-Passwort ---------------- */
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

  start();
})();
