# Video requirements (checked 2026-11-15)

Sources, all fetched on 2026-11-15:

- Project Submission Guide (2026): https://www.spaceappschallenge.org/resources/project-submission-guide/
- Judging and Awards Guide (2026): https://www.spaceappschallenge.org/resources/judging-awards-guide/
- Participant FAQs: https://www.spaceappschallenge.org/resources/participant-faqs/
- Rzeszów local event page: https://www.spaceappschallenge.org/2026/local-events/rzeszow/

## What the official guide says

| Topic | Rule (Project Submission Guide) | How the film meets it |
|---|---|---|
| Format | Demo is a video of "30 seconds or less" or a slide deck of up to 7 slides. | 29.93 s (898 frames at 30 fps); the build fails if ffprobe reports more than 30.0 s. |
| Limit | Projects that exceed the 30-second limit "will not be eligible for Global Judging". | Same check. Do not add an intro or outro in the hosting tool. |
| Hosting | Not uploaded to the Space Apps site. Host externally (YouTube, Google Drive, GitHub, OneDrive, Dropbox...) and give a public link with no login, permission or registration. Test it in a private window. | **Manual step for the team.** Nothing is uploaded by this pipeline. |
| Language | English. A video may be spoken in another language but must have English subtitles. | No voice-over; all on-screen text is English and burned in. |
| Content tips | 0:00 who you are and team name; 0:02 the challenge; 0:05 project title and tagline; 0:10 how it works, with NASA open data; 0:20-0:30 the outlook. These are tips, not rules. | Hook and problem 0-5 s, title at 5.4 s, features with NASA data 6.5-26 s, end card. Team name appears on the end card when `-Team` is given. |
| Minors | No images, video, audio or likeness of persons under 18. | No people appear. |
| Copyright | List all resources; copyrighted material needs permission. | Screen capture of our own app; soundtrack synthesised by `scripts/audio.mjs` (no samples, no third-party music). |
| AI ("SI") tools | Allowed. AI-generated images and videos must carry a visible watermark; AI-generated audio must be acknowledged in descriptive text and metadata. Generated content may not use NASA logos, flags or mission identifiers. | The end card carries the line "Screen capture of our web app · video edit and audio made with AI tools"; the MP4 `comment` tag says the same. No NASA logo is used. Mention the AI use in the "Use of SI" field of the submission form as well. Set `VIDEO_AI_NOTE=0` only if the team decides the line is not needed. |
| Judging | The demo counts toward "Presentation" (clear challenge, solution, significance; engaging, well structured). | See STORYBOARD.md. |
| Deadline | Global submission closes Sunday 2026-11-15 23:59 local time; local judging times are set by the Local Lead. | Team deadline from CLAUDE.md: 13:00 CET, submit by 12:30. |

## Not found

- No technical specification (resolution, codec, aspect ratio, file size) in the official guide.
- The Rzeszów local event page renders its content client-side and gave no readable text about a local
  video format, schedule or language. **Ask the Local Lead** if the local jury wants the file itself
  (USB or link) in addition to the public link.

## Defaults used where the guide is silent

1920x1080, 16:9, 30 fps, H.264 High (yuv420p, BT.709) + AAC 192 kbit/s stereo 48 kHz in MP4 with
faststart; loudness -16 LUFS integrated; burned-in English captions; a 1280x720 copy for slow links.

## Wording rules (project CLAUDE.md and CRITICAL.md)

- Only "Sun visible" and "Earth in view". No claims about power, energy, signal or link.
- "Artemis candidate region", not "Artemis III" (CRITICAL C-003).
- No number is typed by hand: 6.8 % / 94.0 %, the slip sentence and the 43/43 check count are read from
  the running app and `data/validation.json` at capture time.
- All sites shown use real data (no `Synthetic data` badge appears). The Sunlight map is labelled
  "Approximate", as in the app.
