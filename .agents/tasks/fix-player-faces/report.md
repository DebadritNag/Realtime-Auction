# Player face fix report

## Root cause
- FC26 ids are sofifa ids, the same id space as the FIFA 24 ids that name the downloaded files. The resolver (getPlayerImageCandidates) already picks /images/players/{id}.webp first, so no code change was needed for FC26 players.
- **Missing (27 of the listed players, 89 of 206 FC26 players):** only 331 files existed, built from the FIFA 24 default pool. These players are not in it, so no file existed. The fallback was the CSV player_face_url (cdn.sofifa.net), which Cloudflare blocks without a sofifa Referer and browser-like User-Agent, so the silhouette showed.
- **Wrong (Kane, Gabriel, Son, Rodri, Balde):** the files under those ids were fetched from TheSportsDB by name search and matched the wrong person (name collision). Visual check of 202126.webp showed an unrelated player, not Kane.
- Fix: all 206 unique FC26 players now use the CSV face URL (sofifa 240px), downloaded and converted to webp, saved under the FC26 id, so identity is guaranteed by id rather than name search. image-map.json updated. Sofifa serves unique images (no duplicate hashes, so no placeholders).

## Counts
- Unique FC26 players: 206. Downloaded: 206, failed 0.
- Replaced existing files: 117 (includes the 5 wrong faces fixed). Newly added: 89 (includes the 27 missing listed players).
- Still missing: 0. Default-pool ids outside FC26, external and hero images untouched.
- Caveat: re-running the old TheSportsDB scripts would overwrite these files by id; re-run scripts/download-fc26-faces.mjs afterwards.

## Changed files
- frontend/scripts/download-fc26-faces.mjs, frontend/scripts/fc26-csv.mjs (new)
- frontend/tests/player-faces.mjs (new; fails if any FC26 player lacks a real face or the 32 listed ids do not match the expected names)
- frontend/public/images/players/*.webp (206 files), image-map.json
- Verified: node tests/player-faces.mjs (206 ok), npm run typecheck pass, npx next build pass. Backend untouched.
- Visual check: contact sheet of all 32 listed players inspected, each face is the right person.

## Table
| Player | FC26 id (= sofifa id, = FIFA 24 id) | CSV record | Before | Resolved file now | Status |
|---|---|---|---|---|---|
| Kane | 202126 | H. Kane (Bayern) | wrong person (TheSportsDB file) | /images/players/202126.webp | OK |
| Lamine Yamal | 277643 | Lamine Yamal (Barcelona) | no file, fell to sofifa hotlink then silhouette | /images/players/277643.webp | OK |
| Vitinha | 255253 | Vitinha (PSG) | no file, fell to sofifa hotlink then silhouette | /images/players/255253.webp | OK |
| Gabriel Magalhaes | 232580 | Gabriel (Arsenal) | wrong person (TheSportsDB file) | /images/players/232580.webp | OK |
| Cole Palmer | 257534 | C. Palmer (Chelsea) | no file, fell to sofifa hotlink then silhouette | /images/players/257534.webp | OK |
| David Raya | 220901 | David Raya (Arsenal) | no file, fell to sofifa hotlink then silhouette | /images/players/220901.webp | OK |
| Julian Alvarez | 246191 | J. Alvarez (Atletico) | no file, fell to sofifa hotlink then silhouette | /images/players/246191.webp | OK |
| Jonathan Tah | 213331 | J. Tah (Bayern) | no file, fell to sofifa hotlink then silhouette | /images/players/213331.webp | OK |
| Moises Caicedo | 256079 | M. Caicedo (Chelsea) | no file, fell to sofifa hotlink then silhouette | /images/players/256079.webp | OK |
| Guirassy | 215441 | S. Guirassy (Dortmund) | no file, fell to sofifa hotlink then silhouette | /images/players/215441.webp | OK |
| Gyokeres | 241651 | V. Gyokeres (Arsenal) | no file, fell to sofifa hotlink then silhouette | /images/players/241651.webp | OK |
| Konate | 237678 | I. Konate (Liverpool) | no file, fell to sofifa hotlink then silhouette | /images/players/237678.webp | OK |
| Olise | 247827 | M. Olise (Bayern) | no file, fell to sofifa hotlink then silhouette | /images/players/247827.webp | OK |
| Nico Williams | 256516 | Nico Williams (Athletic) | no file, fell to sofifa hotlink then silhouette | /images/players/256516.webp | OK |
| Tijani Reijnders | 240638 | T. Reijnders (Man City) | no file, fell to sofifa hotlink then silhouette | /images/players/240638.webp | OK |
| Pacho | 256196 | W. Pacho (PSG) | no file, fell to sofifa hotlink then silhouette | /images/players/256196.webp | OK |
| Mbeumo | 243014 | B. Mbeumo (Man United) | no file, fell to sofifa hotlink then silhouette | /images/players/243014.webp | OK |
| Desire Doue | 271421 | D. Doue (PSG) | no file, fell to sofifa hotlink then silhouette | /images/players/271421.webp | OK |
| David De Gea | 193080 | De Gea (Fiorentina) | no file, fell to sofifa hotlink then silhouette | /images/players/193080.webp | OK |
| Fabian Ruiz | 226271 | Fabian Ruiz (PSG) | no file, fell to sofifa hotlink then silhouette | /images/players/226271.webp | OK |
| Heung Min Son | 200104 | H. Son (LAFC) | wrong person (TheSportsDB file) | /images/players/200104.webp | OK |
| Rodri | 231866 | Rodri (Man City) | wrong person (TheSportsDB file) | /images/players/231866.webp | OK |
| Marcus Thuram | 228093 | M. Thuram (Inter) | no file, fell to sofifa hotlink then silhouette | /images/players/228093.webp | OK |
| Gravenberch | 246104 | R. Gravenberch (Liverpool) | no file, fell to sofifa hotlink then silhouette | /images/players/246104.webp | OK |
| Sorloth | 216549 | A. Sorloth (Atletico) | no file, fell to sofifa hotlink then silhouette | /images/players/216549.webp | OK |
| Alex Baena | 257279 | Alex Baena (Atletico) | no file, fell to sofifa hotlink then silhouette | /images/players/257279.webp | OK |
| Barcola | 264652 | B. Barcola (PSG) | no file, fell to sofifa hotlink then silhouette | /images/players/264652.webp | OK |
| Pulisic | 227796 | C. Pulisic (AC Milan) | no file, fell to sofifa hotlink then silhouette | /images/players/227796.webp | OK |
| Cucurella | 239231 | Marc Cucurella (Chelsea) | no file, fell to sofifa hotlink then silhouette | /images/players/239231.webp | OK |
| Balde | 263578 | Balde (Barcelona) | wrong person (TheSportsDB file) | /images/players/263578.webp | OK |
| Micky van de Ven | 264453 | M. van de Ven (Tottenham) | no file, fell to sofifa hotlink then silhouette | /images/players/264453.webp | OK |
| Pau Cubarsi | 278046 | Pau Cubarsi (Barcelona) | no file, fell to sofifa hotlink then silhouette | /images/players/278046.webp | OK |

