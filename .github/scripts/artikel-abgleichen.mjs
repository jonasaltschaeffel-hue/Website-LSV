// Gleicht die Artikelkarten (Archiv „Alle Meldungen“ und Startseite) mit den Artikelseiten ab:
// - Datum und Titel kommen immer aus der Artikelseite (aktuelles/<name>.html)
// - Sortierung: neuestes Datum zuerst (TT.MM.JJJJ); gleiches Datum = bisherige Reihenfolge
// - Startseite: die ersten drei Karten aus dem Archiv
// Läuft automatisch, sobald etwas unter aktuelles/ gespeichert wird (.github/workflows/artikel.yml).
import {readFileSync, writeFileSync, existsSync} from 'node:fs';

const ARCH = 'aktuelles/index.html', START = 'index.html';
const lies = p => readFileSync(p, 'utf8');

function bereich(src, marke){
  const re = new RegExp('(<!-- ' + marke + ':START -->)([\\s\\S]*?)(<!-- ' + marke + ':END -->)');
  const m = re.exec(src);
  if (!m) throw new Error('Markierung ' + marke + ' fehlt');
  return {inner: m[2], setzen: html => src.slice(0, m.index) + m[1] + '\n' + html + '        ' + m[3] + src.slice(m.index + m[0].length)};
}
const zeit = d => { const m = /^\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})\s*$/.exec(d || ''); return m ? Date.UTC(+m[3], m[2] - 1, +m[1]) : -1; };
const ohneTags = h => h.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

const archSrc = lies(ARCH);
const arch = bereich(archSrc, 'ARCHIV');
const karten = arch.inner.match(/[ \t]*<a class="news-card"[\s\S]*?<\/a>\n?/g) || [];
let geaendert = false;

const liste = karten.map((k, i) => {
  k = k.replace(/^[ \t]*/, '        ').replace(/\n?$/, '\n');
  const href = (/href="([^"]+)"/.exec(k) || [])[1] || '';
  const seite = 'aktuelles/' + href;
  if (href && existsSync(seite)){
    const s = lies(seite);
    const main = (/<main[\s\S]*<\/main>/.exec(s) || [s])[0];
    const dt = /<(div|span|p)\b[^>]*class="date"[^>]*>([\s\S]*?)<\/\1>/.exec(main);
    const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/.exec(main);
    if (dt){
      const datum = ohneTags(dt[2]);
      const neu = k.replace(/(<span class="date"[^>]*>)[\s\S]*?(<\/span>)/, (_, a, b) => a + datum + b);
      if (neu !== k){ console.log(`${href}: Datum → ${datum}`); k = neu; }
    }
    if (h1){
      const titel = ohneTags(h1[1]);
      const neu = k.replace(/(<h3\b[^>]*>)[\s\S]*?(<\/h3>)/, (_, a, b) => a + titel + b);
      if (neu !== k){ console.log(`${href}: Titel → ${titel}`); k = neu; }
    }
  } else console.log(`${href}: Artikelseite fehlt – Karte bleibt unverändert`);
  const datum = ((/<span class="date"[^>]*>([\s\S]*?)<\/span>/.exec(k) || [])[1] || '').trim();
  return {k, i, z: zeit(datum)};
});

const sortiert = liste.slice().sort((a, b) => (b.z - a.z) || (a.i - b.i)).map(x => x.k);
const archNeu = arch.setzen(sortiert.join(''));
if (archNeu !== archSrc){ writeFileSync(ARCH, archNeu); geaendert = true; console.log('Archiv aktualisiert'); }

const startSrc = lies(START);
const news = bereich(startSrc, 'NEWS');
const oben = sortiert.slice(0, 3).map(k => k.replace(/href="([^"/]+\.html)"/, 'href="aktuelles/$1"').replace(/src="\.\.\//g, 'src="')).join('');
const startNeu = news.setzen(oben);
if (startNeu !== startSrc){ writeFileSync(START, startNeu); geaendert = true; console.log('Startseite aktualisiert'); }

if (!geaendert) console.log('Alles schon aktuell');
