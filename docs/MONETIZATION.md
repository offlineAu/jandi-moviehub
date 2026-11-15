# Monetization pilot

The site is prepared for one direct home-page sponsorship and an optional support link. Both are
disabled by default. No ad network, billing integration, affiliate program, tracking script, or
payment processor is installed. Playback and room screens do not contain the sponsor card.

## Before accepting money

1. Inventory the playback providers enabled in the deployed environment. For each, retain evidence
   of authorization, territories, commercial and embedding permissions, expiry, and a contact for
   rights notices. Resolve unverified permissions before selling sponsorship or soliciting support.
   Review third-party player redirects and ads as well as the media itself.
2. Describe the complete site and its playback sources to the host, sponsor, and payment provider;
   confirm their eligibility requirements and retain their responses. A clean ad placement alone
   does not establish eligibility. Review the applicable privacy, tax, consumer, and local legal
   requirements with a qualified adviser where needed.
3. If using TMDB, obtain confirmation of the applicable commercial license and attribution. TMDB
   distinguishes its non-commercial API from revenue-oriented projects:
   https://developer.themoviedb.org/docs/faq.
4. Agree in writing on the sponsor, creative, destination, dates, price, reporting, cancellation,
   and refunds. Inspect the destination and confirm that support contributions are voluntary and
   processed by a provider that has accepted the actual business.

Do not launch hidden ads, background impressions, pop-ups, autoplay audio, player overlays, or ads
near playback controls. Google prohibits background/out-of-context ads and warns against accidental
clicks near controls: https://support.google.com/adsense/answer/10502938 and
https://support.google.com/adsense/answer/1346295. These checks reduce risk but cannot guarantee
provider approval or prevent account enforcement.

## Configure a campaign

Set the `SPONSOR_*` variables documented in `apps/web/.env.example` on the web deployment. Enable
only after completing the checks above. Name, message, HTTPS destination and both explicit UTC
timestamps are required. `SPONSOR_ENABLED=true` is required; invalid or incomplete configuration
renders nothing. The card is labeled Sponsored and its outbound link is marked sponsored.

Example timestamps: `2026-12-01T00:00:00Z` to `2026-12-08T00:00:00Z` (end exclusive). The browser
checks the campaign window after hydration and at least every 30 seconds while active. The campaign
uses the viewer's clock, so do not use it to enforce a precise billable impression guarantee.

To stop a campaign, set `SPONSOR_ENABLED=false`, rebuild/redeploy the web app, and purge any CDN or
page caches. The home page uses incremental static regeneration; environment changes are not an
instant kill switch, and previously loaded tabs may keep the old campaign until reload or expiry.
For an urgent removal, also block access at the hosting/CDN layer as appropriate. Check the live
home page after deployment, in a fresh browser and on mobile. No campaign values are secrets.

Set `SUPPORT_ENABLED=true` and `SUPPORT_URL` to an approved HTTPS hosted contribution page to show
the optional footer link. Disabling it likewise requires deployment and cache invalidation. The
external page must accurately explain the contribution and its payment/refund terms.

### Set up a Philippine support link

Maya Business is one option for a reusable hosted payment link. Its documentation says the
merchant can activate Checkout and Invoicing in Business Manager to obtain a link, and that a
customer can enter an amount when none is included in the link. Confirm with Maya that voluntary
support and this site's actual business and playback sources are permitted before using it. See
https://developers.maya.ph/docs/payment-links. PayMongo also offers hosted payment links:
https://www.paymongo.com/en-ph/products/accept-payments/payment-links. Confirm whether the chosen
link is reusable, supports voluntary contributions, and which payment methods are enabled; do not
assume that every payment method is approved automatically.

Once a provider has approved the business and supplied a public payment link:

1. Set `SUPPORT_ENABLED=true` and `SUPPORT_URL=https://<your-provider-link>` in the web deployment's
   environment. Substitute the exact public URL; do not put API keys, passwords, or bank details in
   the URL. These values are delivered to visitors, so they are not secrets.
2. Redeploy the web application and invalidate page/CDN caches. Open the site in a fresh browser,
   find **Support Jandi** in the footer, and verify that it opens the correct merchant's page.
3. Use the provider's test mode or test instructions to check the payment flow; verify successful
   payment and settlement in the provider dashboard before announcing it. The app does not receive
   payment status, issue receipts, or report revenue; the provider handles those functions.

PayMongo publishes onboarding requirements including visible contact details and policy pages:
https://docs.paymongo.com/docs/account-settings-website-guidelines. These details must reflect the
real operator and actual policies; do not publish placeholder legal or contact information.

## Measurement and pilot

- The existing admin analytics show signups, rooms, chat messages, and watch-history updates. They
  are not unique visitors, page views, geographic breakdowns, sponsor impressions, or revenue.
- Before pricing a placement, use the hosting provider's aggregate traffic analytics or a vetted
  privacy-conscious analytics service, subject to its terms and the site's privacy obligations.
  Confirm monthly visitors, country distribution, and home-page views. This repository does not yet
  collect sponsor views or clicks; do not promise or report these numbers from the existing charts.
- Compare retention, room activity, hosting costs, and revenue before and during a fixed-term pilot.
  Record sponsor payments, fees, refunds, and costs outside the application. Stop if destinations,
  viewer experience, eligibility, or provider policies become problematic.
- Affiliate offers and premium watch-party extras are later experiments: confirm program eligibility,
  disclose commissions beside recommendations, and validate demand before adding billing. Display
  advertising requires a separate policy, consent, eligibility, and user-experience review.
