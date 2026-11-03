# Streaming provider matrix

| Provider               | Responsibility                                         | Current status                                                       | Live verification                                                       |
| ---------------------- | ------------------------------------------------------ | -------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Local authorized media | Playback: MP4, WebM, HLS                               | Existing approved assets and signed URLs                             | Big Buck Bunny previously played locally; full acceptance suite pending |
| TMDB                   | Movie and TV metadata                                  | Movie adapter and TV search/details/seasons implemented              | No configured credentials; responses tested with mocks                  |
| Watchmode              | Regional availability and destination links, not video | TV availability adapter and UI implemented; movie endpoint available | No credentials; responses tested with mocks                             |
| JustWatch              | Partner availability                                   | Not implemented                                                      | Partner agreement and credentials unavailable                           |
| YouTube                | Official embeds                                        | Existing trailer links; full player integration pending              | Not verified                                                            |
| Internet Archive       | Candidate metadata and authorized media                | Not implemented                                                      | Exact rights must be independently verified                             |
| Cloudflare Stream      | Authorized hosted playback                             | Not implemented                                                      | Credentials and account unavailable                                     |
| Mux                    | Authorized hosted playback                             | Not implemented                                                      | Credentials and account unavailable                                     |
| Direct URLs            | Authorized external playback                           | Not implemented                                                      | SSRF, rights, expiration and region controls needed                     |

Sources: https://developer.themoviedb.org/reference/search-tv ; https://api.watchmode.com/openapi.json ; https://api.watchmode.com/use-cases/app-deep-links ; https://help.netflix.com/en/node/4976 .
