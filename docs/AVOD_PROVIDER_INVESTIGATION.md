# Ad-supported hosted movie providers

Updated 2026-11-01. Objective: free-to-view mainstream films playing inside Jandi via an
authorized provider, without the owner uploading movies. Status: **BLOCKED** pending a provider
that confirms applicable rights and supplies player access. No playback was tested or claimed.

## Further provider research

- **Allrites**: https://www.allrites.com/ and https://www.allrites.com/about describe a B2B
  subscription service licensing films and television to streaming platforms. Its homepage includes
  a customer's reference to embedding, but does not document a hosted player API or establish
  Philippines rights for any film. Pricing, minimum commitments and personal-site eligibility are
  unconfirmed; a subscription is not the same as free access for Jandi.
- **FilmRise/Cineverse on YouTube**: https://www.filmrise.com/about-us describes its licensed
  distribution business. Cineverse's own announcement at
  https://www.prnewswire.com/news-releases/cineverse-renews-and-expands-their-global-commercial-youtube-channel-agreement-with-va-media-301880718.html
  describes licensed YouTube channels including feature films. Specific titles still need checks
  for a verified distributor upload, embedding permission and access in the Philippines. This is
  distinct from YouTube Free Primetime Movies, which YouTube lists as available in the US,
  Australia, Japan, Germany and UK: https://support.google.com/youtube/answer/16618963?hl=en.
- **Middle Block**: https://middleblock.com/publishers/ advertises publisher access to video feeds
  and third-party player embedding. The site does not confirm feature-film inventory, Philippines
  rights, pricing, or personal-site access. Its marketplace is described as coming soon.
- **Recast**: https://recastpay.com/solutions/for-publishers advertises a publisher iframe and
  content-owner permissions, but describes a pay-per-view audience-purchase model. It does not
  establish free movie playback or Philippines catalog availability.
- **Filmhub**: https://filmhub.com/buyers advertises film licensing and delivery to buyers.
  Hosted playback, accessible catalog rights, Philippines coverage, and Jandi's eligibility remain
  unconfirmed. Its publicly available information does not establish free access.

None of these findings establish immediate playable access to a mainstream film in the Philippines.
No external requests, account registrations, contracts, or purchases were made. Third-party
unverified embed sources are not evidence of licensing and are excluded under the project policy.

## Tvigle Video Publisher: candidate, not approved

- https://tvigle.pro/en/partnerships advertises an ad-supported partner network, a free licensed
  catalog, a hosted player, and revenue sharing. Its catalog is advertised as 30,000+ videos,
  including films and series; that figure is the provider's claim, not a count verified by Jandi.
- https://tvigle.pro/en/ describes site review and delivery of account access or embed code, plus
  API integration. Partner acceptance, actual titles, content language, fees and suitability for
  a small personal project have not been confirmed.
- https://tvigle.pro/oferta section 6.7 says (in Russian) that in the absence of a specific
  provision, the license territory is the Russian Federation. Do not assume permission for the
  Philippines; obtain explicit provider confirmation and applicable written terms first.
- Appendix 2 describes provider-inserted ads and requires partners not to obstruct them. Confirm
  geographic reach, ad obligations, supported player controls, and whether watch-party syncing is
  allowed before implementation. The Russian-language offer and approval process require review;
  this document is not legal advice.
- Provider contact and demo forms are on the partner page. A request or signup may carry terms;
  none was submitted and no agreement or payment was accepted.

## Reviewable inquiry draft

Subject: Ad-supported movie player for a Philippines-based website

Hello, I am building Jandi MovieHub, a small personal website in the Philippines. I am looking for
a free-to-view, ad-supported catalog of full movies that can play inside my website using your
hosted player, without uploading the films myself.

1. Can you explicitly authorize playback in the Philippines? Your published offer appears to
   default to Russia unless otherwise specified. What written terms would apply?
2. Do you accept a small personal site without an existing public domain or established traffic?
   Are there minimum fees, view counts, business registration, ad, or other requirements?
3. Can you provide a current sample of mainstream English-language titles available in the
   Philippines, including film identifiers and licensing windows?
4. Is there a documented catalog API and hosted embed, test account, or sandbox? How are title
   IDs matched to TMDB or IMDb, and does every viewer obtain a separate authorized session?
5. Is a synchronized watch party allowed, and can the player be controlled through a documented
   API while preserving advertising and geographic restrictions?

Please share applicable partner terms, pricing, and integration documentation. Thank you.

## Implementation gate

Once the owner supplies provider confirmation and credentials, verify the approved domain and
Philippines rights, map exact identifiers, implement only the documented playback flow, and test
actual feature-film playback including ads. Keep any provider secrets server-side and never
broadcast session URLs to watch-party members. Only label a title playable after verifying its
eligibility; if access or regional rights cannot be confirmed, report it unavailable.
