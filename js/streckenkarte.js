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
  const datum = d => d ? d.split('-').reverse().join('.') : '';
  const zahl = n => n.toLocaleString('de-DE');

  // Projektion: Breitengrad-korrigiert, auf die Flüge der Saison eingepasst
  function ansicht(W, H){
    let x0 = HEIM.lng, x1 = HEIM.lng, y0 = HEIM.lat, y1 = HEIM.lat;
    flugListe.forEach(f => f.pts.forEach(([x, y]) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }));
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
    let km = 100, len = km100;
    if (len > W * .3){ km = 50; len /= 2; } else if (len < 40){ km = 200; len *= 2; }
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
      if (p < 1) anim = requestAnimationFrame(schritt);
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

  (async () => {
    try {
      const idx = await (await fetch(DATEN + 'index.json', {cache: 'no-cache'})).json();
      const liste = [...idx.saisons].sort((a, b) => b - a);
      jahre.innerHTML = liste.map(j => `<button type="button" role="tab" data-jahr="${j}">${j}</button>`).join('');
      jahre.querySelectorAll('button').forEach(b => b.addEventListener('click', () => saison(+b.dataset.jahr)));
      if (idx.stand) standEl.textContent = 'Stand: ' + datum(idx.stand);
      saison(liste[0]);
    } catch {
      leer.textContent = 'Die Strecken werden gerade vorbereitet und erscheinen in Kürze.';
    }
  })();
})();
