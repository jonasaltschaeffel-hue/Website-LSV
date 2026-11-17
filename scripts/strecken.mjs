// Holt die Streckenflüge des LSV Regensburg von WeGlide und speichert sie vereinfacht für die Karte
// auf der Seite „Streckenflug“. Läuft automatisch über GitHub Actions (.github/workflows/strecken.yml).
//
// - Saisons: die letzten fünf, die neue Saison kommt automatisch dazu, sobald es sie gibt.
// - Neue Flüge werden ergänzt, gelöschte fallen weg. Schon geladene Flugwege werden nicht erneut geholt.
// - Ergebnis: daten/strecken/<saison>.json und daten/strecken/index.json
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const ZIEL = 'daten/strecken';
const VEREIN = 145;          // LSV Regensburg bei WeGlide
const LAND = 'DE';           // wie die WeGlide-Übersicht: Starts in Deutschland
const ANZAHL = 5;            // so viele Saisons zeigt die Karte
const TOL = 0.002;           // Vereinfachung der Flugwege in Grad (etwa 150–200 m)

const pause = ms => new Promise(r => setTimeout(r, ms));
async function api(pfad){
  for (let versuch = 1; ; versuch++){
    const r = await fetch('https://api.weglide.org/v1/' + pfad, {headers: {'User-Agent': 'LSV-Regensburg-Website (GitHub Actions)'}});
    if (r.ok) return r.json();
    if (r.status === 403){
      // WeGlide lässt automatische Abrufe (noch) nicht zu: bestehende Daten bleiben unverändert, kein Fehler-Mail.
      console.log('::warning::WeGlide hat den Zugriff abgelehnt (403). Die vorhandenen Streckendaten bleiben unverändert.');
      process.exit(0);
    }
    if (versuch >= 3 || r.status === 404) throw new Error(r.status + ' ' + pfad);
    await pause(3000 * versuch);
  }
}

async function fluege(saison){
  let alle = [], skip = 0, seite;
  do {
    seite = await api(`flight?club_id_in=${VEREIN}&country_id_in=${LAND}&season_in=${saison}&skip=${skip}&limit=100&include_story=false&include_stats=false`);
    alle = alle.concat(seite); skip += 100;
  } while (seite.length === 100);
  return alle;
}

// Douglas-Peucker
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
      let t = len ? ((px - ax) * dx + (py - ay) * dy) / len : 0;
      t = Math.max(0, Math.min(1, t));
      const qx = ax + t * dx - px, qy = ay + t * dy - py, d = qx * qx + qy * qy;
      if (d > max){ max = d; idx = i; }
    }
    if (max > t2){ keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return p.filter((_, i) => keep[i]);
}

// Google-Polyline-Kodierung, Genauigkeit 1e4 (ca. 10 m)
function kodieren(pts){
  let s = '', plat = 0, plng = 0;
  const zahl = v => { let x = v < 0 ? ~(v << 1) : v << 1; while (x >= 0x20){ s += String.fromCharCode((0x20 | (x & 0x1f)) + 63); x >>= 5; } s += String.fromCharCode(x + 63); };
  for (const [lng, lat] of pts){
    const a = Math.round(lat * 1e4), b = Math.round(lng * 1e4);
    zahl(a - plat); zahl(b - plng); plat = a; plng = b;
  }
  return s;
}

async function lesen(datei){ try { return JSON.parse(await readFile(datei, 'utf8')); } catch { return null; } }
async function schreiben(datei, obj){
  const neu = JSON.stringify(obj);
  let alt = null; try { alt = await readFile(datei, 'utf8'); } catch {}
  if (alt === neu) return false;
  await writeFile(datei, neu); return true;
}

await mkdir(ZIEL, {recursive: true});
const jahr = new Date().getUTCFullYear();
const saisons = [];
let geaendert = false;

for (const saison of [jahr + 1, jahr, jahr - 1, jahr - 2, jahr - 3, jahr - 4, jahr - 5]){
  if (saisons.length === ANZAHL) break;
  const liste = await fluege(saison);
  if (saison > jahr && !liste.length) continue;          // nächste Saison gibt es noch nicht
  saisons.push(saison);

  const vorher = new Map(((await lesen(`${ZIEL}/${saison}.json`))?.strecken || []).map(f => [f.i, f]));
  const strecken = [];
  for (const f of liste){
    const km = Math.round(f.contest?.distance || 0);
    const alt = vorher.get(f.id);
    if (alt?.p){ strecken.push({...alt, d: f.scoring_date, km, fz: f.aircraft?.name || ''}); continue; }
    try {
      const d = await api('flightdata/' + f.id);
      const pts = (d.geom?.coordinates || []).filter(c => c[0] || c[1]);
      if (pts.length > 1) strecken.push({i: f.id, d: f.scoring_date, km, fz: f.aircraft?.name || '', p: kodieren(vereinfachen(pts, TOL))});
      console.log(`${saison}: neuer Flug ${f.id} (${f.scoring_date}, ${km} km)`);
    } catch (e){ console.warn(`${saison}: Flug ${f.id} übersprungen – ${e.message}`); }
    await pause(250);
  }
  strecken.sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : a.i - b.i);
  const summe = strecken.reduce((s, f) => s + f.km, 0);
  if (await schreiben(`${ZIEL}/${saison}.json`, {saison, fluege: strecken.length, km: summe, strecken})) geaendert = true;
  console.log(`${saison}: ${strecken.length} Flüge, ${summe} km`);
}

// index.json: Liste der Saisons. Das Datum wird nur bei Änderungen erneuert – und spätestens nach
// 30 Tagen, damit GitHub die geplante Aufgabe im Winter nicht wegen Inaktivität abschaltet.
const index = await lesen(`${ZIEL}/index.json`);
const heute = new Date().toISOString().slice(0, 10);
const alt = index?.stand ? (Date.now() - Date.parse(index.stand)) / 864e5 : 999;
const gleich = JSON.stringify(index?.saisons) === JSON.stringify(saisons);
if (geaendert || !gleich || alt > 30) await schreiben(`${ZIEL}/index.json`, {saisons, stand: heute});
