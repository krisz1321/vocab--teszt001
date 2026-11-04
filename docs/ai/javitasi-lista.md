# VocabApp — javítási lista

> Készült: 2026-11-04 · commit `44da6e3`; a kipipált tételek javítva a `fix/javitasi-lista` ágon (`2db1e23`) · forrás: [`leletek.md`](leletek.md), [`e2e-teszt-2026-10-30.md`](e2e-teszt-2026-10-30.md), [`e2e-teszt-2026-11-03.md`](e2e-teszt-2026-11-03.md)

**Hogyan használd:** a `[ ]` helyére írj `x`-et (`[x]`), ha a hibát javítani kell. Amit üresen hagysz, az marad.
Az áthúzott sorok már javítva vannak, csak a teljesség kedvéért szerepelnek.

**Súly:** **Nagy** = adatvesztés, biztonsági rés vagy a tanulót közvetlenül zavaró hiba · **Közepes** = valós hiba, de ritkán jön elő, vagy van kerülőút · **Kicsi** = szépséghiba, holt kód, karbantartás.

**Idő:** becsült munka a javítással és a kipróbálással együtt.

| | Darab |
|---|---|
| Összes lelet | 58 |
| Javítva vagy megszűnt (áthúzva) | 42 |
| Részben javítva | 1 (L-27) |
| Nyitott | 15 |
| L-szám nélküli észrevétel (lista végén) | 16 |

Az **„ajánlom”** jelölés az előző elemzés szerinti első négy: L-57, L-27, L-04, L-58.

## Leletek

- ~~**L-01** · Nagy — A tanulófelületen mentett magyar jelentés törölte a kártya címkéit.~~ Javítva (`8e6698c`)
- [ ] **L-02** · Nagy · 15 perc (csak a követés megszüntetése) / 1 óra (a git-történetből is) — A régi SQLite-adatbázis (`vocab.db`) a gitben van, valódi fiókok email-címével és jelszó-hash-ével, és fent van a GitHubon is. Már semmi nem használja.
- [ ] **L-03** · Nagy · 30 perc — A JWT aláírókulcsa (`Jwt:Key`) commitolva van az `appsettings.json`-ban. Aki ismeri, bármelyik fiók nevében tud tokent gyártani, és a válaszazonosítót is ezzel írják alá.
- [ ] **L-04** · Közepes · 1–2 óra · **ajánlom** — Egy válaszazonosítóval (token) 12 órán át többször is be lehet küldeni a választ, és minden beküldés tovább lépteti a kártya ismétlési idejét. Nem ellenőrzi, hogy a kártya esedékes-e.
- ~~**L-05** · Közepes — Minden mentési hibára a „Várd meg a minimum időt” üzenet jelent meg, lejárt tokennél is.~~ Javítva (`8e6698c`)
- ~~**L-06** · Közepes — A Kártyázás újrakezdése a szűrőn kívüli jelöléseket is törölte.~~ Javítva (`8e6698c`)
- ~~**L-07** · Közepes — A késve érkező MI-definíció vagy -példa a következő kártyára kerülhetett.~~ Javítva (`8e6698c`)
- [ ] **L-08** · Közepes · 2–4 óra — Az MI-költség nincs korlátozva: a sebességkorlát ki van kapcsolva, több MI-végpont tetszőleges szóra hívható, és a Nyelvtan/Mondatok „Tipp” gombja korlátlanul kérhető. Minden kérés pénzbe kerül.
- [ ] **L-09** · Közepes · 1–2 nap — Sok lekérdezés a felhasználó összes kártyáját a memóriába tölti (következő kártya, keresés, statisztika, pakli-lista). Demó méretben nem látszik, sok ezer kártyánál lassú lesz.
- ~~**L-10** · Közepes — A nap első két, egyszerre beküldött válasza 500-as hibát adhatott.~~ Javítva (`30657b5`)
- [ ] **L-11** · Közepes · 1–2 óra — A szerver a dátumokat hol időzóna-jelöléssel („Z”), hol nélküle küldi. A kliens most megkerüli, de új kódnál könnyű elrontani.
- ~~**L-12** · Közepes · 10 perc — A Visual Studio `.vs/` mappája (19 bináris fájl) követett a gitben, és folyamatosan változik.~~ Javítva (`44accb1`)
- ~~**L-13** · Közepes — A hibaüzenetek nem a szerver magyar szövegét mutatták, csak általános szöveget.~~ Javítva (`30657b5`)
- ~~**L-14** · Közepes · 2–3 óra · *részben javítva* — Jelszócsere után a régi bejelentkezés (token) még 7 napig érvényes marad, így egy ellopott token a jelszócserét is túléli. (A törölt fiók tokenje már 401, az javítva.) Migráció kell hozzá.~~ Javítva (`521cf3f`)
- ~~**L-15** · Közepes — Lejárt bejelentkezésnél a program üzenet nélkül léptetett ki, és a régi adatok a képernyőn maradtak.~~ Javítva (`30657b5`)
- ~~**L-16** · Közepes · 2–4 óra — Ugyanaz az adat több helyen van beírva (MI-modell-lista a kliensben és a szerveren, szöveghossz-limitek 4 helyen, egy kódblokk 6-szor). Egy módosításnál könnyű kihagyni egy helyet.~~ Javítva (`71b78ab`)
- [ ] **L-17** · Közepes · 1–2 nap (alapkészlet) — Nincs automata teszt és nincs CI. Minden ellenőrzés kézi vagy ilyen hosszú, MI-vel végzett teszt.
- ~~**L-18** · Kicsi · 15 perc — Holt kód: a fellebbezés indoklás nélküli ága a szerveren sosem érhető el.~~ Javítva (`54556c7`)
- ~~**L-19** · Kicsi · 30 perc — Holt ellenőrző kód az MI-controllerben, és két hibás kérés angol címmel ad 400-at a magyar helyett (a felület ezt nem küldi).~~ Javítva (`54556c7`)
- ~~**L-20** · Kicsi · 10 perc — Az `AiSettings:Model` beállítást semmi nem olvassa, a modell a felhasználó beállításából jön. Félrevezető.~~ Javítva (`54556c7`)
- ~~**L-21** · Kicsi · 1 óra — Avatar: a szerver nem nézi meg, hogy a feltöltött fájl valóban kép-e, a controller 8 MB-ot enged, a szolgáltatás 1 MB-ot, és az avatarok azonosító alapján bárki számára letölthetők.~~ Javítva (`f8e77dc`)
- ~~**L-22** · Kicsi — A „Nehéz szó” tooltip rossz helyre (Profil) irányított.~~ Javítva (`30657b5`)
- ~~**L-23** · Kicsi · 10 perc — A kliens `README.md`-je két elavult állítást tartalmaz (proxy, production build).~~ Javítva (`44accb1`)
- ~~**L-24** · Kicsi · 1–3 óra — Build-figyelmeztetések: a fő JavaScript-csomag 876 kB (az 1 MB-os hibahatár közel van), három komponens stílusa a 4 kB-os küszöb fölött van (a Paklik 0,5 kB-ra a hibahatártól), és van egy nullable és egy Sass-elavulási figyelmeztetés.~~ Javítva (`54556c7`, `2db1e23`)
- ~~**L-25** · Kicsi · 15 perc — Nem használt kódelemek és üres fájlok (egy getter, egy CSS-osztály, üres `app.component.scss`, üres `projekt/ng`).~~ Javítva (`44accb1`)
- ~~**L-26** · Kicsi · 3–5 óra — Akadálymentesség: a Kártyázás kártyája billentyűvel nem kezelhető rendesen, a párbeszédablakokból kiléphet a fókusz, hiányoznak ARIA-jelölések, a számok angol formátumúak.~~ Javítva (`b12502f`)
- [] **L-27** · Kicsi · 1 óra · *részben javítva* · **ajánlom** — Ha kijelentkezel, miközben egy hibás válasz még nincs mentve, a válasz elvész (a beküldés már bejelentkezés nélkül megy ki). Így egy elrontott kártya büntetés nélkül megúszhatja. (A Paklik nézet mentetlen beillesztésénél már kérdez, az javítva.)
- [ ] **L-28** · Kicsi · 1 óra — A demófiókokat minden induláskor visszahozza a program, akkor is, ha törölted őket. Ha valaki `demo` vagy `second` felhasználónevet választ, az API nem indul el.
- [ ] **L-29** · Kicsi · 30 perc — Az üres időzóna és az üres példamondat-szint 400-as hibát ad ott, ahol a kód alapértéket várna.
- ~~**L-30** · Kicsi — Visszafordíthatatlan és üres SQLite-migráció.~~ Megszűnt (az SQL Serveres kezdő migráció váltotta)
- [ ] **L-31** · Közepes · 10 perc (döntés) — Az AI-dokumentumok (`AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `docs/ai/` hat fájlja) a `.gitignore`-ban vannak: nincs történetük és nincs mentésük, ha a gép elvész, velük vesznek.
- [ ] **L-32** · Kicsi · 30 perc — Vegyes sorvég a fájlokban (CRLF és LF). Egy `.gitattributes` rendbe tenné, de minden fájl diffjében megjelenik.
- [ ] **L-33** · Kicsi · 30 perc — A tanulófelület védelem nélkül olvassa a böngésző tárolóját: ha a böngésző tiltja (privát mód, blokkolt sütik), a Tanulás nézet nem tölt be.
- ~~**L-34** · Közepes — Többszavas kifejezésnél (pl. `set up`) a kártyánkénti MI-definíció és -példa gyakran 502-vel bukott.~~ Javítva (`8e6698c`)
- ~~**L-35** · Közepes — A Paklik nézetben a futó MI-generálás eredménye rossz kártyára kerülhetett.~~ Javítva (`8e6698c`)
- ~~**L-36** · Kicsi — A hibás válasz mód- vagy irányváltással mentés nélkül kihagyható volt.~~ Javítva (`8e6698c`)
- ~~**L-37** · Kicsi — A CSV-export és -import magyar Excellel nem működött (ékezet, pontosvessző).~~ Javítva (`8e6698c`)
- ~~**L-38** · Kicsi — Ahol a nyári időszámítás éjfélkor kezdődik (pl. Chile), aznap 500-as hiba jött.~~ Javítva (`8e6698c`)
- ~~**L-39** · Kicsi — A „megtanult” visszaállítása a két helyen eltérően működött.~~ Javítva (`8e6698c`)
- [ ] **L-40** · Kicsi · 1 óra — A pakli MI-kitöltése, ha a harmadik próbálkozás is hibás, a már elkészült magyar jelentéseket is eldobja, és az egész kérés hibával végződik.
- ~~**L-41** · Nagy — Fordítás módban, angol → magyar irányban az MI-ellenőrzés mindig 502-vel bukott.~~ Javítva (`f5d91d8`)
- ~~**L-42** · Kicsi — A „Hibák ismétlése” és az „Automatikus MI-ellenőrzés” alapértéke csak a kódban volt bekapcsolva, az adatbázisban nem.~~ Javítva (SQL Serveres kezdő migráció)
- ~~**L-43** · Kicsi — A Mondatok statisztikája a kézzel elfogadott próbálkozásnál az MI eredeti ítéletét számolta.~~ Javítva (`8e6698c`)
- ~~**L-44** · Kicsi — A Beállítások mentése sikertelen betöltés után alapértékekkel vagy egy másik fiók értékeivel írhatta felül a beállításokat.~~ Javítva (`30657b5`)
- ~~**L-45** · Nagy — Helyes válaszra az MI üres visszajelzést adott, és a tanuló hibaüzenetet kapott (Nyelvtan, Mondatok).~~ Javítva (`a32bf2f`), élesben igazolva
- [ ] **L-46** · Közepes · 1–2 óra — A böngésző időzónája sosem jut el a szerverre, és a felületen nincs időzóna-választó: minden fiók Budapest szerint számol. Külföldön a nap rossz órában vált (Tokióból 8 órával).
- ~~**L-47** · Közepes — Sikertelen mentés után a helyes válasz kártyájáról nem lehetett továbblépni, csak újratöltéssel.~~ Javítva (`a32bf2f`)
- ~~**L-48** · Kicsi — Kikapcsolt részleges egyezésnél a kártya teljes jelentése (`fut, szalad`) hibásnak számított.~~ Javítva (`a32bf2f`)
- ~~**L-49** · Kicsi — Az „Összekevested ezzel” felirat sosem jelent meg.~~ Javítva (`a32bf2f`)
- ~~**L-50** · Kicsi — Törött avatarkép után eltűnt a „Kép törlése” gomb.~~ Javítva (`a32bf2f`)
- ~~**L-51** · Kicsi — Hibás MI-válasznál (rossz JSON) a legtöbb végpont nem próbálkozott újra.~~ Javítva (`a32bf2f`)
- [ ] **L-52** · Kicsi · 1 óra — Néhány szöveg kontrasztja a 4,5:1-es akadálymentességi határ alatt van: sötét témában a halvány szövegek (3,94) és a fülszámláló (3,34), világosban a „Megtanult” jelvény (4,4) és a zöld növekedésjelző (4,44).
- ~~**L-53** · Kicsi — A CSV-hibaüzenet eggyel kisebb sorszámot írt (a fejlécet nem számolta).~~ Javítva (`a32bf2f`)
- ~~**L-54** · Kicsi — Az üres „Minimum idő” mező hiba nélkül 0-ként mentődött.~~ Javítva (`a32bf2f`)
- ~~**L-55** · Kicsi — Az „Új pakli” ablak Escape-re nem zárult be.~~ Javítva (`a32bf2f`)
- ~~**L-56** · Kicsi — Megosztott pakli új verziójánál új, üres haladású másolat készült a régi mellé.~~ Javítva (`a32bf2f`): helyben frissít
- ~~**L-57** · Kicsi · 30–60 perc · **ajánlom** — A „Kitöltés MI-vel” és a magyar jelentés generálása hibát ad, ha az MI a magyar jelentés mellé az angol szót is beírja. Jövevényszavaknál gyakori (`hedge fund`: 4-ből 3-szor), a hívás ára viszont felmerül, a kártya magyar jelentése üres marad.~~ Javítva (`bd42143`)
- ~~**L-58** · Kicsi · 15–30 perc · **ajánlom** — A „Miért volt rossz?” csevegésben az MI kiemelései nyers `**csillagokkal**` jelennek meg.~~ Javítva (`bd42143`, `c316c35`)

## Számozatlan észrevételek a két tesztből

Ezek nem kaptak L-számot, mert nem egyértelműen hibák. Mind **Kicsi**.

**Felület**
- ~~Gyakorló körben a munkamenet-sáv „még 0 kártya választható” feliratot mutat, pedig van még kártya. · 30 perc~~ Javítva (`b623118`)
- ~~Függő hibás válasznál a tiltott Mód gomb buboréksúgója „Mód váltása”, nem az, hogy „Előbb fejezd be ezt a kártyát.” · 10 perc~~ Javítva (`b623118`)
- ~~768 px széles képernyőn a „Gyakorlás típusa” mező szövege levágódik. · 15 perc~~ Javítva (`b623118`)
- ~~Telefonon, nyitott billentyűzetnél (kb. 500 px magas nézet) a „Válasz ellenőrzése” gomb a látható rész alá kerül; Enterrel menthető. · 1 óra~~ Javítva (`b623118`)
- ~~Telefonon a munkamenet-sáv és a kártya fejléce kb. 200 px-t foglal a beviteli mező fölött. · 1–2 óra~~ Javítva (`b623118`)
- ~~Kijelentkezés után a belépési képernyőn a Regisztráció fül marad nyitva, ha előtte regisztráltál. · 15 perc~~ Javítva (`00e3fbd`)
- ~~Azonos nevű pakli kérdés nélkül létrehozható (kártyánál és másolásnál kérdez a program). · 30 perc~~ Javítva (`546dc2a`)
- ~~A nyitott paklilista nem frissül magától: más felhasználó új verziója csak navigálás vagy újratöltés után látszik. · 1 óra~~ Javítva (`546dc2a`)
- ~~A kártyaszerkesztő késleltetve teszi a fókuszt a Szó mezőre; nagyon gyors gépelésnél vagy beillesztésnél a szöveg rossz mezőbe kerülhet. · 15 perc~~ Javítva (`546dc2a`)
- ~~A böngészőfül bezárása után újra be kell lépni (szándékos, de telefonon gyakori). Egy „Maradjak bejelentkezve” lehetőség segítene. · 1–2 óra~~ Javítva (`00e3fbd`)

**MI**
- [ ] Az Automatikus MI-ellenőrzés új fióknál alapból be van kapcsolva, így egy kezdő minden hibás válasza fizetős MI-hívás, és ez sehol nem látszik. Ez döntés kérdése. · 15 perc
- ~~Fellebbezés után ugyanaz az MI-indoklás kétszer is megjelenhet, kicsit más szavakkal. · 30–60 perc~~ Javítva (`bd42143`, `c316c35`)
- [ ] Az amerikai írásmódot (`harbor`) nem fogadja el a brit szavú kártyán (`harbour`), csak második esélyt ad. · 30–60 perc (prompt)
- ~~Nyelvtan: egyeztetési hibánál (`She have packed…`) az igeidőt is hibásnak jelöli, pedig az jó. · 30–60 perc (prompt)~~ Javítva (`bd42143`)

**Dokumentáció és repó**
- ~~Az elavult dokumentumrészek frissítése (`szerzodesek.md` végpontszám és két régi figyelmeztetés, `szotar.md`, `.cursorrules` Bootstrap- és témaszabályai, `AGENTS.md` 10.4 „L-44-től”). · 1 óra~~ Kész (helyi, gitignore-olt dokumentumok: nincs commit)
- ~~Az `AGENTS.md` 31,9 KB, a 30 KB-os cél fölött (a Codex 32 KiB-nál levágja). · 30 perc~~ Kész (helyi, gitignore-olt dokumentumok: nincs commit)
