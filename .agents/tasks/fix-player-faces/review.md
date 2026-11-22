# Review: fix-player-faces

Verdict: APPROVED. No blockers.

Evidence (read only, nothing re-run; commit 11f1eb9 records `node tests/player-faces.mjs` ok (206), typecheck pass, next build pass):
- Root cause is supported. FC26 ids are the sofifa ids, so the resolver already finds /images/players/{id}.webp first. The 27 "no face" players had no file because only the 331 default-pool files existed, and the CSV hotlink falls back to the silhouette. The 5 "wrong face" players had TheSportsDB name-search files. Resolver code (src) is untouched by the commit.
- Images are keyed by FC26 id from the CSV player_face_url (id-based, no name search). frontend/scripts/download-fc26-faces.mjs sends the sofifa Referer and a User-Agent. It makes 3 retries and waits 300 ms between requests. Outputs are 240x240 webp. The largest file in the folder is 427 KB (pre-existing); new files are about 4-7 KB.
- Spot-check of 202126 (Kane), 231866 (Rodri) and 278046 (Cubarsi): each shows the right person. The id-to-name mapping is enforced by the reported map in tests/player-faces.mjs. All 32 listed ids are covered, none is missing, and none has an external reason.
- tests/player-faces.mjs fails when an FC26 id is absent from the CSVs, its name does not match, its file is missing, or its file hash equals the default silhouette.
- Hero and external images and the backend are untouched. image-map.json is updated.

Non-blocking observation: 112 non-listed default-pool files whose ids are also FC26 players were overwritten with 240px sofifa faces of the same id. They show the same person at lower resolution (about 5 KB, previously 73-352 KB). This is not a wrong person and not a resolver change, so it is not a blocker.
