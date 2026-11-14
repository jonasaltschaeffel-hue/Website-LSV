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
    <button type="button" class="lsv-undo" title="Rückgängig (Strg+Z)" disabled>↶</button>
    <button type="button" class="lsv-redo" title="Wiederholen (Strg+Y)" disabled>↷</button>
    <button type="button" class="lsv-save" disabled>Speichern</button>
    ${/^(index\.html|aktuelles\/)/.test(rel) ? '<button type="button" class="lsv-new">+ Neuer Artikel</button>' : ''}
    <a class="lsv-admin" href="${base}admin/verwaltung.html">⚙ Verwaltung</a>
    <button type="button" class="lsv-logout">Abmelden</button>`;
  document.body.appendChild(bar);
  const saveBtn = bar.querySelector('.lsv-save');
  bar.querySelector('.lsv-logout').onclick = () => {
    if (unsaved() && !confirm('Es gibt ungespeicherte Änderungen. Trotzdem abmelden?')) return;
    dirty.clear(); ops.length = 0; LSVGit.session.clear(); location.reload();
  };

  /* ---------------- Rückgängig / Wiederholen ---------------- */
  const undoStack = [], redoStack = [];
  const undoBtn = bar.querySelector('.lsv-undo'), redoBtn = bar.querySelector('.lsv-redo');
  const updateHist = () => { undoBtn.disabled = !undoStack.length; redoBtn.disabled = !redoStack.length; };
  function pushHist(entry){ undoStack.push(entry); redoStack.length = 0; updateHist(); }
  function undo(){ const e = undoStack.pop(); if (!e) return; e.undo(); redoStack.push(e); updateHist(); }
  function redo(){ const e = redoStack.pop(); if (!e) return; e.redo(); undoStack.push(e); updateHist(); }
  undoBtn.onclick = undo; redoBtn.onclick = redo;
  addEventListener('keydown', ev => {
    if (!(ev.ctrlKey || ev.metaKey)) return;
    if (document.activeElement && document.activeElement.isContentEditable) return;   // im Text: Rückgängig des Browsers
    if (ev.key === 'z' && !ev.shiftKey){ ev.preventDefault(); undo(); }
    if (ev.key === 'y' || (ev.key === 'z' && ev.shiftKey)){ ev.preventDefault(); redo(); }
  });

  const toast = (msg, bad = false, ms) => {
    const t = document.createElement('div');
    t.className = 'lsv-toast' + (bad ? ' bad' : '');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), ms || (bad ? 7000 : 3500));
  };
  const ops = [];                  // Formänderungen (einfügen, verschieben, entfernen, Linie an/aus)
  const pendingImgs = [];          // neue Bilder, die beim Speichern mit hochgeladen werden
  const updateSave = () => {
    const n = dirty.size + ops.length;
    saveBtn.disabled = n === 0; saveBtn.textContent = n ? `Speichern (${n})` : 'Speichern';
  };
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
    if (ch.href !== undefined){
      if (/^\s*(javascript|data|vbscript):/i.test(ch.href)) throw new Error('Ungültiges Linkziel');
      attrs = attrs.replace(/\shref="[^"]*"/, '') + ' href="' + escAttr(ch.href.trim()) + '"';
    }
    if (ch.html !== undefined) inner = sanitize(ch.html);
    return src.slice(0, m.index) + `<${tag}${attrs}>${inner}</${tag}>` + src.slice(m.index + whole.length);
  }

  /* ---------------- Texte bearbeitbar machen ---------------- */
  // Artikelkarten (Startseite & Archiv) werden in der Verwaltung gepflegt – sonst liefen Startseite und Archiv auseinander
  const isArticleCard = el => !!el.closest('.news') && !el.closest('#fleet');
  const editables = [...document.querySelectorAll('main [data-e]:not(img)')].filter(el => !isArticleCard(el));
  document.querySelectorAll('main .news:not(#fleet) a.news-card').forEach(a => a.title = 'Artikelkarten bearbeitest du unter ⚙ Verwaltung → Artikel');
  const snap = el => ({html: el.innerHTML, style: el.getAttribute('style') || '', href: el.getAttribute('href')});
  function restore(el, s){
    el.innerHTML = s.html;
    if (s.style) el.setAttribute('style', s.style); else el.removeAttribute('style');
    if (s.href !== null && s.href !== undefined) el.setAttribute('href', s.href);
    markDirty(el);
  }
  editables.forEach(setupEditable);
  function setupEditable(el){
    original.set(el.dataset.e, snap(el));
    el.contentEditable = 'true';
    el.spellcheck = true;
    el.addEventListener('input', () => markDirty(el));
    el.addEventListener('focus', () => { showFormat(el); el._before = snap(el); });
    // Textänderung als ein Schritt im Verlauf (beim Verlassen des Feldes)
    el.addEventListener('blur', () => {
      const b = el._before, a = snap(el);
      if (b && (b.html !== a.html || b.style !== a.style || b.href !== a.href)) pushHist({undo: () => restore(el, b), redo: () => restore(el, a)});
      el._before = null;
    });
    el.addEventListener('keydown', ev => {
      if (ev.key === 'Enter'){ ev.preventDefault(); document.execCommand('insertLineBreak'); }
    });
    el.addEventListener('paste', ev => {             // nur reinen Text einfügen
      ev.preventDefault();
      document.execCommand('insertText', false, (ev.clipboardData || window.clipboardData).getData('text/plain'));
    });
  }
  function markDirty(el){
    const o = original.get(el.dataset.e);
    if (el.innerHTML === o.html && (el.getAttribute('style') || '') === o.style && el.getAttribute('href') === o.href) dirty.delete(el.dataset.e);
    else dirty.set(el.dataset.e, el);
    updateSave();
  }

  // Links: Navigation (Reiter, Timeline, Zurück, „Weiterlesen“ …) funktioniert normal.
  // Nur ein Klick auf einen bearbeitbaren Text innerhalb eines Links öffnet nicht die Seite,
  // sondern setzt den Cursor zum Bearbeiten. Zum Öffnen solcher Links gibt es den Knopf „Öffnen ↗“.
  document.addEventListener('click', ev => {
    const a = ev.target.closest('a');
    if (!a || a.closest('.lsv-bar, .lsv-modal, .lsv-format')) return;
    if (ev.ctrlKey || ev.metaKey) return;
    if (ev.target.closest('[contenteditable="true"]')) ev.preventDefault();
  }, true);

  // „Öffnen ↗“-Knopf für Links, deren Text bearbeitbar ist (Karten, Buttons)
  document.querySelectorAll('main a[href]').forEach(a => {
    const editable = a.matches('[data-e]') || a.querySelector('[data-e]:not(img)');
    const href = a.getAttribute('href') || '';
    if (!editable || href.startsWith('#') || href.startsWith('mailto:')) return;
    const go = document.createElement('button');
    go.type = 'button'; go.className = 'lsv-go lsv-ui'; go.textContent = 'Öffnen ↗';
    go.title = 'Diese Seite öffnen';
    go.addEventListener('click', ev => { ev.preventDefault(); ev.stopPropagation(); location.href = a.href; });
    if (a.classList.contains('news-card')) { a.style.position = 'relative'; a.appendChild(go); }
    else a.after(go);
  });

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
    <button type="button" class="f-link" title="Link setzen oder ändern">🔗 Link</button>
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

  /* ---------------- Links bearbeiten ---------------- */
  let siteFiles = null;
  async function pageList(){
    if (!siteFiles){ try { siteFiles = (await gh.listFiles()).filter(f => /\.html$/.test(f) && !f.startsWith('admin/')); } catch { siteFiles = []; } }
    return siteFiles;
  }
  const relLink = path => '../'.repeat(rel.split('/').length - 1) + path;     // Pfad von dieser Seite aus
  async function linkDialog(current){
    const files = await pageList();
    return new Promise(resolve => {
      const m = document.createElement('div'); m.className = 'lsv-modal';
      m.innerHTML = `<form class="lsv-dialog lsv-dialog-small"><h2>Link</h2>
        <label>Seite der Website<select name="page"><option value="">– auswählen –</option>${files.map(f => `<option value="${relLink(f)}">${f}</option>`).join('')}</select></label>
        <label>oder Adresse<input name="url" value="${current ? escAttr(current) : ''}" placeholder="https://… oder mailto:…"></label>
        <div class="lsv-dialog-btns">${current !== null ? '<button type="button" class="lsv-cancel" data-rm>Link entfernen</button>' : ''}<button type="button" class="lsv-cancel" data-x>Abbrechen</button><button class="lsv-ok">Übernehmen</button></div></form>`;
      document.body.appendChild(m);
      const f = m.querySelector('form');
      f.page.onchange = () => { if (f.page.value) f.url.value = f.page.value; };
      m.querySelector('[data-x]').onclick = () => { m.remove(); resolve(undefined); };
      const rm = m.querySelector('[data-rm]'); if (rm) rm.onclick = () => { m.remove(); resolve(null); };
      f.onsubmit = ev => { ev.preventDefault(); m.remove(); resolve(f.url.value.trim()); };
    });
  }
  fmt.querySelector('.f-link').addEventListener('click', async () => {
    if (!cur) return;
    const el = cur, before = snap(el);
    if (el.tagName === 'A'){                      // Button/Link selbst: Ziel ändern
      const url = await linkDialog(el.getAttribute('href') || '');
      if (!url) return;
      el.setAttribute('href', url); markDirty(el);
    } else {                                      // markierten Text verlinken
      const sel = getSelection(), range = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
      const inLink = range && (range.startContainer.parentElement || {}).closest && range.startContainer.parentElement.closest('a');
      if (!inLink && (!range || range.collapsed)) return toast('Bitte zuerst den Text markieren, der verlinkt werden soll.', true);
      const url = await linkDialog(inLink ? inLink.getAttribute('href') : null);
      if (url === undefined) return;
      el.focus(); sel.removeAllRanges(); sel.addRange(range);
      if (url === null || url === ''){ if (inLink) inLink.replaceWith(...inLink.childNodes); }
      else if (inLink) inLink.setAttribute('href', url);
      else document.execCommand('createLink', false, url);
      markDirty(el);
    }
    const after = snap(el);
    pushHist({undo: () => restore(el, before), redo: () => restore(el, after)});
  });

  /* ---------------- Speichern ---------------- */
  saveBtn.addEventListener('click', async () => {
    const changes = [...dirty.values()].filter(el => el.isConnected).map(el => {
      const o = original.get(el.dataset.e), c = {id: el.dataset.e};
      if (el.innerHTML !== o.html) c.html = el.innerHTML;
      if ((el.getAttribute('style') || '') !== o.style) c.style = el.getAttribute('style') || '';
      if (el.getAttribute('href') !== o.href && el.hasAttribute('href')) c.href = el.getAttribute('href');
      return c;
    });
    saveBtn.disabled = true; saveBtn.textContent = 'Speichere …';
    try {
      let src = await gh.getText(rel);                 // immer die aktuelle Version aus GitHub
      if (ops.length) src = applyOpsToSource(src);     // Formänderungen zuerst
      changes.forEach(ch => { src = applyChange(src, ch); });
      const files = [...pendingImgs, {path: rel, text: src}];
      await gh.commit(files, `Website bearbeitet: ${rel}`);
      dirty.forEach(el => original.set(el.dataset.e, snap(el)));
      dirty.clear(); ops.length = 0; pendingImgs.length = 0; updateSave();
      undoStack.length = 0; redoStack.length = 0; updateHist();   // nach dem Speichern beginnt der Verlauf neu
      toast(ONLINE);
    } catch (err){ toast('Nicht gespeichert: ' + err.message, true); updateSave(); }
  });
  const unsaved = () => dirty.size + ops.length > 0;
  addEventListener('beforeunload', ev => { if (unsaved()){ ev.preventDefault(); ev.returnValue = ''; } });
  addEventListener('keydown', ev => { if ((ev.ctrlKey || ev.metaKey) && ev.key === 's'){ ev.preventDefault(); if (unsaved()) saveBtn.click(); } });

  /* ---------------- Form bearbeiten: Blöcke einfügen, verschieben, entfernen ---------------- */
  // Bereiche: die Karten der Startseite (section > .card) und der Artikelbereich der Unterseiten
  const containers = [...document.querySelectorAll('main section > .card, main article.article')];
  const kids = el => [...el.children].filter(c => !c.classList.contains('lsv-ui'));
  const containerSel = c => { const s = c.closest('section[id]'); return s ? `section#${s.id} > .card` : 'main article.article'; };
  const nodeAt = (container, path) => path.reduce((n, i) => n && kids(n)[i], container);
  const sib = (el, dir) => { let s = el; do { s = dir < 0 ? s.previousElementSibling : s.nextElementSibling; } while (s && s.classList.contains('lsv-ui')); return s; };
  const nid = () => 'b' + Math.random().toString(36).slice(2, 8);
  // geschützte Bereiche (für neue Artikel, Flotten-Auswahl, Formular, Zurück-Link)
  const isProtected = b => b.matches('.news, .filter, form, a.back') || !!b.querySelector('#fleet, form');

  /** gleiche Operation auf Live-Seite und auf den Quelltext anwenden */
  function applyOp(container, op){
    const t = nodeAt(container, op.path);
    if (!t) throw new Error('Bereich nicht gefunden – bitte Seite neu laden.');
    if (op.type === 'remove') t.remove();
    else if (op.type === 'up'){ const p = sib(t, -1); if (p) p.before(t); }
    else if (op.type === 'down'){ const n = sib(t, 1); if (n) n.after(t); }
    else if (op.type === 'toggle') t.classList.toggle(op.cls);
    else if (op.type === 'insert' || op.type === 'appendRow'){
      const tpl = t.ownerDocument.createElement('template'); tpl.innerHTML = op.html;
      const nodes = [...tpl.content.childNodes];
      if (op.type === 'insert') t.after(...nodes);
      else (t.tBodies && t.tBodies[0] || t).append(...nodes);     // Zeile ans Tabellenende
      return nodes.find(n => n.nodeType === 1);
    }
  }
  function applyOpsToSource(src){
    const doc = new DOMParser().parseFromString(src, 'text/html');
    ops.forEach(op => {
      const c = doc.querySelector(op.sel);
      if (!c) throw new Error('Bereich in der Datei nicht gefunden.');
      applyOp(c, op.sourceOp || op);
    });
    const dt = /^\s*<!doctype[^>]*>/i.exec(src);
    return (dt ? dt[0] : '<!doctype html>') + '\n' + doc.documentElement.outerHTML + '\n';
  }
  function doOp(info, op, liveOp){
    const full = {...op, sel: containerSel(info.container)};
    if (liveOp) full.sourceOp = op;
    const live = liveOp || op;
    const target = nodeAt(info.container, op.path);
    const pos = {parent: target.parentNode, next: target.nextSibling};
    const register = el => { if (el) (el.matches('[data-e]:not(img)') ? [el] : []).concat([...el.querySelectorAll('[data-e]:not(img)')]).forEach(setupEditable); };
    let created = applyOp(info.container, live);
    ops.push(full); updateSave();
    register(created);              // neue Texte sofort bearbeitbar machen
    hideBlockBar();
    pushHist({
      undo(){
        if (op.type === 'toggle') target.classList.toggle(op.cls);
        else if (created) created.remove();
        else pos.parent.insertBefore(target, pos.next);         // entfernen / verschieben rückgängig
        ops.splice(ops.lastIndexOf(full), 1); updateSave();
      },
      redo(){
        created = applyOp(info.container, live); register(created);
        ops.push(full); updateSave();
      }
    });
  }

  function blockInfo(el){
    for (let b = el; b && b !== document.body; b = b.parentElement){
      const p = b.parentElement;
      if (!p || b.classList.contains('lsv-ui')) return null;
      if (containers.includes(p)) return {block: b, container: p, path: [kids(p).indexOf(b)]};
      if (p.classList.contains('grid') && containers.includes(p.parentElement))
        return {block: b, container: p.parentElement, path: [kids(p.parentElement).indexOf(p), kids(p).indexOf(b)], inGrid: true};
      // Tabellenzeilen (z. B. technische Daten): Zeile -> tbody -> Tabelle im Bereich
      if (b.tagName === 'TR' && p.tagName === 'TBODY' && p.parentElement && containers.includes(p.parentElement.parentElement)){
        const table = p.parentElement, c = table.parentElement;
        return {block: b, container: c, path: [kids(c).indexOf(table), kids(table).indexOf(p), kids(p).indexOf(b)], inTable: true};
      }
    }
    return null;
  }

  const bb = document.createElement('div');
  bb.className = 'lsv-blockbar lsv-ui';
  bb.innerHTML = `
    <button type="button" data-a="add" title="Darunter einfügen">＋</button>
    <button type="button" data-a="up" title="Nach oben">↑</button>
    <button type="button" data-a="down" title="Nach unten">↓</button>
    <button type="button" data-a="line" title="Trennlinie an/aus">┄</button>
    <button type="button" data-a="del" title="Entfernen">✕</button>`;
  document.body.appendChild(bb);
  const menu = document.createElement('div');
  menu.className = 'lsv-addmenu lsv-ui';
  document.body.appendChild(menu);
  let cb = null;
  function hideBlockBar(){ bb.style.display = 'none'; menu.style.display = 'none'; if (cb) cb.block.classList.remove('lsv-block-hover'); cb = null; }
  function showBlockBar(info){
    if (cb && cb.block === info.block) return;
    if (cb) cb.block.classList.remove('lsv-block-hover');
    cb = info; menu.style.display = 'none';
    info.block.classList.add('lsv-block-hover');
    const r = info.block.getBoundingClientRect();
    bb.style.display = 'flex';
    bb.style.top = (r.top + scrollY - 34) + 'px';
    bb.style.left = Math.max(8, r.right + scrollX - bb.offsetWidth) + 'px';
    bb.querySelector('[data-a="line"]').style.display = info.block.matches('.tile, table') ? '' : 'none';
    bb.querySelector('[data-a="del"]').disabled = isProtected(info.block);
    bb.querySelector('[data-a="up"]').disabled = !sib(info.block, -1) || isProtected(sib(info.block, -1));
    bb.querySelector('[data-a="down"]').disabled = !sib(info.block, 1) || isProtected(sib(info.block, 1));
  }
  document.addEventListener('mouseover', ev => {
    if (ev.target.closest('.lsv-blockbar, .lsv-addmenu, .lsv-format, .lsv-bar, .lsv-modal')) return;
    const info = blockInfo(ev.target);
    if (info) showBlockBar(info);
  });
  bb.addEventListener('mousedown', ev => ev.preventDefault());
  bb.addEventListener('click', ev => {
    const a = ev.target.closest('button'); if (!a || !cb) return;
    const info = cb, act = a.dataset.a;
    if (act === 'del'){ if (confirm('Diesen Bereich entfernen?')) doOp(info, {type: 'remove', path: info.path}); }
    else if (act === 'up' || act === 'down') doOp(info, {type: act, path: info.path});
    else if (act === 'line') doOp(info, {type: 'toggle', cls: 'ohne-linie', path: info.path});
    else if (act === 'add') showAddMenu(info);
  });

  function showAddMenu(info){
    const items = info.inTable ? [['row', '≡ Tabellenzeile darunter']]
      : info.inGrid ? [['tile', '▦ Kachel'], ['img', '🖼 Bild-Kachel']]
      : [['img', '🖼 Bild'], ['hr', '— Trennstrich'], ['p', '¶ Absatz'], ['h', 'H Zwischenüberschrift']]
          .concat(info.block.tagName === 'TABLE' ? [['rowEnd', '≡ Tabellenzeile (am Ende)']] : []);
    menu.innerHTML = items.map(([k, l]) => `<button type="button" data-k="${k}">${l}</button>`).join('');
    const r = bb.getBoundingClientRect();
    menu.style.display = 'flex';
    menu.style.top = (r.bottom + scrollY + 4) + 'px';
    menu.style.left = Math.max(8, r.right + scrollX - menu.offsetWidth) + 'px';
    menu.onclick = async ev => {
      const k = ev.target.closest('button') && ev.target.closest('button').dataset.k; if (!k) return;
      menu.style.display = 'none';
      const id = nid();
      if (k === 'hr') doOp(info, {type: 'insert', path: info.path, html: '<hr class="trenner">'});
      if (k === 'p') doOp(info, {type: 'insert', path: info.path, html: `<p data-e="${id}">Neuer Absatz – hier klicken und schreiben.</p>`});
      if (k === 'h') doOp(info, {type: 'insert', path: info.path, html: `<h3 class="zwischen" data-e="${id}">Neue Zwischenüberschrift</h3>`});
      const row = `<tr><th data-e="${id}-k">Bezeichnung</th><td data-e="${id}-v">Wert</td></tr>`;
      if (k === 'row') doOp(info, {type: 'insert', path: info.path, html: row});
      if (k === 'rowEnd') doOp(info, {type: 'appendRow', path: info.path, html: row});
      if (k === 'tile') doOp(info,{type: 'insert', path: info.path, html: `<div class="tile"><h3 data-e="${id}-t">Neue Kachel</h3><p data-e="${id}-p">Text – hier klicken und schreiben.</p></div>`});
      if (k === 'img'){
        const file = await pickImage(); if (!file) return;
        try {
          const im = await prepareImage(file);
          const path = `img/uploads/${rel.replace(/\.html$/, '').replace(/\//g, '-')}-${id}.${im.ext}`;
          pendingImgs.push({path, bytes: im.bytes});
          const html = src => info.inGrid
            ? `<div class="tile bild-kachel"><div class="pic bild-block"><img data-e="${id}" src="${src}" alt=""></div><p data-e="${id}-c">Bildunterschrift</p></div>`
            : `<div class="pic bild-block"><img data-e="${id}" src="${src}" alt=""></div>`;
          doOp(info, {type: 'insert', path: info.path, html: html(toRoot + path)}, {type: 'insert', path: info.path, html: html(im.url)});
        } catch (err){ toast(err.message, true); }
      }
    };
  }

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

  /* ---------------- Neuer Artikel (gemeinsame Funktion aus js/lsv-cms.js) ---------------- */
  async function createArticle(fd){
    const o = {}; for (const [k, v] of fd.entries()) o[k] = v;
    return LSVCms.articles.create(gh, o);
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
