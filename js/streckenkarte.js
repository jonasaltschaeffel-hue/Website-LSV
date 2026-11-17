/* Streckenkarte auf der Seite „Streckenflug“: zeichnet die Streckenflüge einer Saison
   (Daten aus daten/strecken/, automatisch von WeGlide geholt) als leuchtende Linien.
   Jahres-Knöpfe aus daten/strecken/index.json; Maus/Finger über einer Linie zeigt den Flug. */
(() => {
  const box = document.getElementById('sf-box');
  if (!box) return;
  const DATEN = new URL('../daten/strecken/', document.currentScript.src).href;
  const jahre = box.querySelector('.sf-jahre'), karte = box.querySelector('.sf-karte'), cv = karte.querySelector('canvas');
  const leer = box.querySelector('.sf-leer'), info = box.querySelector('.sf-info');
  const nEl = box.querySelector('.sf-n'), kmEl = box.querySelector('.sf-km'), standEl = box.querySelector('.sf-stand');
  const ctx = cv.getContext('2d');
  const HEIM = {name: 'Oberhinkofen', lat: 48.9497, lng: 12.1436};
  const ORTE = [
    ['Nürnberg', 49.452, 11.077], ['München', 48.137, 11.575], ['Passau', 48.574, 13.461], ['Ingolstadt', 48.766, 11.425],
    ['Bayreuth', 49.945, 11.578], ['Würzburg', 49.792, 9.953], ['Stuttgart', 48.776, 9.18], ['Augsburg', 48.37, 10.898],
    ['Hof', 50.313, 11.912], ['Pilsen', 49.738, 13.373], ['Prag', 50.075, 14.437], ['Linz', 48.306, 14.286],
    ['Erfurt', 50.978, 11.029], ['Frankfurt', 50.11, 8.682], ['Salzburg', 47.81, 13.055], ['Ulm', 48.401, 9.988],
    ['Leipzig', 51.34, 12.375], ['Dresden', 51.05, 13.738], ['Chemnitz', 50.833, 12.92], ['Mannheim', 49.487, 8.466]
  ];
  const cache = {};
  let flugListe = [], bild = null, gewaehlt = -1, anim = 0;

  const dekodieren = s => {
    const out = []; let i = 0, lat = 0, lng = 0;
    while (i < s.length){
      for (const k of [0, 1]){
        let b, shift = 0, res = 0;
        do { b = s.charCodeAt(i++) - 63; res |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
        const d = res & 1 ? ~(res >> 1) : res >> 1;
        if (k === 0) lat += d; else lng += d;
      }
      out.push([lng / 1e4, lat / 1e4]);
    }
    return out;
  };
  // Ländergrenzen (Natural Earth, gemeinfrei) aus daten/laender.json
  let laender = null;
  fetch(new URL('../daten/laender.json', document.currentScript.src).href)
    .then(r => r.json())
    .then(j => { laender = j.laender.flatMap(l => l.r.map(r => ({de: l.n === 'DE', pts: dekodieren(r)}))); if (!anim) zeichnen(); })
    .catch(() => {});
  const datum = d => d ? d.split('-').reverse().join('.') : '';
  const zahl = n => n.toLocaleString('de-DE');

  // Projektion: Breitengrad-korrigiert, auf die Flüge der Saison eingepasst
  function ansicht(W, H){
    let x0 = HEIM.lng, x1 = HEIM.lng, y0 = HEIM.lat, y1 = HEIM.lat;
    flugListe.forEach(f => f.pts.forEach(([x, y]) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }));
    // Mindestausschnitt (ca. 400 × 300 km), damit auch bei wenigen kurzen Flügen Ländergrenzen sichtbar sind
    const MIN_LAT = 2.7, MIN_LNG = 5.5;
    if (y1 - y0 < MIN_LAT){ const m = (y0 + y1) / 2; y0 = m - MIN_LAT / 2; y1 = m + MIN_LAT / 2; }
    if (x1 - x0 < MIN_LNG){ const m = (x0 + x1) / 2; x0 = m - MIN_LNG / 2; x1 = m + MIN_LNG / 2; }
    const k = Math.cos((y0 + y1) / 2 * Math.PI / 180);
    const pad = Math.min(W, H) * .08;
    let w = (x1 - x0) * k || .5, h = (y1 - y0) || .5;
    const s = Math.min((W - 2 * pad) / w, (H - 2 * pad) / h);
    const ox = (W - w * s) / 2, oy = (H - h * s) / 2;
    return ([x, y]) => [ox + (x - x0) * k * s, oy + (y1 - y) * s];
  }

  function zeichnen(fortschritt = 1){
    const dpr = Math.min(devicePixelRatio || 1, 2), W = karte.clientWidth, H = karte.clientHeight;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)){ cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const P = ansicht(W, H);
    flugListe.forEach(f => { f.xy = f.pts.map(P); });

    // Raster wie auf einer Luftfahrtkarte
    ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.lineWidth = 1;
    for (let g = 0; g < W; g += 48){ ctx.beginPath(); ctx.moveTo(g + .5, 0); ctx.lineTo(g + .5, H); ctx.stroke(); }
    for (let g = 0; g < H; g += 48){ ctx.beginPath(); ctx.moveTo(0, g + .5); ctx.lineTo(W, g + .5); ctx.stroke(); }

    // Ländergrenzen
    if (laender){
      ctx.lineWidth = 1; ctx.lineJoin = 'round';
      laender.forEach(l => {
        ctx.beginPath();
        l.pts.forEach((p, j) => { const [x, y] = P(p); j ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
        ctx.closePath();
        ctx.fillStyle = l.de ? 'rgba(255,255,255,.055)' : 'rgba(255,255,255,.025)';
        ctx.strokeStyle = 'rgba(170,200,235,.38)';
        ctx.fill(); ctx.stroke();
      });
    }

    // Orte zur Orientierung
    ctx.font = '500 11px Barlow, sans-serif'; ctx.textBaseline = 'middle';
    ORTE.forEach(([name, lat, lng]) => {
      const [x, y] = P([lng, lat]);
      if (x < 30 || y < 14 || x > W - 30 || y > H - 14) return;
      ctx.fillStyle = 'rgba(185,205,227,.55)'; ctx.beginPath(); ctx.arc(x, y, 2, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(185,205,227,.6)'; ctx.fillText(name, x + 5, y);
    });

    // Flüge: leuchtende Linien, bis zum aktuellen Fortschritt der Einblend-Animation
    const anzahl = Math.ceil(flugListe.length * fortschritt);
    ctx.globalCompositeOperation = 'lighter'; ctx.lineJoin = ctx.lineCap = 'round';
    for (let i = 0; i < anzahl; i++){
      const f = flugListe[i];
      ctx.strokeStyle = i === gewaehlt ? 'rgba(0,0,0,0)' : 'rgba(80,190,255,.30)';
      ctx.lineWidth = 1.4;
      ctx.beginPath(); f.xy.forEach(([x, y], j) => j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    if (gewaehlt >= 0 && flugListe[gewaehlt]){
      const f = flugListe[gewaehlt];
      ctx.strokeStyle = 'rgba(255,199,44,.35)'; ctx.lineWidth = 7;
      ctx.beginPath(); f.xy.forEach(([x, y], j) => j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
      ctx.strokeStyle = '#ffc72c'; ctx.lineWidth = 2.2;
      ctx.beginPath(); f.xy.forEach(([x, y], j) => j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
    }

    // Heimatflugplatz
    const [hx, hy] = P([HEIM.lng, HEIM.lat]);
    ctx.fillStyle = 'rgba(200,16,46,.25)'; ctx.beginPath(); ctx.arc(hx, hy, 9, 0, 7); ctx.fill();
    ctx.fillStyle = '#e8304f'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(hx, hy, 4.5, 0, 7); ctx.fill(); ctx.stroke();
    ctx.font = '700 13px "Barlow Condensed", sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText(HEIM.name.toUpperCase(), hx + 11, hy + 1);

    // Maßstab
    const km100 = P([HEIM.lng + 100 / (111.32 * Math.cos(HEIM.lat * Math.PI / 180)), HEIM.lat])[0] - hx;
    const proKm = km100 / 100;
    const km = [500, 200, 100, 50, 20, 10, 5, 2, 1].find(k => k * proKm <= W * .25) || 1, len = km * proKm;
    ctx.strokeStyle = 'rgba(232,241,251,.7)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(W - 16 - len, H - 18); ctx.lineTo(W - 16, H - 18); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W - 16 - len, H - 23); ctx.lineTo(W - 16 - len, H - 13); ctx.moveTo(W - 16, H - 23); ctx.lineTo(W - 16, H - 13); ctx.stroke();
    ctx.font = '600 11px Barlow, sans-serif'; ctx.fillStyle = 'rgba(232,241,251,.8)'; ctx.textAlign = 'right';
    ctx.fillText(km + ' km', W - 16, H - 31); ctx.textAlign = 'left';
  }

  function einblenden(){
    cancelAnimationFrame(anim);
    const t0 = performance.now(), dauer = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1100;
    const schritt = t => {
      const p = dauer ? Math.min(1, (t - t0) / dauer) : 1;
      zeichnen(1 - Math.pow(1 - p, 3));
      anim = p < 1 ? requestAnimationFrame(schritt) : 0;
    };
    anim = requestAnimationFrame(schritt);
  }

  async function saison(jahr){
    jahre.querySelectorAll('button').forEach(b => b.setAttribute('aria-selected', b.dataset.jahr == jahr));
    gewaehlt = -1; info.classList.remove('an');
    leer.hidden = false; leer.textContent = 'Strecken werden geladen …';
    try {
      const d = cache[jahr] || (cache[jahr] = await (await fetch(DATEN + jahr + '.json', {cache: 'no-cache'})).json());
      flugListe = d.strecken.map(f => ({...f, pts: dekodieren(f.p)}));
      nEl.textContent = zahl(d.fluege); kmEl.textContent = zahl(d.km);
      leer.hidden = flugListe.length > 0;
      if (!flugListe.length) leer.textContent = `In der Saison ${jahr} gibt es noch keine Streckenflüge.`;
      einblenden();
    } catch {
      flugListe = []; zeichnen(); nEl.textContent = kmEl.textContent = '–';
      leer.textContent = 'Die Strecken konnten gerade nicht geladen werden.';
    }
  }

  // Linie unter Maus/Finger finden
  function treffer(mx, my){
    let best = -1, bestD = 9 * 9;
    flugListe.forEach((f, i) => {
      const xy = f.xy || [];
      for (let j = 1; j < xy.length; j++){
        const [ax, ay] = xy[j - 1], [bx, by] = xy[j], dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
        let t = l ? ((mx - ax) * dx + (my - ay) * dy) / l : 0; t = Math.max(0, Math.min(1, t));
        const qx = ax + t * dx - mx, qy = ay + t * dy - my, d = qx * qx + qy * qy;
        if (d < bestD){ bestD = d; best = i; }
      }
    });
    return best;
  }
  function zeigen(ev){
    const r = cv.getBoundingClientRect(), i = treffer(ev.clientX - r.left, ev.clientY - r.top);
    if (i === gewaehlt) return;
    gewaehlt = i; zeichnen();
    if (i >= 0){ const f = flugListe[i]; info.innerHTML = `<b>${zahl(f.km)} km</b> · ${datum(f.d)}${f.fz ? ' · ' + f.fz.replace(/[<>&]/g, '') : ''}`; info.classList.add('an'); }
    else info.classList.remove('an');
  }
  cv.addEventListener('pointermove', zeigen);
  cv.addEventListener('pointerdown', zeigen);
  cv.addEventListener('pointerleave', () => { if (gewaehlt >= 0){ gewaehlt = -1; info.classList.remove('an'); zeichnen(); } });
  new ResizeObserver(() => { cancelAnimationFrame(anim); zeichnen(); }).observe(karte);

  function aufbauen(idx){
    const liste = [...idx.saisons].sort((a, b) => b - a);
    jahre.innerHTML = liste.map(j => `<button type="button" role="tab" data-jahr="${j}">${j}</button>`).join('');
    jahre.querySelectorAll('button').forEach(b => b.addEventListener('click', () => saison(+b.dataset.jahr)));
    standEl.textContent = idx.stand ? 'Stand: ' + datum(idx.stand) : '';
    saison(liste[0]);
  }
  (async () => {
    try { aufbauen(await (await fetch(DATEN + 'index.json', {cache: 'no-cache'})).json()); }
    catch { leer.textContent = 'Die Strecken werden gerade vorbereitet und erscheinen in Kürze.'; }
  })();

  /* ---------- Bearbeitungsmodus: Strecken aktualisieren ----------
     Die Daten holt das Lesezeichen „LSV-Strecken holen“ auf www.weglide.org (js/strecken-holen.js)
     und schickt sie hierher; gespeichert wird wie alles andere über GitHub (js/lsv-github.js). */
  let angemeldet = false;
  try { angemeldet = !!sessionStorage.getItem('lsv-edit-session'); } catch {}
  if (!angemeldet) return;

  const HOLEN = new URL('strecken-holen.js', document.currentScript.src).href;
  const WEGLIDE = 'https://www.weglide.org/club/145';
  const stil = document.createElement('style');
  stil.textContent = `
    .sf-admin{margin:-14px 0 30px;padding:16px 18px;border:2px dashed #f08a24;border-radius:14px;background:rgba(255,255,255,.75);font-size:15px;line-height:1.45}
    .sf-admin-kopf{color:#b25d0b}
    .sf-admin-knoepfe{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 8px}
    .sf-admin .sf-akt,.sf-admin .sf-datei{font:600 15px/1 Barlow,sans-serif;padding:10px 16px;border-radius:999px;cursor:pointer;border:1.5px solid #0d2440}
    .sf-admin .sf-akt{background:#0d2440;color:#fff}
    .sf-admin .sf-datei{background:#fff;color:#0d2440}
    .sf-admin .sf-schritte{margin:4px 0 8px 22px}
    .sf-admin details{margin-top:6px}
    .sf-admin summary{cursor:pointer;font-weight:600}
    .sf-admin details p{margin:8px 0;font-size:15px;line-height:1.5}
    .sf-admin .sf-anleitung{margin-top:10px;padding-top:8px;border-top:1px solid rgba(15,44,76,.15)}
    .sf-admin .sf-anleitung h4{font:700 16px/1.2 "Barlow Condensed",sans-serif;letter-spacing:.02em;margin:16px 0 4px;color:#0d2440}
    .sf-admin .sf-anleitung ul,.sf-admin .sf-anleitung ol{margin:4px 0 8px 22px}
    .sf-admin .sf-anleitung li{margin:3px 0}
    #sf-box ~ .sf-admin a.sf-lesezeichen{display:inline-block;padding:9px 16px;border-radius:999px;background:#ffc72c;color:#0d2440;font-weight:700;text-decoration:none;cursor:grab;box-shadow:0 4px 12px rgba(0,0,0,.15)}
    .sf-admin .sf-hinweis{font-size:13px;opacity:.75}
    .sf-admin .sf-status:not(:empty){margin-top:10px;padding:8px 12px;border-radius:10px;background:#eef4fb}
    .sf-admin .sf-status[data-art="ok"]{background:#e3f6ea;color:#17602f}
    .sf-admin .sf-status[data-art="warn"]{background:#fff4dc;color:#7a4a00}
    .sf-admin .sf-status[data-art="fehler"]{background:#fde6e9;color:#8a1426}`;
  document.head.appendChild(stil);
  const admin = document.createElement('div');
  admin.className = 'sf-admin';
  admin.innerHTML = `
    <div class="sf-admin-kopf"><b>Bearbeitungsmodus</b> · Strecken von WeGlide aktualisieren</div>
    <div class="sf-admin-knoepfe">
      <button type="button" class="sf-akt">✈️ Strecken aktualisieren</button>
      <label class="sf-datei">Datei hochladen<input type="file" accept=".json,application/json" hidden></label>
    </div>
    <ol class="sf-schritte">
      <li>„Strecken aktualisieren“ klicken – WeGlide öffnet sich in einem neuen Tab.</li>
      <li>Dort in der Lesezeichenleiste auf <b>„LSV-Strecken holen“</b> klicken.</li>
      <li>Warten, bis „Fertig“ erscheint – die Karte hier wird dann automatisch gespeichert.</li>
    </ol>
    <details class="sf-einrichten"><summary>Einmalig einrichten: Lesezeichen anlegen</summary>
      <p>Zieh diesen Knopf mit der Maus in deine Lesezeichenleiste (Chrome/Edge: Lesezeichenleiste mit Strg+Umschalt+B einblenden):</p>
      <p><a class="sf-lesezeichen" title="In die Lesezeichenleiste ziehen">⭐ LSV-Strecken holen</a></p>
      <p class="sf-hinweis">Das Lesezeichen funktioniert nur auf www.weglide.org. Es liest die öffentlichen Flugdaten des Vereins und übergibt sie an diese Seite.</p>
    </details>
    <details class="sf-anleitung"><summary>📖 Ausführliche Anleitung</summary>
      <h4>Warum ein Lesezeichen?</h4>
      <p>Die Strecken kommen von WeGlide. WeGlide erlaubt das Auslesen der Flugdaten nur von der eigenen Seite www.weglide.org aus – nicht von unserer Website und nicht von Servern. Deshalb holt ein Lesezeichen die Daten direkt auf WeGlide ab und gibt sie an diese Seite weiter, die sie dann wie jede andere Änderung speichert.</p>

      <h4>Was du brauchst</h4>
      <ul>
        <li>Einen Computer mit Chrome, Edge oder Firefox (am Handy funktionieren Lesezeichen dieser Art nur umständlich).</li>
        <li>Die Anmeldung hier im Bearbeitungsmodus. Ein WeGlide-Konto ist nicht nötig.</li>
      </ul>

      <h4>1. Einmalig: Lesezeichen anlegen</h4>
      <ol>
        <li>Lesezeichenleiste einblenden: <b>Strg+Umschalt+B</b> (Mac: Cmd+Umschalt+B).</li>
        <li>Oben unter „Einmalig einrichten“ den gelben Knopf <b>„⭐ LSV-Strecken holen“</b> mit gedrückter Maustaste in die Lesezeichenleiste <b>ziehen</b> und dort loslassen. Nicht anklicken – ein Klick hier bewirkt nichts.</li>
        <li>Das Lesezeichen bleibt dauerhaft in diesem Browser. Auf einem anderen Computer oder Browser legst du es dort einmal neu an. Mit eingeschalteter Browser-Synchronisierung erscheint es auch auf deinen anderen Geräten.</li>
      </ol>

      <h4>2. Strecken aktualisieren (z. B. nach einem Flugwochenende)</h4>
      <ol>
        <li>Hier auf <b>„✈️ Strecken aktualisieren“</b> klicken. WeGlide öffnet sich in einem neuen Tab.</li>
        <li>Im WeGlide-Tab in der Lesezeichenleiste auf <b>„LSV-Strecken holen“</b> klicken.</li>
        <li>Unten rechts erscheint ein Fenster mit Fortschrittsbalken. Den Tab dabei offen und im Vordergrund lassen.</li>
        <li>Wenn <b>„Fertig!“</b> erscheint, den WeGlide-Tab schließen und hierher zurückkehren. Hier steht dann „Gespeichert“ und die Karte zeigt sofort den neuen Stand.</li>
      </ol>
      <p>Beim allerersten Mal werden alle Flüge der letzten fünf Saisons geladen (rund 500 Flüge, etwa 2–4 Minuten). Danach werden nur noch neue Flüge geholt – das dauert meist nur Sekunden. Für Besucher ist die Karte etwa eine Minute nach dem Speichern aktuell (ggf. Seite neu laden).</p>

      <h4>Gut zu wissen</h4>
      <ul>
        <li><b>Neue Saison:</b> Bei WeGlide beginnt die neue Saison im Oktober. Sie kommt beim nächsten Aktualisieren automatisch dazu, die älteste fällt weg – es bleiben immer die letzten fünf.</li>
        <li><b>Gezeigt werden</b> nur Strecke, Datum, Kilometer und Flugzeugtyp – keine Namen. Gelöschte Flüge verschwinden beim nächsten Aktualisieren auch hier.</li>
        <li><b>Aktualisieren kann</b> jeder, der Zugang zum Bearbeitungsmodus hat.</li>
      </ul>

      <h4>Wenn etwas nicht klappt</h4>
      <ul>
        <li><b>„Der Browser hat das Öffnen blockiert“:</b> In der Adressleiste das Pop-up-Symbol anklicken, Pop-ups für diese Seite erlauben und nochmal auf „Strecken aktualisieren“ klicken. Alternativ www.weglide.org selbst in einem neuen Tab öffnen.</li>
        <li><b>Lesezeichenleiste nicht zu sehen:</b> Strg+Umschalt+B drücken.</li>
        <li><b>Beim Klick aufs Lesezeichen passiert nichts:</b> Prüfen, ob gerade wirklich ein Tab von www.weglide.org offen ist. Sonst erscheint der Hinweis, dass das Lesezeichen nur dort funktioniert.</li>
        <li><b>Eine Datei wurde heruntergeladen statt gespeichert:</b> Das passiert, wenn der WeGlide-Tab nicht von hier aus geöffnet wurde. Einfach hier auf <b>„Datei hochladen“</b> klicken und die Datei <i>lsv-strecken-….json</i> aus dem Download-Ordner auswählen.</li>
        <li><b>„Nicht mehr angemeldet“:</b> Die Anmeldung gilt nur für diesen Browser-Tab. Neu anmelden und dann die Datei hochladen bzw. erneut aktualisieren.</li>
        <li><b>„Das hat nicht geklappt“ im WeGlide-Fenster:</b> WeGlide ist gerade nicht erreichbar oder überlastet. Später noch einmal versuchen – bereits gespeicherte Strecken bleiben unverändert.</li>
      </ul>
    </details>
    <div class="sf-status" aria-live="polite"></div>`;
  box.after(admin);
  const lz = admin.querySelector('.sf-lesezeichen');
  lz.setAttribute('href', `javascript:(()=>{const s=document.createElement('script');s.src='${HOLEN}?'+Date.now();document.body.appendChild(s)})()`);
  lz.addEventListener('click', ev => { ev.preventDefault(); status('Den Knopf bitte nicht anklicken, sondern in die Lesezeichenleiste <b>ziehen</b>.', 'warn'); });
  const statusEl = admin.querySelector('.sf-status');
  const status = (html, art) => { statusEl.innerHTML = html; statusEl.dataset.art = art || ''; };

  const laden = src => new Promise((ok, fail) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = fail; document.head.appendChild(s); });
  async function speichern(paket){
    if (!paket || paket.typ !== 'lsv-strecken' || !paket.dateien) throw new Error('Das sind keine Streckendaten.');
    const files = [];
    for (const [path, text] of Object.entries(paket.dateien)){
      if (!/^daten\/strecken\/(\d{4}|index)\.json$/.test(path) || typeof text !== 'string') throw new Error('Unerwartete Datei: ' + path);
      JSON.parse(text);                                         // muss gültiges JSON sein
      files.push({path, text});
    }
    if (!window.LSVGit) await laden(new URL('lsv-github.js', document.currentScript?.src || HOLEN).href);
    const s = LSVGit.session.get();
    if (!s) throw new Error('Nicht mehr angemeldet – bitte neu im Bearbeitungsmodus anmelden.');
    status('Speichere bei GitHub …');
    await LSVGit.client(s.cfg, s.token).commit(files, `Streckenflüge von WeGlide aktualisiert (${paket.neu || 0} neue Flüge)`);
    // Karte sofort mit den neuen Daten zeigen (die Website selbst ist nach ca. 1 Minute aktuell)
    for (const [path, text] of Object.entries(paket.dateien)){ const m = path.match(/(\d{4})\.json$/); if (m) cache[+m[1]] = JSON.parse(text); }
    aufbauen(JSON.parse(paket.dateien['daten/strecken/index.json']));
    status(`<b>Gespeichert.</b> ${paket.neu ? paket.neu + ' neue Flüge' : 'Keine neuen Flüge'} · Saisons ${paket.saisons.join(', ')}. Für Besucher ist die Karte in etwa einer Minute aktuell.`, 'ok');
  }

  admin.querySelector('.sf-akt').addEventListener('click', () => {
    const w = window.open(WEGLIDE, 'lsv-weglide');
    status(w ? 'WeGlide ist geöffnet. Klicke dort jetzt in der Lesezeichenleiste auf <b>„LSV-Strecken holen“</b>.'
             : 'Der Browser hat das Öffnen blockiert – bitte Pop-ups für diese Seite erlauben.', w ? '' : 'warn');
  });
  addEventListener('message', async ev => {
    if (!/^https:\/\/(www\.)?weglide\.org$/.test(ev.origin) || ev.data?.typ !== 'lsv-strecken') return;
    try { ev.source?.postMessage({typ: 'lsv-strecken-ok'}, ev.origin); } catch {}
    try { await speichern(ev.data); } catch (e){ status('Speichern fehlgeschlagen: ' + String(e.message || e).replace(/[<>&]/g, ''), 'fehler'); }
  });
  admin.querySelector('.sf-datei input').addEventListener('change', async ev => {
    const f = ev.target.files[0]; ev.target.value = '';
    if (!f) return;
    try { await speichern(JSON.parse(await f.text())); } catch (e){ status('Datei konnte nicht übernommen werden: ' + String(e.message || e).replace(/[<>&]/g, ''), 'fehler'); }
  });
})();
