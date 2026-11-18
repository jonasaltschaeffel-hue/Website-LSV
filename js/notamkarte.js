/* NOTAM-Karte (Seite „Flugvorbereitung“): eigene Leaflet-Karte mit Lufträumen und NOTAMs.
   Daten: daten/notams/notams.json und luftraum.json – werden per GitHub Actions stündlich von notaminfo.com geholt
   (.github/workflows/notams.yml). Grundkarte: CARTO Voyager (OpenStreetMap). */
(() => {
  const box = document.getElementById('nk-box');
  if (!box || !window.L) return;
  const DATEN = new URL('../daten/notams/', document.currentScript.src).href;

  const GRUPPEN = {
    gebiet:    {name: 'Gebiete & Warnungen', farbe: '#e8590c', an: true},
    flugplatz: {name: 'Flugplätze',          farbe: '#7048e8', an: false},
    hindernis: {name: 'Hindernisse',         farbe: '#5c636a', an: false},
    sonstiges: {name: 'Navigation & Sonstiges', farbe: '#1c7ed6', an: false},
  };
  const RAUM = {
    Z: {name: 'Kontrollzone / CTR',          farbe: '#d6336c', strich: null,  fuell: .07},
    I: {name: 'Luftraum C / D',              farbe: '#1971c2', strich: null,  fuell: .035},
    R: {name: 'Flugbeschränkungsgebiet ED-R', farbe: '#e03131', strich: null, fuell: .13},
    X: {name: 'ED-R per NOTAM',              farbe: '#e03131', strich: '6 4', fuell: .13},
    C: {name: 'Gefahrengebiet ED-D',         farbe: '#f08c00', strich: null,  fuell: .1},
    Q: {name: 'Gefahrengebiet ED-D',         farbe: '#f08c00', strich: null,  fuell: .1},
    S: {name: 'TMZ',                         farbe: '#343a40', strich: '7 5', fuell: .03},
    W: {name: 'Segelfluggebiet / Wellenfenster', farbe: '#2f9e44', strich: '7 5', fuell: .06},
    O: {name: 'Sonstiger Luftraum',          farbe: '#868e96', strich: '3 4', fuell: .02},
  };
  const HOME = [48.95, 12.08];   // Raum Oberhinkofen / Regensburg

  const $ = s => box.querySelector(s);
  const kartenEl = $('.nk-karte'), leerEl = $('.nk-leer'), standEl = $('.nk-stand');
  const zeitEl = $('.nk-zeit'), hoeheEl = $('.nk-hoehe'), ebenenEl = $('.nk-ebenen'), legendeEl = $('.nk-legende');

  const karte = L.map(kartenEl.querySelector('.nk-map'), {preferCanvas: true, zoomSnap: .5, minZoom: 5, maxZoom: 13, attributionControl: true, scrollWheelZoom: false});
  karte.attributionControl.setPrefix('');
  // Topografische Grundkarte, per CSS hell und blass gestellt (siehe .nk-map .leaflet-tile-pane)
  L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    subdomains: 'abc', maxZoom: 17,
    attribution: 'Karte: © <a href="https://opentopomap.org" target="_blank" rel="noopener">OpenTopoMap</a> (CC-BY-SA) · Daten: © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>, SRTM',
  }).addTo(karte);
  karte.fitBounds([[47.2, 5.8], [55.1, 15.1]]);
  // Mausrad erst nach Klick in die Karte (sonst bleibt man beim Scrollen der Seite hängen)
  karte.on('click', () => karte.scrollWheelZoom.enable());
  karte.on('mouseout', () => karte.scrollWheelZoom.disable());

  const renderer = L.canvas({padding: .4});
  const raumLayer = L.layerGroup().addTo(karte);
  const notamLayer = L.layerGroup().addTo(karte);

  const st = {zeit: 'heute', fl: 100, raum: true, gruppen: Object.fromEntries(Object.entries(GRUPPEN).map(([k, g]) => [k, g.an]))};
  let notams = [], raeume = [];

  // ---------- Hilfen ----------
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const fmt = new Intl.DateTimeFormat('de-DE', {weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin'});
  const zeit = iso => iso ? fmt.format(new Date(iso)) + ' Uhr' : '–';
  const fl = n => n <= 0 ? 'GND' : n >= 999 ? 'unbegrenzt' : 'FL ' + String(n).padStart(3, '0');
  function fenster(){
    const a = new Date(); a.setHours(0, 0, 0, 0);
    const tage = st.zeit === 'woche' ? 7 : 1;
    if (st.zeit === 'morgen') a.setDate(a.getDate() + 1);
    const b = new Date(a); b.setDate(b.getDate() + tage);
    return [a.getTime(), b.getTime()];
  }
  // Linien über halb Deutschland (z. B. FIR-Grenzen) nicht zeichnen, nur den Punkt
  const klein = pts => { const la = pts.map(p => p[0]), lo = pts.map(p => p[1]); return Math.max(...la) - Math.min(...la) < 1.5 && Math.max(...lo) - Math.min(...lo) < 2.2; };
  const aktiv = (n, [a, b]) => (!n.von || Date.parse(n.von) < b) && (n.dauerhaft || !n.bis || Date.parse(n.bis) > a);

  function popupNotam(n){
    const g = GRUPPEN[n.gruppe] || GRUPPEN.sonstiges;
    const d = el('div', 'nk-pop');
    d.append(el('b', null, n.titel || 'NOTAM'));
    d.append(el('div', 'nk-pop-meta', `${n.ref} · ${g.name}`));
    const gilt = n.dauerhaft ? `ab ${zeit(n.von)}, dauerhaft` : `${zeit(n.von)} bis ${zeit(n.bis)}${n.geschaetzt ? ' (voraussichtlich)' : ''}`;
    d.append(el('div', 'nk-pop-zeile', 'Gültig: ' + gilt));
    if (n.zeitplan) d.append(el('div', 'nk-pop-zeile', 'Zeiten: ' + n.zeitplan));
    d.append(el('div', 'nk-pop-zeile', `Höhe: ${fl(n.unten)} bis ${fl(n.oben)}${n.r ? ` · Radius ${n.r} NM` : ''}`));
    d.append(el('div', 'nk-pop-text', n.text));
    return d;
  }
  function popupRaum(r){
    const d = el('div', 'nk-pop');
    d.append(el('b', null, r.name));
    d.append(el('div', 'nk-pop-meta', r.typ));
    d.append(el('div', 'nk-pop-zeile', `Höhe: ${r.unten} bis ${r.oben}`));
    return d;
  }

  // ---------- Zeichnen ----------
  function zeichnen(){
    raumLayer.clearLayers(); notamLayer.clearLayers();
    if (st.raum) for (const r of raeume){
      if (r.fl > st.fl) continue;
      const s = RAUM[r.k] || RAUM.O;
      const opt = {renderer, color: s.farbe, weight: 1.6, opacity: .85, dashArray: s.strich, fillColor: s.farbe, fillOpacity: s.fuell};
      const form = r.kreis ? L.circle([r.kreis[0], r.kreis[1]], {...opt, radius: r.kreis[2] * 1852}) : L.polygon(r.pts, opt);
      form.bindPopup(() => popupRaum(r), {maxWidth: 320});
      raumLayer.addLayer(form);
    }
    const f = fenster(), zahl = {};
    for (const n of notams){
      if (!st.gruppen[n.gruppe] || n.unten > st.fl || !aktiv(n, f)) continue;
      zahl[n.gruppe] = (zahl[n.gruppe] || 0) + 1;
      const g = GRUPPEN[n.gruppe] || GRUPPEN.sonstiges;
      const pop = () => popupNotam(n);
      if (n.r && n.r <= 40 && n.r >= .3){
        L.circle([n.lat, n.lng], {renderer, radius: n.r * 1852, color: g.farbe, weight: 1.4, opacity: .8, fillColor: g.farbe, fillOpacity: .12, interactive: true})
          .bindPopup(pop, {maxWidth: 380}).addTo(notamLayer);
      } else if (n.linie && klein(n.linie)){
        L.polyline(n.linie, {renderer, color: g.farbe, weight: 2.5, opacity: .9}).bindPopup(pop, {maxWidth: 380}).addTo(notamLayer);
      }
      L.circleMarker([n.lat, n.lng], {renderer, radius: n.gruppe === 'hindernis' ? 3.5 : 5, color: '#fff', weight: 1.5, fillColor: g.farbe, fillOpacity: 1})
        .bindPopup(pop, {maxWidth: 380}).bindTooltip(n.titel || n.ref, {direction: 'top', offset: [0, -4]}).addTo(notamLayer);
    }
    ebenenEl.querySelectorAll('[data-g]').forEach(b => { const c = b.querySelector('small'); if (c) c.textContent = zahl[b.dataset.g] || 0; });
  }

  // ---------- Bedienung ----------
  function knopfReihe(ziel, eintraege, aktuell, wahl){
    ziel.innerHTML = '';
    for (const [wert, text] of eintraege){
      const b = el('button', null, text); b.type = 'button';
      b.setAttribute('aria-pressed', String(wert === aktuell()));
      b.onclick = () => { wahl(wert); knopfReihe(ziel, eintraege, aktuell, wahl); zeichnen(); };
      ziel.append(b);
    }
  }
  knopfReihe(zeitEl, [['heute', 'Heute'], ['morgen', 'Morgen'], ['woche', '7 Tage']], () => st.zeit, v => st.zeit = v);
  hoeheEl.value = String(st.fl);
  hoeheEl.onchange = () => { st.fl = +hoeheEl.value; zeichnen(); };

  function ebenen(){
    ebenenEl.innerHTML = '';
    const chip = (text, farbe, an, klick, g) => {
      const b = el('button', 'nk-chip'); b.type = 'button'; b.setAttribute('aria-pressed', String(an));
      if (g) b.dataset.g = g;
      const punkt = el('i'); punkt.style.background = farbe; b.append(punkt, text);
      if (g) b.append(el('small', null, '0'));
      b.onclick = () => { klick(); ebenen(); zeichnen(); };
      ebenenEl.append(b);
    };
    chip('Lufträume', '#1971c2', st.raum, () => st.raum = !st.raum);
    for (const [k, g] of Object.entries(GRUPPEN)) chip(g.name, g.farbe, st.gruppen[k], () => st.gruppen[k] = !st.gruppen[k], k);
  }
  ebenen();
  $('.nk-home').onclick = () => karte.setView(HOME, 9);
  $('.nk-de').onclick = () => karte.fitBounds([[47.2, 5.8], [55.1, 15.1]]);

  // Legende
  const gesehen = new Set();
  for (const s of Object.values(RAUM)){
    if (gesehen.has(s.name)) continue; gesehen.add(s.name);
    const z = el('span'); const m = el('i', 'raum'); m.style.borderColor = s.farbe; m.style.background = s.farbe + '22'; if (s.strich) m.style.borderStyle = 'dashed';
    z.append(m, s.name); legendeEl.append(z);
  }
  for (const g of Object.values(GRUPPEN)){ const z = el('span'); const m = el('i'); m.style.background = g.farbe; z.append(m, 'NOTAM: ' + g.name); legendeEl.append(z); }

  // ---------- Laden ----------
  (async () => {
    try {
      const [n, r] = await Promise.all(['notams.json', 'luftraum.json'].map(f => fetch(DATEN + f, {cache: 'no-cache'}).then(x => { if (!x.ok) throw new Error(x.status); return x.json(); })));
      notams = n.notams || []; raeume = r.raeume || [];
      const s = n.stand || n.abgerufen;
      standEl.textContent = s ? 'Stand: ' + zeit(s) : '';
      const alt = s && Date.now() - Date.parse(s) > 6 * 3600e3;
      if (alt) { standEl.textContent += ' – älter als 6 Stunden'; standEl.classList.add('alt'); }
      leerEl.hidden = true;
      zeichnen();
    } catch {
      leerEl.textContent = 'Die NOTAM-Daten konnten gerade nicht geladen werden. Bitte das offizielle DFS-Briefing nutzen.';
    }
  })();
})();
