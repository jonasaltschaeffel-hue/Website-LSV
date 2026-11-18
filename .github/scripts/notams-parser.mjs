// Liest die Deutschland-Karte von notaminfo.com (HTML) und macht daraus zwei kleine Datensätze:
// NOTAMs und Lufträume. Läuft in Node (GitHub Actions) und zum Testen auch im Browser.
// Es wird kein fremder Code ausgeführt: die Werte stehen als JSON-Literale in den Aufrufen notam(...) / airspace(...).

const MONATE = {Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11};

function entities(s){
  return s.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, '&');
}
// HTML-Schnipsel → reiner Text (Zeilenumbrüche bleiben erhalten)
function text(s){
  return entities(String(s || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, ''))
    .split('\n').map(z => z.replace(/[ \t]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
// "28 Sep 2026 10:50" (GMT) → ISO-Zeit
function gmt(s){
  const m = /(\d{1,2}) (\w{3}) (\d{4}) (\d{2}):(\d{2})/.exec(s || '');
  if (!m || !(m[2] in MONATE)) return null;
  return new Date(Date.UTC(+m[3], MONATE[m[2]], +m[1], +m[4], +m[5])).toISOString();
}
// Gültigkeit aus dem Zusatztext lesen
function zeiten(suffix){
  const s = text(suffix);
  const von = /FROM:\s*([^G]*?)\s*GMT/.exec(s);
  const bis = /TO:\s*([^G]*?)\s*GMT/.exec(s);
  const plan = /SCHEDULE:\s*(.+)/.exec(s);
  return {
    von: von ? gmt(von[1]) : null,
    bis: bis ? gmt(bis[1]) : null,
    dauerhaft: /TO:\s*Perm/i.test(s),
    geschaetzt: /\bEST\b/.test(s),
    zeitplan: plan ? plan[1].trim() : '',
  };
}
const r4 = x => Math.round(x * 1e4) / 1e4;
const punkte = pts => Array.isArray(pts) ? pts.filter(p => Array.isArray(p) && p.length >= 2).map(([a, b]) => [r4(+a), r4(+b)]) : [];

// Gruppe für die Karte aus Q-Code und Geltungsbereich
function gruppe(qcode, basis){
  const q = (String(qcode).split('/')[1] || '').toUpperCase();   // z. B. QRDCA
  const sub = q.slice(1, 2);
  if (sub === 'O') return 'hindernis';
  if (sub === 'R' || sub === 'W' || sub === 'A') return 'gebiet';
  if (/ae/.test(basis) && !/en|nw/.test(basis)) return 'flugplatz';
  return 'sonstiges';
}

// "NOTAMs extracted at 18 Nov 2026 06:05 CET" → ISO
function stand(html){
  const m = /NOTAMs\s+extracted\s+at\s+(\d{1,2})\s+(\w{3})\s+(\d{4})\s+(\d{2}):(\d{2})\s+(CET|CEST|GMT|UTC)/.exec(html);
  if (!m || !(m[2] in MONATE)) return null;
  const off = m[6] === 'CEST' ? 2 : m[6] === 'CET' ? 1 : 0;
  return new Date(Date.UTC(+m[3], MONATE[m[2]], +m[1], +m[4] - off, +m[5])).toISOString();
}

export function parse(html){
  const notams = [], raeume = [];
  let fehler = 0;
  for (const m of html.matchAll(/^\s*(notam|airspace)\((.*)\);\s*$/gm)){
    let a;
    try { a = JSON.parse('[' + m[2] + ']'); } catch { fehler++; continue; }
    if (m[1] === 'notam'){
      // id, lat, lng, basetype, type, reference, meaning, qcode, text, suffix, fl, tops, letter, schedule, hasPoly, points, …
      const [, lat, lng, basis, , ref, titel, q, txt, suffix, unten, oben, , , form, pts] = a;
      if (!isFinite(lat) || !isFinite(lng)) { fehler++; continue; }
      const n = {
        ref: String(ref), titel: text(titel), q: String(q), text: text(txt),
        gruppe: gruppe(q, String(basis)), unten: +unten || 0, oben: +oben || 0,
        lat: r4(+lat), lng: r4(+lng), ...zeiten(suffix),
      };
      if (form === 2 && +pts > 0) n.r = Math.round(+pts * 100) / 100;          // Kreis, Radius in NM
      else if (form === 1) { const p = punkte(pts); if (p.length > 1) n.linie = p; }
      notams.push(n);
    } else {
      // airClass, flightLevel, points, weight, stroke, strokeOp, fill, fillOp, name, type, lower, upper, zIndex, radius, lat, lng
      const [k, fl, pts, , , , , , name, typ, lower, upper, , rad, clat, clng] = a;
      if (k === 'F') continue;                                                  // FIR-Grenzen weglassen
      const r = {k: String(k), name: text(name), typ: text(typ), unten: text(lower), oben: text(upper), fl: +fl || 0};
      if (+rad > 0) r.kreis = [r4(+clat), r4(+clng), Math.round(+rad * 100) / 100];
      else { r.pts = punkte(pts); if (r.pts.length < 3) continue; }
      raeume.push(r);
    }
  }
  // gleiche NOTAMs (mehrere Einträge pro Referenz) nur einmal behalten
  const gesehen = new Set();
  const einmal = notams.filter(n => { const key = n.ref + '|' + n.lat + '|' + n.lng; if (gesehen.has(key)) return false; gesehen.add(key); return true; });
  return {stand: stand(html), notams: einmal, raeume, fehler};
}
