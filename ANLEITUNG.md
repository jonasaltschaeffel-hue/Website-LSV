# Website LSV Regensburg – Veröffentlichen mit GitHub Pages

## 1. Repository anlegen und hochladen

1. Bei [github.com](https://github.com) anmelden (oder kostenlos registrieren).
2. Oben rechts **+ → New repository**:
   - Name: z. B. `website`
   - **Public** (für kostenloses GitHub Pages nötig)
   - „Create repository“
3. Im neuen Repository: **„uploading an existing file“** anklicken und den **Inhalt** dieses Ordners
   (`index.html`, `css`, `js`, `img`, `aktuelles`, `flotte`, `seiten`, `admin`, `.nojekyll` …) hineinziehen.
   Den Ordner `modelle` brauchst du nicht hochzuladen (außer `modelle/ask21/license.txt`, falls gewünscht).
   → **Commit changes**.

## 2. GitHub Pages einschalten

1. Im Repository: **Settings → Pages**
2. *Source:* „Deploy from a branch“ · *Branch:* `main` · Ordner `/ (root)` → **Save**
3. Nach 1–2 Minuten ist die Seite online unter `https://<benutzername>.github.io/website/`

**Eigene Domain** (z. B. `www.luftsportverein-regensburg.de`): unter *Settings → Pages → Custom domain*
eintragen und beim Domain-Anbieter einen DNS-Eintrag setzen (CNAME auf `<benutzername>.github.io`).
Danach „Enforce HTTPS“ aktivieren.

## 3. Bearbeitungsmodus einrichten (einmalig)

1. **GitHub-Schlüssel erstellen:** *Settings (deines Kontos) → Developer settings → Personal access tokens →
   Fine-grained tokens → Generate new token*
   - *Repository access:* „Only select repositories“ → nur das Website-Repository
   - *Permissions → Repository permissions → Contents:* **Read and write** (sonst nichts)
   - Ablaufdatum wählen (max. 1 Jahr) → Schlüssel kopieren
2. Auf der veröffentlichten Website **`/admin/einrichten.html`** öffnen, Benutzername, Repository und
   Schlüssel eintragen und **dein eigenes Passwort** festlegen (mind. 14 Zeichen, am besten ein Satz).
3. Fertig – der Schlüssel wird mit deinem Passwort verschlüsselt im Repository gespeichert (`admin/zugang.json`).

## 4. Bearbeiten

- Ganz unten auf der Startseite auf **„Bearbeiten“** klicken (oder an eine Adresse `#bearbeiten` anhängen) und das Passwort eingeben.
- Texte anklicken und ändern, Formatleiste für Schriftart/Größe/Farbe/fett/kursiv, **„📷 Bild ändern“** auf Bildern,
  **„+ Neuer Artikel“** für Aktuelles. **Speichern** (oder Strg+S).
- Änderungen sind nach **ca. 1 Minute** online (GitHub Pages baut die Seite neu).
- Jede Änderung ist ein Commit im Repository – im Reiter *Commits* kann man alles nachsehen und rückgängig machen.
- Angemeldet bleibst du nur im aktuellen Browser-Tab; „Abmelden“ beendet den Bearbeitungsmodus.

## Wenn der Schlüssel abläuft

Neuen Schlüssel wie in Schritt 3.1 erstellen und `/admin/einrichten.html` erneut ausfüllen
(Passwort kann gleich bleiben oder neu gewählt werden).

## Sicherheit

- Das Passwort verlässt nie deinen Browser; gespeichert ist nur der damit verschlüsselte Schlüssel (AES-256, PBKDF2 mit 600.000 Durchläufen).
- Ein **langes Passwort** ist wichtig, weil die verschlüsselte Datei öffentlich im Repository liegt.
- Der Schlüssel darf nur dieses eine Repository ändern. Im Notfall bei GitHub unter *Fine-grained tokens* sofort widerrufen.
