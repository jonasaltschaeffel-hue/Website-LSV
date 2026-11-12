/* =====================================================================
   Bearbeitungsmodus der Website (nach Anmeldung mit dem eigenen Passwort)
   - Texte direkt anklicken und ändern
   - Formatleiste: Schriftart, Größe, Farbe, fett, kursiv, Ausrichtung
   - Bilder per Klick austauschen (werden automatisch verkleinert)
   - Neue Artikel unter „Aktuelles" anlegen
   Gespeichert wird als Commit im GitHub-Repository; GitHub Pages
   veröffentlicht die Änderung nach etwa einer Minute.
   ===================================================================== */
(() => {
  const sess = LSVGit.session.get();
  if (!sess) return;
  const gh = LSVGit.client(sess.cfg, sess.token);
  const base = new URL('..', document.querySelector('script[src*="editor-loader.js"]').src).href;
  const basePath = new URL(base).pathname;
  let rel = decodeURIComponent(location.pathname).slice(basePath.length);
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';
  const toRoot = rel.includes('/') ? '../' : '';

  document.documentElement.classList.add('lsv-edit');
  const dirty = new Map();          // id -> Element
  const original = new Map();       // id -> {html, style}

  /* ---------------- Werkzeugleiste unten ---------------- */
  const bar = document.createElement('div');
  bar.className = 'lsv-bar';
  bar.innerHTML = `
    <span class="lsv-badge">✎ Bearbeitungsmodus</span>
    <span class="lsv-hint">Text anklicken zum Ändern · Bilder: „Bild ändern“ · Links: Strg + Klick</span>
    <button type="button" class="lsv-save" disabled>Speichern</button>
    ${/^(index\.html|aktuelles\/)/.test(rel) ? '<button type="button" class="lsv-new">+ Neuer Artikel</button>' : ''}
    <button type="button" class="lsv-logout">Abmelden</button>`;
  document.body.appendChild(bar);
  const saveBtn = bar.querySelector('.lsv-save');
  bar.querySelector('.lsv-logout').onclick = () => {
    if (dirty.size && !confirm('Es gibt ungespeicherte Änderungen. Trotzdem abmelden?')) return;
    dirty.clear(); LSVGit.session.clear(); location.reload();
  };

  const toast = (msg, bad = false, ms) => {
    const t = document.createElement('div');
    t.className = 'lsv-toast' + (bad ? ' bad' : '');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), ms || (bad ? 7000 : 3500));
  };
  const updateSave = () => { saveBtn.disabled = dirty.size === 0; saveBtn.textContent = dirty.size ? `Speichern (${dirty.size})` : 'Speichern'; };
  const ONLINE = 'Gespeichert ✓ – in ca. 1 Minute online';

  /* ---------------- Bereinigung (wie früher auf dem Server) ---------------- */
  const STYLE_RULES = {
    'font-family': /^[a-zA-Z0-9 ,"'-]{1,80}$/, 'font-size': /^\d{1,3}(\.\d{1,2})?(px|em|rem|%)$/,
    'color': /^(#[0-9a-fA-F]{3,8}|rgba?\([\d ,.%]+\))$/, 'font-weight': /^(normal|bold|[1-9]00)$/,
    'font-style': /^(normal|italic)$/, 'text-align': /^(left|right|center|justify)$/, 'text-decoration': /^(none|underline)$/
  };
  const cleanStyle = s => (s || '').split(';').map(d => d.split(':')).filter(p => p.length >= 2)
    .map(([k, ...v]) => [k.trim().toLowerCase(), v.join(':').trim()])
    .filter(([k, v]) => STYLE_RULES[k] && STYLE_RULES[k].test(v)).map(([k, v]) => `${k}: ${v}`).join('; ');
  const ALLOWED = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'BR', 'SMALL', 'SPAN', 'A', 'SUP', 'SUB']);
  const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'FORM', 'INPUT', 'TEXTAREA', 'IMG']);
  function sanitize(html){
    const doc = new DOMParser().parseFromString('<div>' + html + '</div>', 'text/html');
    const root = doc.body.firstChild;
    (function walk(n){
      [...n.childNodes].forEach(c => {
        if (c.nodeType === 8){ c.remove(); return; }
        if (c.nodeType !== 1) return;
        walk(c);
        if (DROP.has(c.tagName)){ c.remove(); return; }
        if (!ALLOWED.has(c.tagName)){
          if ((c.tagName === 'DIV' || c.tagName === 'P') && c.previousSibling) c.before(doc.createElement('br'));
          c.replaceWith(...c.childNodes); return;
        }
        [...c.attributes].forEach(a => {
          const nm = a.name.toLowerCase(), v = a.value;
          if (c.tagName === 'A' && nm === 'href' && !/^\s*(javascript|data|vbscript):/i.test(v)) return;
          if (c.tagName === 'A' && nm === 'target' && v === '_blank') return;
          if (nm === 'class' && /^[a-zA-Z0-9 _-]{1,60}$/.test(v)) return;
          if (nm === 'style'){ const st = cleanStyle(v); if (st){ c.setAttribute('style', st); return; } }
          c.removeAttribute(a.name);
        });
      });
    })(root);
    return root.innerHTML.trim();
  }
  const escAttr = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /** Änderung in den Quelltext der Seite übernehmen (Element über data-e finden) */
  function applyChange(src, ch){
    if (!/^[a-z0-9-]{1,60}$/.test(ch.id)) throw new Error('Ungültige Element-ID');
    const re = new RegExp('<([a-zA-Z][a-zA-Z0-9]*)\\b([^>]*\\sdata-e="' + ch.id + '"[^>]*)>([\\s\\S]*?)</\\1>');
    const m = re.exec(src);
    if (!m) throw new Error('Element ' + ch.id + ' wurde in der Datei nicht gefunden.');
    let [whole, tag, attrs, inner] = m;
    if (ch.style !== undefined){
      const st = cleanStyle(ch.style);
      attrs = attrs.replace(/\sstyle="[^"]*"/, '');
      if (st) attrs += ' style="' + escAttr(st) + '"';
    }
    if (ch.html !== undefined) inner = sanitize(ch.html);
    return src.slice(0, m.index) + `<${tag}${attrs}>${inner}</${tag}>` + src.slice(m.index + whole.length);
  }

  /* ---------------- Texte bearbeitbar machen ---------------- */
  const editables = [...document.querySelectorAll('main [data-e]:not(img)')];
  editables.forEach(el => {
    original.set(el.dataset.e, {html: el.innerHTML, style: el.getAttribute('style') || ''});
    el.contentEditable = 'true';
    el.spellcheck = true;
    el.addEventListener('input', () => markDirty(el));
    el.addEventListener('focus', () => showFormat(el));
    el.addEventListener('keydown', ev => {
      if (ev.key === 'Enter'){ ev.preventDefault(); document.execCommand('insertLineBreak'); }
    });
    el.addEventListener('paste', ev => {             // nur reinen Text einfügen
      ev.preventDefault();
      document.execCommand('insertText', false, (ev.clipboardData || window.clipboardData).getData('text/plain'));
    });
  });
  function markDirty(el){
    const o = original.get(el.dataset.e);
    if (el.innerHTML === o.html && (el.getAttribute('style') || '') === o.style) dirty.delete(el.dataset.e);
    else dirty.set(el.dataset.e, el);
    updateSave();
  }

  // Links im Bearbeitungsmodus nicht öffnen (außer mit Strg/Cmd)
  document.addEventListener('click', ev => {
    const a = ev.target.closest('a');
    if (!a || a.closest('.lsv-bar, .lsv-modal, .lsv-format')) return;
    if (ev.ctrlKey || ev.metaKey) return;
    ev.preventDefault();
  }, true);

  /* ---------------- Formatleiste ---------------- */
  const FONTS = [
    ['', 'Standard'], ['Barlow, sans-serif', 'Barlow'], ['"Barlow Condensed", sans-serif', 'Barlow Condensed'],
    ['Arial, Helvetica, sans-serif', 'Arial'], ['Verdana, sans-serif', 'Verdana'], ['Georgia, serif', 'Georgia'],
    ['"Times New Roman", serif', 'Times New Roman'], ['"Courier New", monospace', 'Courier New']
  ];
  const fmt = document.createElement('div');
  fmt.className = 'lsv-format';
  fmt.innerHTML = `
    <select title="Schriftart" aria-label="Schriftart" class="f-font">${FONTS.map(([v, l]) => `<option value='${v}'>${l}</option>`).join('')}</select>
    <input title="Schriftgröße in px" aria-label="Schriftgröße" class="f-size" type="number" min="8" max="160" placeholder="Größe">
    <input title="Schriftfarbe" aria-label="Schriftfarbe" class="f-color" type="color" value="#ffffff">
    <button type="button" class="f-color-reset" title="Farbe zurücksetzen">⟲</button>
    <button type="button" class="f-b" title="Fett (Auswahl)"><b>B</b></button>
    <button type="button" class="f-i" title="Kursiv (Auswahl)"><i>I</i></button>
    <button type="button" class="f-al" title="Links">⯇</button>
    <button type="button" class="f-ac" title="Mittig">≡</button>
    <button type="button" class="f-reset" title="Format zurücksetzen">Standard</button>`;
  document.body.appendChild(fmt);
  let cur = null;
  fmt.addEventListener('mousedown', ev => { if (!ev.target.matches('select, input')) ev.preventDefault(); });
  function showFormat(el){
    cur = el;
    const r = el.getBoundingClientRect();
    fmt.style.display = 'flex';
    const top = r.top + scrollY - fmt.offsetHeight - 8;
    fmt.style.top = Math.max(scrollY + 70, top) + 'px';
    fmt.style.left = Math.max(8, Math.min(r.left + scrollX, scrollX + innerWidth - fmt.offsetWidth - 8)) + 'px';
    fmt.querySelector('.f-font').value = FONTS.some(([v]) => v === el.style.fontFamily) ? el.style.fontFamily : '';
    fmt.querySelector('.f-size').value = parseInt(el.style.fontSize) || '';
  }
  document.addEventListener('focusout', () => setTimeout(() => {
    const a = document.activeElement;
    if (!a || (!a.closest('.lsv-format') && !(a.dataset && a.dataset.e))) fmt.style.display = 'none';
  }, 0));
  const setStyle = (prop, val) => { if (!cur) return; cur.style[prop] = val; markDirty(cur); };
  fmt.querySelector('.f-font').addEventListener('change', e => setStyle('fontFamily', e.target.value));
  fmt.querySelector('.f-size').addEventListener('input', e => setStyle('fontSize', e.target.value ? e.target.value + 'px' : ''));
  fmt.querySelector('.f-color').addEventListener('input', e => setStyle('color', e.target.value));
  fmt.querySelector('.f-color-reset').addEventListener('click', () => setStyle('color', ''));
  fmt.querySelector('.f-b').addEventListener('click', () => { document.execCommand('bold'); cur && markDirty(cur); });
  fmt.querySelector('.f-i').addEventListener('click', () => { document.execCommand('italic'); cur && markDirty(cur); });
  fmt.querySelector('.f-al').addEventListener('click', () => setStyle('textAlign', ''));
  fmt.querySelector('.f-ac').addEventListener('click', () => setStyle('textAlign', 'center'));
  fmt.querySelector('.f-reset').addEventListener('click', () => { if (!cur) return; cur.removeAttribute('style'); markDirty(cur); showFormat(cur); });

  /* ---------------- Speichern ---------------- */
  saveBtn.addEventListener('click', async () => {
    const changes = [...dirty.values()].map(el => {
      const o = original.get(el.dataset.e), c = {id: el.dataset.e};
      if (el.innerHTML !== o.html) c.html = el.innerHTML;
      if ((el.getAttribute('style') || '') !== o.style) c.style = el.getAttribute('style') || '';
      return c;
    });
    saveBtn.disabled = true; saveBtn.textContent = 'Speichere …';
    try {
      let src = await gh.getText(rel);                 // immer die aktuelle Version aus GitHub
      changes.forEach(ch => { src = applyChange(src, ch); });
      await gh.commit([{path: rel, text: src}], `Website bearbeitet: ${rel}`);
      dirty.forEach(el => original.set(el.dataset.e, {html: el.innerHTML, style: el.getAttribute('style') || ''}));
      dirty.clear(); updateSave();
      toast(ONLINE);
    } catch (err){ toast('Nicht gespeichert: ' + err.message, true); updateSave(); }
  });
  addEventListener('beforeunload', ev => { if (dirty.size){ ev.preventDefault(); ev.returnValue = ''; } });
  addEventListener('keydown', ev => { if ((ev.ctrlKey || ev.metaKey) && ev.key === 's'){ ev.preventDefault(); if (dirty.size) saveBtn.click(); } });

  /* ---------------- Bilder: verkleinern & hochladen ---------------- */
  async function prepareImage(file, maxW = 2000){
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Nur JPG-, PNG- oder WebP-Bilder sind erlaubt.');
    if (file.size > 25 * 1024 * 1024) throw new Error('Das Bild ist größer als 25 MB.');
    const bmp = await createImageBitmap(file);
    const s = Math.min(1, maxW / bmp.width);
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const png = file.type === 'image/png';
    const blob = await new Promise(r => c.toBlob(r, png ? 'image/png' : 'image/jpeg', 0.85));
    return {bytes: new Uint8Array(await blob.arrayBuffer()), ext: png ? 'png' : 'jpg', url: URL.createObjectURL(blob)};
  }
  const pickImage = () => new Promise(res => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/jpeg,image/png,image/webp';
    input.onchange = () => res(input.files[0] || null);
    input.click();
  });

  document.querySelectorAll('main img[data-e]').forEach(img => {
    const holder = img.closest('.pic') || img.parentElement;
    holder.classList.add('lsv-img');
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'lsv-img-btn'; btn.textContent = '📷 Bild ändern';
    holder.appendChild(btn);
    btn.addEventListener('click', async ev => {
      ev.preventDefault(); ev.stopPropagation();
      const file = await pickImage();
      if (!file) return;
      btn.textContent = 'Lade hoch …';
      try {
        const im = await prepareImage(file);
        const name = `${rel.replace(/\.html$/, '').replace(/\//g, '-')}-${img.dataset.e}-${Date.now().toString(36)}.${im.ext}`;
        const imgPath = 'img/uploads/' + name;
        let src = await gh.getText(rel);
        const re = new RegExp('<img\\b[^>]*\\sdata-e="' + img.dataset.e + '"[^>]*>');
        const m = re.exec(src);
        if (!m) throw new Error('Bild wurde in der Datei nicht gefunden.');
        const tag = m[0].replace(/\ssrc="[^"]*"/, ' src="' + toRoot + imgPath + '"');
        src = src.slice(0, m.index) + tag + src.slice(m.index + m[0].length);
        await gh.commit([{path: imgPath, bytes: im.bytes}, {path: rel, text: src}], `Bild geändert: ${rel}`);
        img.hidden = false; img.src = im.url;              // sofort anzeigen (online nach ca. 1 Minute)
        holder.classList.remove('placeholder');
        toast('Bild gespeichert ✓ – in ca. 1 Minute online');
      } catch (err){ toast('Bild nicht gespeichert: ' + err.message, true); }
      btn.textContent = '📷 Bild ändern';
    });
  });

  /* ---------------- Neuer Artikel ---------------- */
  const slugify = t => (t.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)) || 'meldung';

  async function createArticle(fd){
    const titel = (fd.get('titel') || '').trim(), datum = fd.get('datum') || '', kurz = (fd.get('kurztext') || '').trim(), text = (fd.get('text') || '').trim();
    if (!titel || !kurz || !/^\d{4}-\d{2}-\d{2}$/.test(datum)) throw new Error('Bitte Titel, Datum und Kurztext ausfüllen.');
    const [y, mo, d] = datum.split('-'); const datumDe = `${d}.${mo}.${y}`;
    const id = 'n' + Math.random().toString(36).slice(2, 8);

    // freien Dateinamen finden (Archiv kennt alle Artikel)
    const archiv = await gh.getText('aktuelles/index.html');
    let slug = slugify(titel), n = 2; const baseSlug = slug;
    while (archiv.includes(`href="${slug}.html"`) || slug === 'index') slug = baseSlug + '-' + n++;

    const files = [];
    let bild = `img/aktuelles/${slug}.jpg`;
    const file = fd.get('bild');
    if (file && file.size){ const im = await prepareImage(file); bild = `img/aktuelles/${slug}.${im.ext}`; files.push({path: bild, bytes: im.bytes}); }

    let body = '', k = 0;
    text.split(/\r?\n\s*\r?\n/).map(p => p.trim()).filter(Boolean).forEach(p => {
      k++;
      body += p.startsWith('## ') ? `    <h2 data-e="${id}-h${k}">${esc(p.slice(3))}</h2>\n` : `    <p data-e="${id}-p${k}">${esc(p).replace(/\r?\n/g, '<br>')}</p>\n`;
    });
    if (!body) body = `    <p data-e="${id}-p1">${esc(kurz)}</p>\n`;
    const pic = prefix => `<div class="pic placeholder"><img data-e="${id}-img" src="${prefix}${bild}" alt="" onerror="this.hidden=true" onload="this.parentElement.classList.remove('placeholder')"></div>`;

    const tpl = await gh.getText('admin/vorlagen/artikel.html');
    const page = tpl.split('{{TITEL_TEXT}}').join(esc(titel)).split('{{TITEL}}').join(esc(titel)).split('{{DATUM}}').join(esc(datumDe))
      .split('{{ID}}').join(id).split('{{BILD}}').join(pic('../')).split('{{TEXT}}').join(body.trimEnd());
    files.push({path: `aktuelles/${slug}.html`, text: page});

    const card = (prefix, href) =>
      `        <a class="news-card" href="${href}">\n          ${pic(prefix)}\n          <div class="body">\n` +
      `            <span class="date" data-e="${id}-cd">${esc(datumDe)}</span>\n            <h3 data-e="${id}-ct">${esc(titel)}</h3>\n` +
      `            <p data-e="${id}-ck">${esc(kurz)}</p>\n            <span class="more">Weiterlesen →</span>\n          </div>\n        </a>\n`;
    const insert = (src, marker, c, keep) => {
      const re = new RegExp('(<!-- ' + marker + ':START -->\\r?\\n?)([\\s\\S]*?)(\\s*<!-- ' + marker + ':END -->)');
      const m = re.exec(src);
      if (!m) throw new Error('Markierung ' + marker + ' fehlt.');
      let inner = c + m[2];
      if (keep) inner = (inner.match(/\s*<a class="news-card"[\s\S]*?<\/a>/g) || []).slice(0, keep).join('').replace(/^\s*/, '        ');
      return src.slice(0, m.index) + m[1] + inner.trimEnd() + m[3] + src.slice(m.index + m[0].length);
    };
    const index = await gh.getText('index.html');
    files.push({path: 'index.html', text: insert(index, 'NEWS', card('', `aktuelles/${slug}.html`), 3)});
    files.push({path: 'aktuelles/index.html', text: insert(archiv, 'ARCHIV', card('../', `${slug}.html`), 0)});
    await gh.commit(files, `Neuer Artikel: ${titel}`);
    return `aktuelles/${slug}.html`;
  }

  const newBtn = bar.querySelector('.lsv-new');
  if (newBtn) newBtn.addEventListener('click', () => {
    const today = new Date().toISOString().slice(0, 10);
    const m = document.createElement('div');
    m.className = 'lsv-modal';
    m.innerHTML = `
      <form class="lsv-dialog">
        <h2>Neuer Artikel unter „Aktuelles“</h2>
        <label>Titel<input name="titel" required maxlength="140"></label>
        <label>Datum<input name="datum" type="date" required value="${today}"></label>
        <label>Kurztext für die Karte (ca. 2 Sätze)<textarea name="kurztext" required maxlength="500" rows="3"></textarea></label>
        <label>Artikeltext<small>Leerzeile = neuer Absatz · Zeile mit „## “ am Anfang = Zwischenüberschrift</small><textarea name="text" rows="9"></textarea></label>
        <label>Bild (optional, Querformat)<input name="bild" type="file" accept="image/jpeg,image/png,image/webp"></label>
        <div class="lsv-dialog-btns">
          <button type="button" class="lsv-cancel">Abbrechen</button>
          <button type="submit" class="lsv-ok">Artikel anlegen</button>
        </div>
      </form>`;
    document.body.appendChild(m);
    m.querySelector('.lsv-cancel').onclick = () => m.remove();
    m.querySelector('form').onsubmit = async ev => {
      ev.preventDefault();
      const ok = m.querySelector('.lsv-ok'); ok.disabled = true; ok.textContent = 'Lege an …';
      try {
        const url = await createArticle(new FormData(ev.target));
        m.remove();
        toast('Artikel angelegt ✓ – in ca. 1 Minute online unter ' + url, false, 9000);
      } catch (err){ toast('Artikel nicht angelegt: ' + err.message, true); ok.disabled = false; ok.textContent = 'Artikel anlegen'; }
    };
  });

  // für Tests
  window.__lsvEditor = {sanitize, applyChange, createArticle};
})();
