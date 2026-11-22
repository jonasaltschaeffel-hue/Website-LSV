/* Bearbeitungsmodus: Anmeldung mit eigenem Passwort (GitHub Pages).
   - Link „Bearbeiten“ im Fußbereich oder Adresse mit #bearbeiten öffnet die Anmeldung.
   - Das Passwort entschlüsselt den GitHub-Schlüssel aus admin/zugang.json.
   - Angemeldet bleibt man nur in diesem Browser-Tab (bis zum Abmelden oder Schließen).
   Für normale Besucher wird hier nichts geladen. */
(() => {
  const base = new URL('..', document.currentScript.src);
  const load = (src, css) => new Promise((ok, fail) => {
    const el = document.createElement(css ? 'link' : 'script');
    if (css){ el.rel = 'stylesheet'; el.href = new URL(src, base).href; }
    else { el.src = new URL(src, base).href; }
    el.onload = ok; el.onerror = fail;
    (css ? document.head : document.body).appendChild(el);
  });
  // Esc: zurück zur Startseite
  document.addEventListener('keydown', ev => {
    if (ev.key !== 'Escape' || ev.defaultPrevented || ev.ctrlKey || ev.altKey || ev.metaKey || ev.shiftKey) return;
    const f = document.activeElement;
    if (f && (f.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(f.tagName))) return;   // Eingabe läuft
    if (document.querySelector('.lsv-modal, dialog[open]')) return;                          // Fenster offen
    const menu = document.getElementById('tabs');
    if (menu && menu.classList.contains('open')){                                            // Handy-Menü erst schließen
      menu.classList.remove('open');
      document.getElementById('menu-btn')?.setAttribute('aria-expanded', 'false');
      return;
    }
    const start = new URL('index.html', base).href;
    const istStart = location.href.split(/[?#]/)[0] === start || location.href.split(/[?#]/)[0] === base.href;
    if (!istStart) location.href = start;
  });

  const startEditor = () => Promise.all([load('css/editor.css?v=4', true), window.LSVGit ? 0 : load('js/lsv-github.js?v=2'), window.LSVCms ? 0 : load('js/lsv-cms.js?v=3'), window.LSVBilder ? 0 : load('js/bildersammlung.js?v=2')]).then(() => load('js/editor.js?v=6'));

  // Fußzeile wie auf der Startseite auf allen Unterseiten (Impressum, Datenschutz, Bearbeiten).
  // Wird nur angezeigt, nicht in die Seiten gespeichert.
  if (!document.querySelector('footer')){
    const ziel = document.querySelector('main .article') || document.querySelector('main');
    if (ziel){
      const f = document.createElement('footer');
      f.className = 'lsv-fuss';
      const link = (text, href, nofollow) => { const a = document.createElement('a'); a.textContent = text; a.href = href; if (nofollow) a.rel = 'nofollow'; return a; };
      const c = document.createElement('span'); c.textContent = `© ${new Date().getFullYear()} Luftsportverein Regensburg e. V.`;
      f.append(c, link('Impressum', new URL('seiten/impressum.html', base).href), link('Datenschutz', new URL('seiten/datenschutz.html', base).href),
        link('Kontakt', new URL('seiten/kontakt.html', base).href), link('Bilder', new URL('seiten/bilder.html', base).href, true), link('Bearbeiten', '#bearbeiten', true));
      ziel.appendChild(f);
    }
  }

  // Schon angemeldet (in diesem Tab)?
  try { if (sessionStorage.getItem('lsv-edit-session')){ startEditor(); return; } } catch {}

  async function openLogin(){
    if (document.querySelector('.lsv-login')) return;
    await load('css/editor.css', true);
    if (!window.LSVGit) await load('js/lsv-github.js');
    const m = document.createElement('div');
    m.className = 'lsv-modal lsv-login';
    m.innerHTML = `
      <form class="lsv-dialog lsv-dialog-small">
        <h2>Website bearbeiten</h2>
        <label>Passwort<input name="pw" type="password" required autocomplete="current-password"></label>
        <div class="lsv-login-msg"></div>
        <div class="lsv-dialog-btns">
          <button type="button" class="lsv-cancel">Abbrechen</button>
          <button type="submit" class="lsv-ok">Anmelden</button>
        </div>
      </form>`;
    document.body.appendChild(m);
    const msg = m.querySelector('.lsv-login-msg'), ok = m.querySelector('.lsv-ok');
    m.querySelector('input').focus();
    m.querySelector('.lsv-cancel').onclick = () => { m.remove(); if (location.hash === '#bearbeiten') history.replaceState(null, '', location.pathname + location.search); };
    m.querySelector('form').onsubmit = async ev => {
      ev.preventDefault();
      ok.disabled = true; ok.textContent = 'Prüfe …'; msg.textContent = '';
      try {
        const cfg = await LSVGit.loadConfig(base);
        const token = await LSVGit.decryptToken(cfg, ev.target.pw.value);
        const public_cfg = {owner: cfg.owner, repo: cfg.repo, branch: cfg.branch, pfad: cfg.pfad};
        if (!await LSVGit.client(public_cfg, token).check()) throw new Error('Kein Schreibzugriff mit diesem Schlüssel.');
        LSVGit.session.set(public_cfg, token);
        m.remove();
        if (location.hash === '#bearbeiten') history.replaceState(null, '', location.pathname + location.search);
        startEditor();
      } catch (err){
        msg.textContent = err.message;
        ok.disabled = false; ok.textContent = 'Anmelden';
        await new Promise(r => setTimeout(r, 1000));     // kurze Pause gegen schnelles Durchprobieren
      }
    };
  }

  document.addEventListener('click', ev => {
    const a = ev.target.closest('a[href$="#bearbeiten"]');
    if (a){ ev.preventDefault(); openLogin(); }
  });
  if (location.hash === '#bearbeiten') openLogin();
})();
