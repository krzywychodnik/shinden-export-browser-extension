# Shinden to MAL Exporter

Wtyczka do przeglądarki (Chrome / Edge / Brave / Opera – Manifest V3), która eksportuje całą listę anime (wszystkie statusy, oceny oraz obejrzane odcinki) z `lista.shinden.pl` do pliku **XML** gotowego do importu na **MyAnimeList** (`myanimelist.net/import.php`).

## Funkcje
* Pobiera wszystkie statusy listy (`Watching`, `Completed`, `On-Hold`, `Dropped`, `Plan to Watch`) wraz z ocenami i liczbą obejrzanych odcinków.
* Automatycznie dopasowuje tytuły z Shindena do `MAL ID` (AniList GraphQL API + Jikan API v4 jako fallback) i zapisuje dopasowania w lokalnym cache.
* Pozwala podejrzeć niedopasowane lub niepewne pozycje i ręcznie wpisać `MAL ID` przed eksportem.
* Generuje czysty plik `.xml` zgodny z importerem MyAnimeList.

## Instalacja (z GitHub Releases)

1. Przejdź do zakładki **[Releases](../../releases/latest)** po prawej stronie repozytorium i pobierz plik `.zip` (np. `shinden-to-mal-exporter-v0.1.0.zip`).
2. Rozpakuj pobrane archiwum do wybranego folderu na dysku (tak, aby w środku znajdował się plik `manifest.json`).
3. Otwórz w przeglądarce stronę zarządzania rozszerzeniami:
   * **Chrome:** `chrome://extensions`
   * **Edge:** `edge://extensions`
   * **Brave:** `brave://extensions`
   * **Opera:** `opera://extensions`
4. Włącz **Tryb dewelopera (Developer mode)** w prawym górnym rogu.
5. Kliknij **Załaduj rozpakowane (Load unpacked)** i wybierz rozpakowany folder z wtyczką.

*(Alternatywnie możesz sklonować repozytorium przez `git clone` i wskazać sklonowany folder.)*

## Jak używać

1. Wejdź na swoją listę anime na Shindenie, np. `https://lista.shinden.pl/animelist/TWOJE_ID-nazwa`.
2. Kliknij ikonę wtyczki **Shinden → MAL** na pasku przeglądarki.
3. Kliknij **1. Pobierz listę z Shindena**.
4. Kliknij **2. Dopasuj do MyAnimeList** i poczekaj na zakończenie wyszukiwania ID.
   * W razie potrzeby zaznacz *„Pokaż tylko niedopasowane / niepewne”* i uzupełnij lub popraw `MAL ID` ręcznie.
5. Kliknij **3. Pobierz plik XML**.
6. Wejdź na [myanimelist.net/import.php](https://myanimelist.net/import.php), wybierz **MyAnimeList Import**, wskaż pobrany plik `.xml` i zatwierdź import.

## Testy (dla developerów)

Wymagany Node.js (testowane na v26+):

```bash
node --test tests/*.test.js
```
