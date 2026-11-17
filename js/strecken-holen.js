/* „LSV-Strecken holen“ – läuft per Lesezeichen auf www.weglide.org (nur dort erlaubt WeGlide den Abruf).
   Holt die Streckenflüge des LSV Regensburg der letzten fünf Saisons, vereinfacht die Flugwege und
   schickt sie an den Website-Tab im Bearbeitungsmodus (der speichert sie bei GitHub).
   Ohne geöffneten Website-Tab wird stattdessen eine Datei heruntergeladen, die man dort hochladen kann.
   Bereits vorhandene Flüge (von der Website gelesen) werden nicht neu geladen. */
(async () => {
  const SKRIPT = document.currentScript ? new URL(document.currentScript.src) : null;
  const SEITE = SKRIPT ? new URL('../', SKRIPT).href : 'https://jonasaltschaeffel-hue.github.io/Website-LSV/';
  const DATEN = SEITE + 'daten/strecken/';
  const VEREIN = 145, LAND = 'DE', ANZAHL = 5, TOL = 0.002;

  if (!/(^|\.)weglide\.org$/.test(location.hostname)){
    alert('Dieses Lesezeichen funktioniert nur auf www.weglide.org.\nBitte zuerst WeGlide öffnen (im Bearbeitungsmodus: „Strecken aktualisieren“) und dann das Lesezeichen anklicken.');
    return;
  }
  if (window.__lsvHolt) return;
  window.__lsvHolt = true;

  // ---------- Anzeige ----------
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;z-index:2147483647;right:20px;bottom:20px;width:min(360px,calc(100vw - 40px));padding:18px 20px;border-radius:14px;' +
    'background:#0d2440;color:#e8f1fb;font:15px/1.45 system-ui,sans-serif;box-shadow:0 18px 50px rgba(0,0,0,.45)';
  box.innerHTML = '<div style="font-weight:700;font-size:17px;margin-bottom:6px">✈️ LSV-Strecken holen</div><div class="t">Starte …</div>' +
    '<div style="height:6px;border-radius:3px;background:rgba(255,255,255,.15);margin-top:10px;overflow:hidden"><div class="b" style="height:100%;width:0;background:#ffc72c;transition:width .2s"></div></div>';
  document.body.appendChild(box);
  const text = t => { box.querySelector('.t').innerHTML = t; };
  const balken = p => { box.querySelector('.b').style.width = Math.round(p * 100) + '%'; };
  const fertig = (html, farbe) => { text(html); balken(1); box.querySelector('.b').style.background = farbe || '#3ad16f'; window.__lsvHolt = false;
    const x = document.createElement('button'); x.textContent = 'Schließen'; x.style.cssText = 'margin-top:12px;padding:7px 14px;border-radius:999px;border:0;background:#ffc72c;color:#0d2440;font-weight:700;cursor:pointer';
    x.onclick = () => box.remove(); box.appendChild(x); };

  // ---------- Helfer ----------
  const pause = ms => new Promise(r => setTimeout(r, ms));
  async function api(pfad){
    for (let v = 1; ; v++){
      const r = await fetch('https://api.weglide.org/v1/' + pfad);
      if (r.ok) return r.json();
      if (v >= 3 || r.status === 404) throw new Error('WeGlide antwortet mit ' + r.status);
      await pause(2000 * v);
    }
  }
  async function liste(saison){
    let alle = [], skip = 0, seite;
    do {
      seite = await api(`flight?club_id_in=${VEREIN}&country_id_in=${LAND}&season_in=${saison}&skip=${skip}&limit=100&include_story=false&include_stats=false`);
      alle = alle.concat(seite); skip += 100;
    } while (seite.length === 100);
    return alle;
  }
  function vereinfachen(p, tol){
    if (p.length < 3) return p;
    const keep = new Uint8Array(p.length); keep[0] = keep[p.length - 1] = 1;
    const stack = [[0, p.length - 1]], t2 = tol * tol;
    while (stack.length){
      const [a, b] = stack.pop();
      const [ax, ay] = p[a], [bx, by] = p[b], dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
      let max = 0, idx = -1;
      for (let i = a + 1; i < b; i++){
        const [px, py] = p[i];
        let t = len ? ((px - ax) * dx + (py - ay) * dy) / len : 0; t = Math.max(0, Math.min(1, t));
        const qx = ax + t * dx - px, qy = ay + t * dy - py, d = qx * qx + qy * qy;
        if (d > max){ max = d; idx = i; }
      }
      if (max > t2){ keep[idx] = 1; stack.push([a, idx], [idx, b]); }
    }
    return p.filter((_, i) => keep[i]);
  }
  function kodieren(pts){
    let s = '', plat = 0, plng = 0;
    const zahl = v => { let x = v < 0 ? ~(v << 1) : v << 1; while (x >= 0x20){ s += String.fromCharCode((0x20 | (x & 0x1f)) + 63); x >>= 5; } s += String.fromCharCode(x + 63); };
    for (const [lng, lat] of pts){ const a = Math.round(lat * 1e4), b = Math.round(lng * 1e4); zahl(a - plat); zahl(b - plng); plat = a; plng = b; }
    return s;
  }
  async function vorhanden(saison){
    try { const r = await fetch(DATEN + saison + '.json?t=' + Date.now(), {cache: 'no-store'}); return r.ok ? (await r.json()).strecken || [] : []; }
    catch { return []; }
  }

  try {
    // ---------- Saisons bestimmen (WeGlide-Saison beginnt im Oktober) ----------
    const jahr = new Date().getFullYear();
    const saisons = [], listen = {};
    for (const s of [jahr + 1, jahr, jahr - 1, jahr - 2, jahr - 3, jahr - 4, jahr - 5]){
      if (saisons.length === ANZAHL) break;
      text(`Lese Flugliste der Saison ${s} …`);
      const l = await liste(s);
      if (s > jahr && !l.length) continue;
      saisons.push(s); listen[s] = l;
    }

    // ---------- Neue Flüge laden ----------
    const alt = {};
    for (const s of saisons) (await vorhanden(s)).forEach(f => { alt[f.i] = f; });
    const neuGesamt = saisons.reduce((n, s) => n + listen[s].filter(f => !alt[f.id]?.p).length, 0);
    let geladen = 0;
    const dateien = {};
    for (const s of saisons){
      const strecken = [];
      for (const f of listen[s]){
        const km = Math.round(f.contest?.distance || 0);
        const a = alt[f.id];
        if (a?.p){ strecken.push({...a, d: f.scoring_date, km, fz: f.aircraft?.name || ''}); continue; }
        geladen++;
        text(`Lade neue Flüge: ${geladen} von ${neuGesamt}<br><small style="opacity:.75">Saison ${s} · ${f.scoring_date} · ${km} km</small>`);
        balken(neuGesamt ? geladen / neuGesamt : 1);
        try {
          const d = await api('flightdata/' + f.id);
          const pts = (d.geom?.coordinates || []).filter(c => c[0] || c[1]);
          if (pts.length > 1) strecken.push({i: f.id, d: f.scoring_date, km, fz: f.aircraft?.name || '', p: kodieren(vereinfachen(pts, TOL))});
        } catch (e){ console.warn('Flug übersprungen', f.id, e); }
        await pause(150);
      }
      strecken.sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : a.i - b.i);
      dateien[`daten/strecken/${s}.json`] = JSON.stringify({saison: s, fluege: strecken.length, km: strecken.reduce((x, f) => x + f.km, 0), strecken});
    }
    const heute = new Date().toISOString().slice(0, 10);
    dateien['daten/strecken/index.json'] = JSON.stringify({saisons, stand: heute});
    const paket = {typ: 'lsv-strecken', version: 1, stand: heute, neu: neuGesamt, saisons, dateien};

    // ---------- An die Website übergeben ----------
    const ziel = new URL(SEITE).origin;
    if (window.opener && !window.opener.closed){
      text('Übergebe die Daten an die Website …');
      const antwort = new Promise(res => {
        const h = ev => { if (ev.origin === ziel && ev.data?.typ === 'lsv-strecken-ok'){ removeEventListener('message', h); res(ev.data); } };
        addEventListener('message', h);
        setTimeout(() => res(null), 4000);
      });
      window.opener.postMessage(paket, ziel);
      const ok = await antwort;
      if (ok){
        fertig(`<b>Fertig!</b> ${neuGesamt ? neuGesamt + ' neue Flüge' : 'Keine neuen Flüge'} – die Website speichert jetzt.<br>Du kannst diesen Tab schließen und zur Website zurückkehren.`);
        return;
      }
    }
    // Kein Website-Tab erreichbar: als Datei herunterladen
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(paket)], {type: 'application/json'}));
    a.download = `lsv-strecken-${heute}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    fertig(`<b>Daten geholt</b> (${neuGesamt} neue Flüge).<br>Der Website-Tab war nicht erreichbar, deshalb wurde die Datei <b>${a.download}</b> heruntergeladen. ` +
      'Lade sie auf der Streckenflug-Seite im Bearbeitungsmodus unter „Datei hochladen“ hoch.', '#ffc72c');
  } catch (e){
    fertig('<b>Das hat nicht geklappt.</b><br>' + String(e.message || e).replace(/[<>&]/g, '') + '<br>Bitte später noch einmal versuchen.', '#e8304f');
  }
})();
