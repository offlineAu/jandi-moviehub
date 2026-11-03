# Creator-hosted films

Jandi's `/open-films` page retrieves metadata for five individually reviewed short films from
Blender Video and the feature film Sita Sings the Blues from Internet Archive. It embeds their
players and does not upload, download, or mirror videos. The list is limited to reviewed items,
not every search match or every TMDB title. Attribution and license links appear on the page.

- Sintel: https://durian.blender.org/sharing/ and https://video.blender.org/videos/watch/0eb052d0-fd51-43e6-aa33-ecdbf77a5d40
- Big Buck Bunny: https://peach.blender.org/about/ and https://video.blender.org/videos/watch/bf1f3fb5-b119-4f9f-9930-8e20e892b898

The API validates the exact video ID, creator channel, host and public status; only fixed Blender
URLs are requested, and errors are not presented as playable media. The host controls playback,
availability and its own privacy notice. The embedded player is not integrated with synchronized
rooms or watch history. Further films and hosts require source-specific rights review and testing.

Verification: 2026-11-01, the live endpoint returned both titles. In a local headless Chromium
session Sintel's actual Blender iframe loaded and its video advanced to 5.1 seconds with readyState
4 and no media error. This is not a full-duration or multi-client test. Two provider unit tests,
repository typecheck and lint passed.

## Catalog expansion — 2026-11-01

Added the creator-hosted complete shorts Elephants Dream, Tears of Steel and Cosmos Laundromat,
with film-specific attribution and source evidence: https://orange.blender.org/page/2/,
https://mango.blender.org/about/, https://gooseberry.blender.org/about/. Elephants Dream is
CC BY 2.5; the other two are CC BY 3.0. Search now includes creator-hosted matches. If individual
host responses fail, the remaining verified titles stay visible and the page reports a partial
result. The live endpoint returned all five; a headless browser found Tears of Steel via normal
search and played the actual host video to 5.1 seconds (readyState 4, no media error). This is not
a full-duration or watch-party test. Three targeted unit tests, typecheck, lint and formatting
passed. The source pool still contains five short films, not all films in the TMDB catalog.

## Internet Archive expansion — 2026-11-01

Added the exact Internet Archive item linked from filmmaker Nina Paley's official watch page:
https://www.sitasingstheblues.com/watch.html and
https://archive.org/details/Sita_Sings_the_Blues. The filmmaker's
https://www.sitasingstheblues.com/license.html explains that some songs have separate restrictions
and may be heard in the original film. Do not assume that every Archive upload is authorized.
The adapter verifies the fixed item's identifier, title, creator, media type and expected file;
it never accepts a user-supplied host or film ID. Providers fail independently.

Live API metadata returned the feature film, and a Chromium session loaded the actual Archive
iframe containing a video element. Playback did not start during the automated attempt, so real
playback and completion remain unverified. The Archive player is not synchronized with rooms or
watch history. Six provider tests, typecheck, lint and production build passed. Provider tests
use fixtures; the live API and browser observations are separate from those tests.

## YouTube source — 2026-11-01

Added the exact full-length Sita Sings the Blues YouTube video embedded on the filmmaker's
https://www.sitasingstheblues.com/watch.html. YouTube's public oEmbed endpoint is queried for
that fixed video and validates its title and uploader before presenting the YouTube player. Its
oEmbed response does not report duration, which is therefore omitted rather than guessed. The
filmmaker's license page documents separate restrictions on some soundtrack songs. This integration
does not upload, extract, or mirror the video, and an embeddable metadata response is not proof
that playback will work in every region or browser.

The live API returned the YouTube source, and headless Chromium loaded the YouTube iframe from
Jandi. The video did not start in the automated attempt (currentTime 0, readyState 0); actual
playback remains unverified. The temporary API used for this check was separate from the user's
already-running API, which needs a restart to pick up the new provider. Eight targeted provider
tests, typecheck, lint and production build passed. The embedded player is not connected to watch
parties or watch history.

## FilmRise full movie — 2026-11-02

Added FilmRise Movies' exact YouTube upload `Ekfn-RVo8XI`, identified by live oEmbed as
`Mortuary | Full Movie`. FilmRise identifies itself as a film and television distributor:
https://www.filmrise.com/about-us. No video files are uploaded or extracted. Individual YouTube
videos are verified against their expected title and channel and partial outages do not hide others.

In headless Chromium, the real embedded YouTube video was inserted into the local Jandi page and
advanced to 10.94 seconds (readyState 4) with muted autoplay. A separate public IP geolocation
lookup reported the connection country as PH; this is an approximate network-location check, not
proof of playback from every Philippines ISP or an end-to-end user test. The live provider returned
the FilmRise entry. Playback to completion, audio, user-operated controls, Jandi navigation, and
watch-party synchronization were not verified. Provider availability can change. Nine targeted
provider tests, typecheck and lint passed. Restart a previously running API to load this source.
