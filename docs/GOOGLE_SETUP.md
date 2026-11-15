# Google sign-in and AdSense

## Google sign-in

Google sign-in uses the existing server-side OAuth authorization-code flow. It is hidden unless both
Google credentials are configured. To activate it:

1. In Google Cloud, configure the OAuth consent screen and create a **Web application** OAuth
   client. Register the exact redirect URI
   `https://YOUR-WEB-ORIGIN/api/v1/auth/oauth/google/callback`. For local development use
   `http://localhost:3000/api/v1/auth/oauth/google/callback` (or the actual web port).
2. Configure the API environment: set `PUBLIC_WEB_URL` to the public web origin without a trailing
   slash, `OAUTH_GOOGLE_CLIENT_ID` to the client ID, and `OAUTH_GOOGLE_CLIENT_SECRET` to the client
   secret. Store the secret only in the deployment's secret manager, never in browser variables,
   git, or chat. Ensure the web `/api/v1/*` proxy reaches the API and Redis is available.
3. Restart or redeploy the API. Visit the login page and verify **Continue with Google** appears.
   Complete a real sign-in and check logout, a returning login, and an existing email account.
   Check Google's test-user and publishing requirements before inviting all users.

The provider account is identified by Google's `sub`. For a new connection, account linking by
email is restricted to Google-authoritative, verified Gmail or Workspace addresses. A Google
account using another email domain signs in as a separate account without a verified email; it is
not automatically linked. Existing linked provider accounts keep working. OAuth was not tested
against a live Google project in this repository; production credentials and a real callback
test are needed. Google configuration reference:
https://developers.google.com/identity/protocols/oauth2/web-server.

## AdSense

AdSense is independent of Google sign-in. The owner must create an AdSense account, submit the live
site, complete payment/identity setup, and receive Google's approval. Google reviews the whole
site: https://support.google.com/adsense/answer/10162. A source API's open-source license does not
establish rights to the videos it accesses; inventory deployed sources and establish the relevant
rights before submitting. See [MONETIZATION.md](MONETIZATION.md).

No AdSense code, ads.txt entry, ad request, or consent platform is installed yet. Do not enable
automatic ads: any eventual implementation must use manually controlled, visible placements on
discovery pages only, with no ads on watch or room pages, and comply with applicable consent rules.
Google prohibits background ads and warns against placing ads near controls:
https://support.google.com/adsense/answer/10502938 and
https://support.google.com/adsense/answer/1346295. Once approved, use the actual publisher and ad
unit IDs from the owner's account and verify the provider's current integration instructions.
