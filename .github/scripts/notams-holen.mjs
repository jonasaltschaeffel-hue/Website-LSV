// Holt die aktuellen NOTAMs und Lufträume von notaminfo.com und legt sie in daten/notams/ ab.
// Wird von .github/workflows/notams.yml regelmäßig ausgeführt (Node 20, keine Zusatzpakete).
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { parse } from './notams-parser.mjs';

const QUELLE = 'https://notaminfo.com/germanymap';
const ZIEL = new URL('../../daten/notams/', import.meta.url);

const res = await fetch(QUELLE, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; notam-karte/1.0)' } });
if (!res.ok) throw new Error(`notaminfo.com antwortet mit ${res.status}`);
const html = await res.text();
const d = parse(html);
console.log(`${d.notams.length} NOTAMs, ${d.raeume.length} Lufträume, ${d.fehler} unlesbare Einträge, Stand ${d.stand}`);

// Plausibilität: lieber alte Daten behalten als eine kaputte Seite übernehmen
if (d.notams.length < 50 || d.raeume.length < 50) throw new Error('Zu wenige Einträge – Seite hat sich vermutlich geändert. Nichts gespeichert.');

await mkdir(ZIEL, { recursive: true });
async function schreiben(name, inhalt, vergleich){
  const datei = new URL(name, ZIEL);
  let alt = null;
  try { alt = JSON.parse(await readFile(datei, 'utf8')); } catch {}
  if (alt && JSON.stringify(vergleich(alt)) === JSON.stringify(vergleich(inhalt))) { console.log(name + ': unverändert'); return; }
  await writeFile(datei, JSON.stringify(inhalt));
  console.log(name + ': aktualisiert');
}
const jetzt = new Date().toISOString();
await schreiben('notams.json', { stand: d.stand, abgerufen: jetzt, quelle: QUELLE, notams: d.notams }, x => x.notams);
await schreiben('luftraum.json', { stand: d.stand, abgerufen: jetzt, quelle: QUELLE, raeume: d.raeume }, x => x.raeume);
