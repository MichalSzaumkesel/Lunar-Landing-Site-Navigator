# Demo Script and 30-Second Video (Scope B)

Guide for the live jury demo (2 minutes) and the 30-second video. Every number is read from the screen during the demo, never typed or recalled. Synthetic datasets carry a visible `Synthetic data` badge; mention this openly. Use only the permitted wording: "Sun visible", "Sun below horizon", "Earth in view", "Earth below horizon". Make no claims about power generation, battery energy or radio link availability.

## Pre-Demo Checklist

- [ ] **Full screen (`F11`)**: hide browser tabs and the taskbar.
- [ ] **Zoom 90% (`Ctrl -`)**: scenario cards and the timeline fit a 1080p projector without horizontal scrolling.
- [ ] **Tour off (`?tour=0`)**: open the app at `/?tour=0` so the guided tour does not cover the opening slide.
- [ ] **Sound off**: the sound control in the tools bar shows `Sound: Off` (the default).
- [ ] **Data loaded**: the demo sites `apollo_11`, `southpole_landed` and `artemis_region_1` have loaded. Check the site badges before the talk.
- [ ] **Offline test**: after the data has loaded, switch DevTools to Offline and confirm the scenario, Play and the demo sites still work in the open tab. Do not reload: there is no service worker, so a reload while offline fails. Then go back online.
- [ ] **Backup tab**: keep a second tab open at `/?m=s&tour=0` (`m=s` opens Simple mode) as a fallback.

## Live Demo for the Jury (2 Minutes)

*Narration in Polish, interface in English.*

| Time | Interface action | Narration (example) |
|---|---|---|
| **0:00 - 0:15** | App is already open full screen at `/?tour=0`. Say one sentence, then immediately click the preset **Compare: Apollo 11 (equator) vs South Pole (Artemis candidate region)** and press **Space** to play at 12 h/s. Do not open Tutorial, Sound or any empty form. | "Misje księżycowe się przesuwają, a okno światła i widoczności Ziemi decyduje, czy się zmieszczą. Jedno kliknięcie: równik kontra biegun południowy, w tym samym oknie czasowym." |
| **0:15 - 0:35** | Let the animation run. Show the two scenario cards side by side. Point to the `Synthetic data` badges if they are shown. | "Odczytujemy z kart, co się dzieje na żywo: [odczytaj wartości *Sun visible* i *Earth in view* z obu kart, tylko z okna widocznego na ekranie]." |
| **0:35 - 0:55** | Pause with **Space** if needed. Watch the polar card. Open the **Loupe** under the sky plot. Point to the **mission bar** on the timeline. | "Gdy grań terenu zasłania Słońce, stan zmienia się z *Sun visible* na *Sun below horizon*. Lupa pokazuje, jaka część tarczy jest odsłonięta. Pasek misji na osi czasu pokazuje na zielono spełnione reguły i na czerwono naruszoną regułę." |
| **0:55 - 1:15** | Switch the polar card to the **3D** surface view. Click **Find sunniest spot**. | "Widok 3D pokazuje lokalny teren z cieniami liczonymi na żywo. Wyszukiwanie w tle przeszukuje wybrany promień i pokazuje punkt o największym nasłonecznieniu oraz różnicę względem pozycji wyjściowej." |
| **1:15 - 1:30** | Click the preset **Same site, 14 days later**. Read the Sun visible values of both cards. | "Co jeśli start się opóźni o dwa tygodnie? Przeliczamy wynik w przeglądarce, bez serwera: odczytujemy *Sun visible* z obu kart." |
| **1:30 - 1:45** | Open the **Window map** tab in the lower panel. Change one value in the **Mission rules** form, for example the stay length. | "Window map pokazuje, które lądowisko i które daty spełniają założenia misji. Zmiana reguły od razu aktualizuje matrycę." |
| **1:45 - 2:00** | Switch to **Simple** mode. Click the share control to copy the link. End. | "Dla odbiorców nietechnicznych jest tryb Simple z podsumowaniami prostym językiem. Stan można udostępnić jako link. Dane syntetyczne są oznaczone, a aplikacja mówi *Sun visible* i *Earth in view*, bez obietnic o mocy czy łączności." |

## 30-Second Video Storyboard

Use the **Demo** button, then the **Video 30 s** variant, and the **Record video** control in the narration bar. It saves a WebM file (`lunar-landing-navigator-demo.webm`) from the browser tab. Record in a window sized to 1920×1080.

Captions are generated from the app's own data (the same values the cards show, in percent of the window, one decimal) and end with `(demo data)` only for synthetic sites. The narration-bar demo uses the same captions, plus a Sun visible and Earth in view comparison step. Figures in `docs/pitch.md` use a different window (2027-01, 14 days at the IM-2 site) and are not the ones shown by the default demo window (30 days from 2027-10-06); never quote one set as the other.

| Time (s) | Shot / action | Caption (generated) | Voice-over |
|---|---|---|---|
| **0:00 - 0:06** | Apollo 11 vs South Pole preset; two cards side by side. | `Comparing <site A> and <site B> under identical dates. (demo data)` | "Dwa miejsca na Księżycu. Jedno pytanie: ile Słońca i widoczności Ziemi?" |
| **0:06 - 0:13** | 3D surface view with the timeline running; shadows move with the Sun. | `Sun and Earth over the local horizon (demo data)` | "Teren i cienie liczone w przeglądarce, w czasie rzeczywistym." |
| **0:13 - 0:19** | Timeline near sunset; loupe shows the clipped disc; countdown shown. | `<site>: Sun sets in <countdown>. (demo data)` | "Odliczanie do zachodu z uwzględnieniem tarczy Słońca." |
| **0:19 - 0:25** | "Same site, 14 days later" preset; mission bar updates; Window map opened. | `Same site, 14 days later: Sun visible changes from <x> % to <y> %. (demo data)` | "Przesunięcie terminu? Przeliczenie w ułamku sekundy." |
| **0:25 - 0:30** | Wide view of the interface and the closing card. | Closing caption from the demo end card (demo data) | "Lunar Landing Site Navigator, NASA Space Apps Challenge 2026." |

## Fallbacks

- **WebGL fails or the projector lags**: stay on the **Polar** sky plot and the **Panorama** view. They use SVG and 2D canvas only.
- **No network**: the app is static. Load it once before the talk and keep that tab open; it then works offline in-session only (the demo sites are prefetched), but a reload without network fails.
- **Small or low-resolution screen (below 900 px wide)**: zoom out to 80-90%. The layout switches to one column; arrow keys and Space still work.
- **Unexpected state or misclick**: reload the page at `/?tour=0`. The scenario is kept in the URL, so reloading restores it.
- **Only 45 seconds left**: click **Demo** in the top bar. The narration bar runs the steps and moves the camera and timeline for you.

## Likely Questions and Defensible Answers

Answers rely on the data contract ([contract.md](contract.md)) and the method notes.

1. **How is the terrain horizon computed?**
   - Rays are cast over the elevation model (LOLA) with Moon curvature and the observer mast height (2 m or 10 m) included.
2. **Is the Sun treated as a point?**
   - No. The solar disc has its real angular radius. The loupe shows the visible fraction of the disc (0-100%) while a ridge clips it.
3. **Does the app guarantee enough solar power or radio link?**
   - No, and it does not claim to. It models geometric visibility only ("Sun visible", "Earth in view"). Power and link budgets depend on array orientation, cell performance at low temperature, antenna patterns and link margin.
4. **Where do the Sun and Earth positions come from?**
   - From JPL Horizons, in the Moon-fixed frame, at a fixed one-hour step in UTC, produced by the data scope.
