# Football Odds Scanner – rad u produkciji

Uputstvo za održavanje aplikacije na Railway-u: promenljive, ažuriranje, backup i vraćanje, nadzor i rešavanje problema.

---

## 1. Environment promenljive (Railway → kockica aplikacije → Variables)

| Promenljiva | Obavezna | Opis |
|---|---|---|
| `DATABASE_URL` | da | `${{Postgres.DATABASE_URL}}` – veza ka bazi |
| `ADMIN_EMAIL` | da | email prvog (admin) naloga – pravi se samo ako ne postoji |
| `ADMIN_PASSWORD` | da | početna lozinka (min. 8 znakova). Posle prve prijave promenite je u **Podešavanja → Promena lozinke** |
| `PORT` | da | `8080` (mora da se poklapa sa portom u Settings → Networking) |
| `ODDSPAPI_API_KEY` | za robota | ključ sa oddspapi.io (kvote + rezervni rezultati) |
| `APIFOOTBALL_API_KEY` | preporučeno | ključ sa api-football.com – **plaćeni paket (Pro)**, besplatni ne radi sa cloud servera |
| `TRACKER_ENABLED` | ne | `false` isključuje automatsku proveru rezultata |
| `TRACKER_INTERVAL_MS` | ne | interval provere (podrazumevano 300000 = 5 min) |

Tajne (ključevi, lozinke) postoje **samo** u Railway Variables – nikad u kodu ni u browseru.

## 2. Ažuriranje
Svaki push na granu `main` → Railway sam gradi novu verziju (3–5 min). Pri pokretanju se automatski primenjuju
migracije baze (`prisma migrate deploy`). Ako build padne, stara verzija ostaje aktivna.

Vraćanje na prethodnu verziju: **Deployments → ⋮ kod prethodne uspešne verzije → Redeploy**.

## 3. Backup i vraćanje podataka

### 3a. Railway backup baze (preporučeno – automatski)
1. Kliknite kockicu **Postgres** → kartica **Backups**.
2. Uključite **automatske backup-e** (dnevno/nedeljno) ili kliknite **Create backup** pre većih izmena.
3. Vraćanje: u istoj kartici kod željenog backup-a kliknite **Restore**.
(Dostupnost zavisi od Railway plana – proverite karticu Backups.)

### 3b. Izvoz iz aplikacije (ručno, bilo kada)
**Podešavanja → Rezervna kopija i izvoz**:
- **Preuzmi CSV** – svi tipovi, rezultati i profit (otvara se u Excel-u)
- **Preuzmi JSON backup** – kompletna kopija podataka (filteri, tipovi, utakmice, rezultati, podešavanja, audit log). Lozinke nisu uključene.

Preporuka: JSON backup jednom nedeljno sačuvajte na svom računaru/Google Drive-u.

### 3c. Potpun backup baze sa računara (pg_dump)
Potreban je PostgreSQL (već instaliran – vidi POKRETANJE.md) i javna adresa baze:
Railway → **Postgres** → **Variables** → kopirajte `DATABASE_PUBLIC_URL`.

```bash
pg_dump "DATABASE_PUBLIC_URL_OVDE" --format=custom --file=fos-backup.dump
```

Vraćanje (pažnja: prepisuje podatke u ciljnoj bazi):

```bash
pg_restore --clean --if-exists --no-owner --dbname="DATABASE_PUBLIC_URL_OVDE" fos-backup.dump
```

Posle vraćanja uradite **Redeploy** aplikacije.

## 4. Nadzor
- `https://VAŠ-LINK/api/health` – `status`, `db`, `version` (commit), `trackerLastRun`, `uptimeSec`. Railway ga koristi kao healthcheck.
- **Aktivne selekcije** – stanje izvora rezultata (potrošeni zahtevi, pauze, poslednje greške).
- **Robot** – stanje OddsPapi naloga (potrošeno ovog meseca).
- **Railway → Deploy Logs** – logovi su JSON redovi; pretraga po: `"area":"tracker"`, `"area":"robot"`, `"area":"auth"`, `"level":"error"`.
- **Istorija skeniranja → Audit log** – sve promene statusa, ručne ispravke, brisanja i promene lozinke.

## 5. Troškovi (orijentaciono)
| Servis | Paket | Napomena |
|---|---|---|
| Railway | Hobby | aplikacija + Postgres |
| OddsPapi | Free (250 zahteva/mes.) | robot: ~8–15 zahteva po skeniranju „Danas“; rezultati 1 zahtev po utakmici |
| API-Football | Pro (~16 $/mes.) | 7.500 zahteva/dan; nama treba ~20/dan. Free ne radi sa cloud-a |

## 6. Bezbednost
- Prijava: bcrypt, sesije u bazi (httpOnly, secure, sameSite), 5 pokušaja / 15 min, odjava drugih uređaja pri promeni lozinke.
- Sigurnosna zaglavlja (CSP, X-Frame-Options, HSTS…), CSRF zaštita za API (Origin mora biti ista adresa).
- Administratorske akcije (ručna ispravka, izvoz, pokretanje provere) – samo ADMIN, uz audit log.
- Zavisnosti (`npm audit`, nov. 2026): prijavljene ranjivosti su u alatima za build (postcss), Prisma CLI
  konfiguraciji (deepmerge-ts) i zod-u (samo ogromni nizovi) – nisu dostupne napadaču u ovoj aplikaciji.
  Rešavaju se prelaskom na nove glavne verzije (Next 16, Prisma 7, Zod 4) – planirati kao zasebnu izmenu sa testovima.
- Ako posumnjate da je ključ procureo: generišite novi na sajtu provajdera i zamenite ga u Railway Variables.

## 7. Česti problemi

| Simptom | Uzrok / rešenje |
|---|---|
| „Application failed to respond“ | Port u Networking ≠ `PORT`; pogledajte Deploy Logs |
| Robot: „ODDSPAPI_API_KEY nije podešen“ | Ime promenljive ili nije kliknuto „Apply changes“ |
| Robot: „Potrošena je mesečna kvota“ | OddsPapi kvota – čekati 1. u mesecu ili plaćeni paket |
| Aktivne: API-Football „suspended“ | Besplatni paket ne radi sa Railway-a → Pro paket, pa „Pokušaj ponovo odmah“ |
| Tipovi dugo „Čeka rezultat“ | Proverite limit OddsPapi provera (Podešavanja) i „Poslednje greške izvora“ |
| Tip u „Potrebna provera“ | Otvorite ga – piše razlog; po potrebi ručna ispravka sa obrazloženjem |
