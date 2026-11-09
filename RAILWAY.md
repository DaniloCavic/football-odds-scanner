# Postavljanje na Railway – korak po korak

Railway pokreće aplikaciju i bazu na internetu. Kada pošaljem izmene na GitHub (grana `main`), Railway sam ažurira aplikaciju za 2–4 minuta.

---

## 1. Novi projekat iz GitHub-a
1. Otvorite https://railway.com → **Login with GitHub**.
2. Kliknite **New Project** → **Deploy from GitHub repo**.
3. Ako ne vidite repozitorijum: **Configure GitHub App** → dozvolite pristup repozitorijumu **football-odds-scanner**.
4. Izaberite **DaniloCavic/football-odds-scanner**.
5. Railway odmah počinje da gradi. **Prvi pokušaj će pasti** jer još nema bazu. To je očekivano.

## 2. Baza podataka
1. U projektu kliknite **+ New** (ili **Create**) → **Database** → **Add PostgreSQL**.
2. Pojaviće se kockica **Postgres**. Ne treba ništa da podešavate.

## 3. Promenljive (Variables)
1. Kliknite na kockicu **football-odds-scanner** → kartica **Variables** → **Raw Editor**.
2. Nalepite ovo i **promenite email i lozinku** u svoje:

```
DATABASE_URL=${{Postgres.DATABASE_URL}}
ADMIN_EMAIL=vas@email.com
ADMIN_PASSWORD=NekaJakaLozinka2026
```

3. Kliknite **Update Variables** (ili **Save**).

> Lozinka mora imati bar 8 znakova. Admin nalog se pravi **samo prvi put**. Ako kasnije promenite
> `ADMIN_PASSWORD`, postojeći nalog se ne menja.

## 4. Grana
Kockica **football-odds-scanner** → **Settings** → **Source** → **Branch**: proverite da piše `main`.

## 5. Javni link
1. Kockica **football-odds-scanner** → **Settings** → **Networking** → **Generate Domain**.
2. Ako pita za port, upišite **3000**.
3. Dobijate link tipa `https://football-odds-scanner-production.up.railway.app`.

## 6. Ponovno pokretanje
Kartica **Deployments** → kod poslednjeg pokušaja: **⋮** → **Redeploy**. Sačekajte da piše **Active** (zeleno).

## 7. Provera
- Otvorite `VAŠ-LINK/api/health`. Treba da piše `{"status":"ok","db":"ok"}`.
- Otvorite `VAŠ-LINK` i trebalo bi da se pojavi ekran za prijavu.

## Ako nešto ne radi
- **Deployments** → kliknite na poslednji → **View logs**. Kopirajte mi poslednjih 30-ak linija.
- Najčešće greške: zaboravljena `DATABASE_URL` promenljiva, ili Postgres kockica nije u istom projektu.
