# Penjelasan Game Mr. Boom

Dokumen ini merangkum cara bermain, kontrol, daftar level, power‑up, variasi bom/ledakan, serta mekanik penting lain berdasarkan kode sumber pada folder `www/js` (web) dan referensi paralel di proyek UWP.

## Ringkasan

- Arena tile 19×13 dengan dinding permanen, dinding rapuh, ruang kosong, dan ubin khusus (karet/Rubber).
- Tujuan: bertahan hidup dan kalahkan pemain/monster lain menggunakan bom dan power‑up.
- Timer level berjalan mundur. Saat tersisa ±30 detik, “apocalypse” menutup arena secara bertahap hingga game berakhir.

## Kontrol

Keyboard (dua pemain di PC):

- Player 1: W/A/S/D untuk gerak; Left Ctrl untuk taruh bom; Left Alt untuk detonasi jarak jauh (jika punya Remote Control).
- Player 2: Panah untuk gerak; Right Ctrl untuk taruh bom; Right Alt untuk detonasi jarak jauh (jika punya Remote Control).
- Mulai permainan: Enter (atau LT+RT di gamepad saat di menu awal). Pemain bergabung dengan menekan tombol bom di layar “PUSH FIRE!!”.
- Pause: P (hanya saat in‑game dan bukan mode demo).

Gamepad:

- Gerak: D‑Pad. Taruh bom: tombol B. Detonasi RC: tombol A.

Catatan: Tombol kontrol ditangani melalui KeyboardController/GamepadController di `www/js/main.js`.

## Level/Map

- Jumlah level: 8 (lihat `www/js/map.js`, array `maps`).
- Variasi: tata letak dinding, jumlah/tipe monster, distribusi power‑up, lama waktu (30–120 detik), dan pola “apocalypse” (`fin`) berbeda per level.
- Level 8 (indeks 7) adalah mode khusus: pemain mulai dengan radius ledakan 8 dan kapasitas 8 bom sekaligus.

Durasi per level (time):

- 120, 120, 90, 60, 120, 90, 120, 30 detik (sebelum fase “apocalypse” 30 detik terakhir yang menutup arena).

## Power‑up

Tipe power‑up (konstan `PowerUpType`):

1. Extra Fire — Menambah radius ledakan (maxBoom) pemain.
2. Extra Bomb — Menambah kapasitas bom bersamaan (maxBombsCount).
3. Remote Control — Mengaktifkan detonasi jarak jauh untuk bom yang diletakkan berikutnya. Mengambil Remote Control lagi akan memicu power‑up tersebut hangus (tile berubah jadi api sebentar) tanpa efek tambahan.
4. Roller Skate — Meningkatkan kecepatan gerak (menjadi 2). Mengambil lagi: hangus.
5. Kick — Menendang bom: saat mendorong ke arah bom, bom akan meluncur lurus; pada ubin karet (Rubber) bom dapat memantul.
6. Shield — Perlindungan sementara (±10 detik, 600 tick) dengan efek berkedip; mencegah kematian sekali periode.
7. Life — Menambah stok nyawa pemain.
8. Clock — Menambah waktu level (+60 detik).
9. Banana — Meledakkan semua bom yang ada di arena saat itu.
10. Skull — Efek negatif acak (AutoBomb, BombsDisable, Reverse, Fast, Slow). Dicatat di proyek UWP; tidak muncul di daftar power‑up default web.
11. MultiBomb — Kemampuan multi‑bom (fitur di UWP/AI). Tidak dipakai di daftar power‑up default web.

Catatan tambahan:

- Mengambil power‑up yang sama untuk kedua kalinya pada beberapa jenis (mis. Remote Control, Roller Skate, Kick bila sudah punya) akan menghanguskan item (tile menjadi api sesaat) ketimbang menumpuk efek.
- Beberapa level memberi bonus awal (mis. Kick) ke semua pemain.

## Bom dan Ledakan (variasi dan aturan)

Dasar:

- Bom standar memiliki fuse sekitar 210 tick (~3,5 detik pada 60 FPS).
- Ledakan berbentuk salib (plus) dari pusat bom, menjalar secara horizontal dan vertikal hingga radius pemain (maxBoom).
- Ledakan berhenti bila mengenai dinding permanen; menghancurkan dinding rapuh dan berpeluang menampakkan power‑up di tile tersebut.
- Ledakan memicu bom lain (chain reaction).

Variasi/penentu ledakan:

- Extra Fire — memperbesar radius (maxBoom) pemain.
- Extra Bomb/MultiBomb — meningkatkan jumlah bom yang bisa aktif bersamaan (web: Extra Bomb; MultiBomb digunakan di UWP/AI; level 8 memaksa 8 bom).
- Remote Control — jika aktif, pemain dapat menekan tombol RC untuk meledakkan bom miliknya kapan saja (bom dengan properti rcAllowed).
- Kick — bom yang ditendang meluncur lurus (tiap tick bergeser per grid). Jika bertemu ubin Rubber, kecepatan sumbu dibalik (memantul). Jika terhalang non‑Rubber, bom berhenti.
- Ubin Rubber — selain memantulkan bom berjalan, ledakan tetap dapat melalapnya seperti tile lain yang tidak permanen.

Detail visual: pusat, batang horizontal/vertikal, dan “end‑cap” (ujung) ledakan memakai sprite berbeda sehingga arah ledakan terlihat jelas.

## Mekanik Penting Lainnya

Apocalypse (penutup arena):

- Saat sisa waktu < 30 detik, fase apocalypse dimulai. Pola `fin` menentukan urutan tile yang menjadi “apocalypse” (tile mematikan yang menghapus apapun di atasnya). Angka `255` di pola digunakan untuk menyapu dinding rapuh sebelum gelombang berikutnya. Pada akhir pola, seluruh area yang tersisa akan ditutup.
- Beberapa level menambahkan bahaya ekstra di fase ini (contoh: level ke‑7/indeks 6 sesekali menjatuhkan bom acak saat apocalypse berlangsung).

Jenis tile:

- PermanentWall: tidak dapat dihancurkan.
- TemporaryWall: bisa dihancurkan oleh ledakan; dapat menyembunyikan power‑up.
- Free: ruang kosong/walkable.
- Bomb: tile bom (memiliki offset dan kecepatan bila ditendang/kick).
- PowerUp/PowerUpFire: tile berisi item atau api singkat dari item yang dihanguskan.
- Apocalypse: tile mematikan saat fase penutupan.
- Rubber: ubin karet untuk efek pantulan bom.

Monster:

- Setiap level mendefinisikan daftar monster (tipe 0–5) beserta kecepatan, jeda belok, jumlah nyawa, dan penundaan muncul. Monster ikut tersortir rendering‑nya seperti pemain. Beberapa implementasi (UWP) dapat menjatuhkan Life saat mati.

Kondisi akhir ronde:

- Menang: hanya tersisa satu pemain hidup sebelum waktu habis — pemain tersebut menang, lalu masuk layar hasil.
- Seri: waktu habis dengan lebih dari satu pemain hidup.

Audio/Waktu:

- Efek suara peristiwa (posebomb, ledakan, ambil item, detik‑detik akhir, dsb.). Musik dan latar berubah sesuai state. Di sisa < 40 detik akan diputar cue akhir.

Mode Demo dan Mulai:

- Saat demo, input start akan menonaktifkan demo dan membuka menu start. Pemain memilih slot dengan menekan tombol bom untuk join. Menekan Enter (atau LT+RT) memulai.

Sumber kebenaran: `www/js/main.js` (loop, input, pemain, bom/ledakan, apocalypse), `www/js/map.js` (8 level dengan power‑up/monster/waktu/pola fin). Beberapa fitur tambahan (Skull, MultiBomb detail) dapat dilihat pada implementasi UWP (`UWP/MrBoom/*.cs`).
