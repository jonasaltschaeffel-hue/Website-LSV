// Holt die aktuellen NOTAMs und Lufträume von notaminfo.com und legt sie in daten/notams/ ab.
// Wird von .github/workflows/notams.yml regelmäßig ausgeführt (Node 20, keine Zusatzpakete).
// Deutschland: notams.json / luftraum.json. Nachbarländer: <kürzel>-notams.json / <kürzel>-luftraum.json
// (notaminfo.com hat Karten für Österreich, Schweiz, Frankreich, Benelux und Dänemark –
// nicht für Tschechien, Polen und Luxemburg).
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { parse } from './notams-parser.mjs';

const ZIEL = new URL('../../daten/notams/', import.meta.url);
const LAENDER = [
  { id: 'de', seite: 'germanymap',     name: 'Deutschland', min: 50, pflicht: true },
  { id: 'at', seite: 'austriamap',     name: 'Österreich',  min: 10 },
  { id: 'ch', seite: 'switzerlandmap', name: 'Schweiz',     min: 10 },
  { id: 'fr', seite: 'francemap',      name: 'Frankreich',  min: 50 },
  { id: 'bx', seite: 'belgiummap',     name: 'Benelux',     min: 10 },   // Belgien und Niederlande: dieselbe Karte
  { id: 'dk', seite: 'denmarkmap',     name: 'Dänemark',    min: 10 },
];
// Nachbarländer nur in der Umgebung Deutschlands übernehmen (Frankreich sonst sehr groß)
const RAHMEN = { s: 45.5, n: 58.2, w: 2.0, o: 19.5 };
const drin = (la, lo) => la >= RAHMEN.s && la <= RAHMEN.n && lo >= RAHMEN.w && lo <= RAHMEN.o;
const raumDrin = r => r.kreis ? drin(r.kreis[0], r.kreis[1]) : r.pts.some(([la, lo]) => drin(la, lo));

await mkdir(ZIEL, { recursive: true });
async function schreiben(name, inhalt, vergleich){
  const datei = new URL(name, ZIEL);
  let alt = null;
  try { alt = JSON.parse(await readFile(datei, 'utf8')); } catch {}
  if (alt && JSON.stringify(vergleich(alt)) === JSON.stringify(vergleich(inhalt))) { console.log(name + ': unverändert'); return; }
  await writeFile(datei, JSON.stringify(inhalt));
  console.log(name + ': aktualisiert');
}

let fehlerDE = null;
for (const land of LAENDER){
  const quelle = 'https://notaminfo.com/' + land.seite;
  try {
    const res = await fetch(quelle, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; notam-karte/1.0)' } });
    if (!res.ok) throw new Error(`notaminfo.com antwortet mit ${res.status}`);
    const d = parse(await res.text());
    console.log(`${land.name}: ${d.notams.length} NOTAMs, ${d.raeume.length} Lufträume, ${d.fehler} unlesbare Einträge, Stand ${d.stand}`);
    // Plausibilität: lieber alte Daten behalten als eine kaputte Seite übernehmen
    if (d.notams.length < land.min || d.raeume.length < land.min) throw new Error('Zu wenige Einträge – Seite hat sich vermutlich geändert. Nichts gespeichert.');
    let notams = d.notams, raeume = d.raeume;
    if (land.id !== 'de'){
      notams = notams.filter(n => drin(n.lat, n.lng));
      raeume = raeume.filter(raumDrin);
    }
    const jetzt = new Date().toISOString();
    const vor = land.id === 'de' ? '' : land.id + '-';
    const kopf = { land: land.name, stand: d.stand, abgerufen: jetzt, quelle };
    await schreiben(vor + 'notams.json', { ...kopf, notams }, x => x.notams);
    await schreiben(vor + 'luftraum.json', { ...kopf, raeume }, x => x.raeume);
  } catch (err) {
    console.error(`${land.name}: ${err.message}`);
    if (land.pflicht) fehlerDE = err;           // Nachbarländer dürfen ausfallen, Deutschland nicht
  }
  await new Promise(ok => setTimeout(ok, 1500)); // notaminfo.com nicht mit Abrufen überhäufen
}
if (fehlerDE) throw fehlerDE;
