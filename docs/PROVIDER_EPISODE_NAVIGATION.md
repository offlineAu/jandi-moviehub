# Provider episode numbering

Money Heist's series and solo watch pages now use the selected provider's parts,
episode list, and episode IDs. KissKH remains the default. MovieBox's parts come
from its title resource metadata via `GET /moviebox/episodes?tvId=71446`; KissKH's
parts and episodes come from its search and detail endpoints.

A source watch link explicitly includes `provider=moviebox|kisskh` and
`numbering=provider`. The path's season/episode values then identify the provider
part/episode. MovieBox playback receives `numbering=provider`, validates those
coordinates against its live resource metadata, and bypasses the old TMDB mapping.
Previous and next links walk the provider list, including part boundaries. A
legacy catalog watch link opens the provider picker without silently interpreting
its numbers as a different episode. Switching providers resets the selection.

Artwork is retained from TMDB. Parts 3 and 4 map to TMDB Season 2, and Part 5
maps to Season 3, for episode stills. Parts 1 and 2 were recut; these use series
backdrop/poster thumbnails rather than claiming an exact original-cut match.
The provider episode list and solo playback continue working when optional
artwork metadata fails. No TMDB runtime is presented as the source video's runtime.

Watch Together can select all listed MovieBox parts, including the first two.
New room references use `moviebox-source:71446:<part>:<episode>` and persist
`numbering: "provider"` in the existing playback-state JSON field. Existing
`moviebox:71446:<season>:<episode>` references retain catalog interpretation. No
new database migration is required for this change.

Validation: 249 unit/component tests passed (142 API, 86 frontend, 21 shared),
full lint and typechecks passed, and the API compiled. Tests cover provider
counts, direct coordinates, invalid provider episodes, navigation across parts,
KissKH IDs, thumbnail matching/fallback, and room reference compatibility.
Live production playback and upstream access were not verified in this sandbox.
The reported KissKH HTTP 451 and MovieBox connection timeout remain provider
availability failures; numbering changes do not establish successful access.
