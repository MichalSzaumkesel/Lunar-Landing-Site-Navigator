# Demo Script and 30-Second Video (Scope B)

Data-driven demonstration guide for the jury presentation and video recording.

Every number must be read directly from the screen during the demo, never recalled from memory or typed. The application labels synthetic datasets with a visible `Synthetic data` badge; acknowledge this openly during the presentation. Permissible terminology: "Sun visible", "Sun below horizon", "Earth in view", "Earth below horizon". Never make unsupported claims regarding electrical power generation, battery energy, or radio link availability.

## Pre-Demo Checklist

Complete these verification steps before presenting to the jury or recording video:

- [ ] **Browser Full Screen**: Press `F11` to hide browser chrome, tabs, and operating system taskbars.
- [ ] **Display Zoom**: Set browser zoom to **90%** (`Ctrl -` or `Cmd -`) so all scenario cards and wide timeline matrices fit without horizontal clipping on standard 1080p projectors.
- [ ] **URL Tour Flag**: Open the application with `/?tour=0` (or `/?tour=0&mode=advanced`) so that the guided tutorial does not auto-open over your opening slide.
- [ ] **Audio Sound Off**: Ensure audio cues are muted (`Sound off` in the Tools bar; sound is disabled by default).
- [ ] **Data Pre-Loaded**: Ensure the three demo sites (`apollo_11`, `southpole_landed`, `artemis_region_1` from [../web/public/data/mock/sites.json](../web/public/data/mock/sites.json)) have loaded into memory.
- [ ] **Offline Resilience Test**: Disconnect network or toggle DevTools Offline mode to verify the app operates smoothly without active internet connection.
- [ ] **Backup Tab**: Keep a second browser tab pre-opened in **Simple mode** (`/?mode=simple&tour=0`) as a ready fallback.

---

## Live Demo for the Jury (2 Minutes)

*Spoken in Polish, screen interface in English.*

| Time | Interface Action | Co mówisz (przykład linii mówionej) |
|---|---|---|
| **0:00 - 0:15** | Otwórz aplikację na domyślnym scenariuszu bieguna południowego (`southpole_landed`). Wskaż pasek górny: przycisk **Tutorial (?)**, przycisk **Demo**, przełącznik trybów **Simple / Advanced** oraz wykres nieba (Polar Sky Plot). | "Misje księżycowe zależą od dostępu do światła i widoczności Ziemi. Nasze narzędzie odpowiada w ułamku sekundy na fundamentalne pytania: kiedy Słońce i Ziemia są widoczne z wybranego lądowiska i jak ukształtowanie terenu wpływa na okna misji." |
| **0:15 - 0:35** | Kliknij preset **Apollo 11 vs Artemis candidate region** w pasku presetów. Pokaż dwie karty porównawcze obok siebie: równik i biegun południowy. Wskaż odznaki `Synthetic data`. | "Jedno kliknięcie zestawia dwa skrajne punkty: równik oraz biegun południowy w tym samym oknie czasowym. Odczytujemy bezpośrednio z ekranu: na równiku Słońce wznosi się wysoko, a na biegunie ślizga tuż nad krawędziami kraterów. Widzimy dokładny procent czasu oświetlenia i łączności: [odczytaj na żywo z kart wartości 'Sun visible' i 'Earth in view']." |
| **0:35 - 0:55** | Wciśnij **Spację** (Play). Obserwuj kartę bieguna. Rozwiń przycisk **Loupe** pod wykresem biegunowym. Wskaż **Mission Bar** na osi czasu. | "Włączamy odtwarzanie. Gdy wzgórze zasłania Słońce, stan natychmiast zmienia się z 'Sun visible' na 'Sun below horizon'. Lupa słoneczna oblicza precyzyjny ułamek odsłoniętej tarczy. Poniżej, na osi czasu, pasek misji w czasie rzeczywistym weryfikuje reguły lądowania: zielony oznacza spełnienie warunków, a czerwony wskazuje naruszoną regułę." |
| **0:55 - 1:15** | Przełącz kartę bieguna na widok **3D** (Surface View). Kliknij przycisk **Find sunniest spot**. | "Przełączamy na trójwymiarowy model terenu w Three.js z dynamicznym rzucaniem cieni liczonym na żywo. Klikamy 'Find sunniest spot': algorytm w tle przeszukuje lokalny obszar i odnajduje punkt o najdłuższej ekspozycji na Słońce, pokazując natychmiast różnicę w godzinach oświetlenia względem pozycji nominalnej." |
| **1:15 - 1:30** | Przesuń suwak **Slip** na karcie bieguna o +14 dni (lub użyj presetu 14-day slip). | "Co jeśli data startu opóźni się o dwa tygodnie? Przesuwamy suwak Slip: odliczania do wschodu i zachodu, statystyki oraz stan paska misji przeliczają się natychmiast w przeglądarce, bez odpytywania serwera." |
| **1:30 - 1:45** | Otwórz zakładkę **Window map** na dolnym panelu. Zmień parametr w formularzu Mission Rules (np. czas trwania misji). | "W zakładce Window map analizujemy pełną matrycę dopuszczalnych okien misji dla wielu lądowisk jednocześnie. Zmiana założeń misji natychmiast aktualizuje wykres zdatności startowej." |
| **1:45 - 2:00** | Przełącz na **Simple mode** w prawym górnym rogu. Kliknij **Copy link** (ikona udostępniania). Zakończenie. | "Dla edukacji i odbiorców nietechnicznych stworzyliśmy tryb Simple z podsumowaniami w prostym języku. Każdy stan analizy można udostępnić bezpośrednim linkiem. Dbamy o rzetelność: dane testowe są wyraźnie oznaczone odznaką 'Synthetic data', a aplikacja mówi 'Sun visible' i 'Earth in view', bez nieuprawnionych obietnic o mocy czy łączności." |

---

## 30-Second Video Storyboard

Ten harmonogram odpowiada zautomatyzowanemu skryptowi wideo wbudowanemu w aplikację (przycisk **Video 30 s** oraz funkcja **Record video** w pasku narracji demo). 

Nagrywanie można wykonać bezpośrednio w przeglądarce w rozdzielczości 1920×1080 bez zewnętrznych narzędzi do przechwytywania ekranu (kliknięcie `Record video` pobiera gotowy plik WebM).

| Czas (s) | Ujęcie / Akcja w aplikacji | Napis na ekranie (automatyczny caption) | Narracja lektorska |
|---|---|---|---|
| **0:00 - 0:06** (6 s) | Załadowanie presetu Apollo 11 vs Artemis candidate region. Dwie karty porównawcze obok siebie. | `Comparing [MOCK] Equatorial site and [MOCK] Artemis III candidate region under identical dates. (demo data)` | "Dwa miejsca na Księżycu. Jedno kluczowe pytanie: ile Słońca i widoczności Ziemi?" |
| **0:06 - 0:13** (7 s) | Płynne przejście do widoku terenu 3D z automatyczną panoramą kamery i odtwarzaniem osi czasu. Cienie wydłużają się wraz z ruchem Słońca. | `Sun and Earth over the local horizon (demo data)` | "Ukształtowanie terenu i dynamiczne cienie liczone w czasie rzeczywistym w przeglądarce." |
| **0:13 - 0:19** (6 s) | Oś czasu dochodzi do momentu zachodu Słońca za krawędź krateru; lupa słoneczna pokazuje obcięcie tarczy, a licznik odlicza czas do wschodu. | `[Site name]: Sun sets in [X h Y m]. (demo data)` | "Precyzyjne odliczanie do wschodu i zachodu z uwzględnieniem rozmiaru kątowego tarczy." |
| **0:19 - 0:25** (6 s) | Przesunięcie suwaka Slip o 14 dni; wskaźnik Mission Bar na osi czasu natychmiast aktualizuje status reguł; otwarcie mapy okien (Window map). | `Mission slips? Recompute in seconds. (demo data)` | "Przesunięcie terminu startu? Przeliczenie okien lądowania w ułamku sekundy." |
| **0:25 - 0:30** (5 s) | Szerokie ujęcie całego interfejsu aplikacji i plansza końcowa projektu. | `Lunar Landing Site Navigator — NASA Space Apps 2026 (demo data)` | "Lunar Landing Site Navigator — NASA Space Apps Challenge 2026." |

---

## Fallbacks if Something Fails

Przygotowane procedury awaryjne na wypadek problemów technicznych podczas prezentacji przed jury:

- **Problem z WebGL / awaria karty graficznej / lag rzutnika**:
  - *Działanie*: Natychmiast pozostań na widokach **Polar** (wykres biegunowy) i **Panorama**.
  - *Dlaczego*: Widoki te opierają się wyłącznie na lekkim D3 (SVG) i standardowym 2D Canvas — działają płynnie na dowolnym procesorze i projektorze bez akceleracji 3D.
- **Brak połączenia z siecią (awaria Wi-Fi na sali)**:
  - *Działanie*: Aplikacja jest całkowicie statyczna i prefetchuje dane demonstracyjne przy pierwszym załadowaniu (`prefetchDemoSites()`). Działa w 100% offline po wcześniejszym otwarciu.
- **Niska rozdzielczość rzutnika lub mały ekran (poniżej 1080p)**:
  - *Działanie*: Zmniejsz powiększenie w przeglądarce do **80% - 90%** (`Ctrl -`). Poniżej 900 px interfejs automatycznie przełącza się w responsywny układ jednokolumnowy, a klawisze strzałek i Spacja zachowują pełną funkcjonalność.
- **Nieoczekiwany stan interfejsu lub przypadkowe kliknięcie**:
  - *Działanie*: Odśwież stronę skrótem `Ctrl+F5` z parametrem `/?tour=0`. Cały stan scenariusza jest zakodowany w adresie URL, więc odświeżenie natychmiast przywraca spójny stan.
- **Brak czasu / konieczność skrócenia prezentacji do 45 sekund**:
  - *Działanie*: Kliknij przycisk **Demo** w prawym górnym rogu TopBar. Automatyczna narracja w pasku `DemoCaption` przeprowadzi prezentację krok po kroku zsynchronizowaną z kamerą i osią czasu.

---

## Likely Questions and Defensible Answers

Odpowiedzi oparte na specyfikacji naukowej i kontrakcie danych ([contract.md](contract.md)):

1. **Jak wyznaczany jest horyzont terenu?**
   - *Odpowiedź*: Wyznaczany jest metodą śledzenia promieni (raycasting) na cyfrowych modelach wysokościowych NASA LOLA (Lunar Orbiter Laser Altimeter), z pełnym uwzględnieniem kulistości Księżyca oraz wysokości masztu obserwatora (2 m lub 10 m).
2. **Czy Słońce jest traktowane jako punkt nieskończenie mały?**
   - *Odpowiedź*: Nie. Algorytm uwzględnia rzeczywisty promień kątowy Słońca (ok. 0.26°). Widok lupy (Loupe) analitycznie wylicza pole wycinka koła tarczy słonecznej zasłanianego przez grań terenu, raportując odsłoniętą powierzchnię tarczy od 0% do 100%.
3. **Czy aplikacja gwarantuje wystarczającą moc paneli lub łączność radiową?**
   - *Odpowiedź*: Nie i celowo takich obietnic nie składamy. Narzędzie modeluje wyłącznie geometryczną widoczność w linii wzroku ("Sun visible", "Earth in view"). Rzeczywisty bilans energetyczny i łączności zależy od orientacji paneli, sprawności ogniw w niskich temperaturach, charakterystyki anten lądownika oraz zapasu łącza telekomunikacyjnego.
4. **Skąd pochodzą pozycje ciał niebieskich?**
   - *Odpowiedź*: Ephemerydy Słońca i Ziemi generowane są w Scope A na podstawie bazy JPL Horizons w selenocentrycznym układzie współrzędnych ze stałym krokiem 1 godziny w standardzie UTC.
