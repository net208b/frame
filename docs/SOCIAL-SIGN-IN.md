# Signing in with Google, Apple, Facebook and X

The code supports all four. None of them works until its provider is set up,
and the setup happens in each company's developer console, under the owner's
own account — so it cannot be done from this repository. This is the list of
what to do there.

- [How it fits together](#how-it-fits-together)
- [Before switching any provider on](#before-switching-any-provider-on)
- [Values used below](#values-used-below)
- [Google](#google)
- [Apple](#apple)
- [Facebook](#facebook)
- [X](#x)
- [After switching one on](#after-switching-one-on)
- [What is not covered yet](#what-is-not-covered-yet)

---

## How it fits together

- The sign-in and Join pages draw one button per provider that the identity
  service reports as **switched on**, read from Supabase's public
  `/auth/v1/settings` endpoint (`src/lib/enabled-sign-in-providers.ts`). Switch
  a provider on in the Supabase dashboard and its button appears within five
  minutes, with no deploy. Switch it off and the button goes. Nothing is shown
  for a provider that would refuse the attempt.
- Pressing a button posts to `signInWithProvider` in
  `src/server/actions/auth.ts`, which sends the member to the provider and back
  to `/auth/callback`. The callback already handled email links; it now also
  tells a cancelled or failed provider sign-in apart from an expired link.
- A first sign-in creates the account. `handle_new_user()` gives it a username,
  chosen as described in `supabase/migrations/0009_provider_usernames.sql` —
  never a reserved name, and never an Apple relay address.
- X is offered through Supabase's **Twitter (OAuth 1.0a)** provider, not its
  "X / Twitter (OAuth 2.0)" one. The settings endpoint above does not report the
  OAuth 2.0 provider at all, so its button could not be shown only when it
  works. Both sign in through the same app in the X developer portal; they use
  different credentials from it, which the X section names.

## Before switching any provider on

**Apply migration 0009 to the production database first.** Until it is there,
the trigger in force is the one from 0006, which does not refuse reserved
usernames: a Gmail address beginning `admin@`, or an X handle of `moderator`,
would become that username on the first sign-in.

Production already has 0010 (the username guard), which was shipped on its
own ahead of this. 0009 therefore sorts *before* a migration the database has
already recorded, and a plain `supabase db push` refuses to apply it. From an
up-to-date `main`:

```bash
supabase db push --include-all
```

Run it with `--dry-run` first: the only migration it should list is 0009.

and confirm the trigger in force is the new one — this prints `t`:

```sql
select prosrc like '%c_reserved%' from pg_proc where proname = 'handle_new_user';
```

## Values used below

For the production deployment. Substitute your own for another one.

| What | Value |
| --- | --- |
| Site | `https://worldofstreetphoto.com` |
| Domain | `worldofstreetphoto.com` |
| Supabase project ref | `fxonyooanbyspbqbfnag` |
| **Callback URL — the same for every provider** | `https://fxonyooanbyspbqbfnag.supabase.co/auth/v1/callback` |
| Privacy policy | `https://worldofstreetphoto.com/en/legal/privacy` |
| Terms | `https://worldofstreetphoto.com/en/legal/terms` |
| Data deletion instructions | `https://worldofstreetphoto.com/en/legal/privacy#sign-in-providers` |

The callback URL is Supabase's, not the site's. Every provider sends the member
back to Supabase, which then sends them on to `/auth/callback` on the site —
already on the redirect allow-list. Putting the site's own URL into a provider
console is the most common way to get this wrong.

Each provider ends the same way: **Supabase dashboard → Authentication →
Sign In / Providers → the provider → switch on → paste the two values → Save.**
Paste secrets there, directly. They do not belong in this repository, in an
environment variable, or in a chat.

---

## Google

Free. About fifteen minutes.

1. Open the [Google Cloud console](https://console.cloud.google.com/) and
   create a project — "FRAME" — or choose an existing one.
2. **Google Auth Platform → Branding** (older consoles: *APIs & Services →
   OAuth consent screen*).
   - App name: FRAME. User support email: yours.
   - App home page, privacy policy and terms: the values above.
   - Authorised domains: add **both** `worldofstreetphoto.com` and
     `supabase.co`. The second is needed because the callback URL is on it.
3. **Audience**: user type *External*.
4. **Data access**: leave it at the defaults — `openid`, `email`, `profile`.
   These are not sensitive scopes, so no verification review is needed. Adding
   anything else would change that.
5. **Clients → Create client → Web application.**
   - Authorised JavaScript origins: `https://worldofstreetphoto.com`
   - Authorised redirect URIs: the callback URL.
   - Create, and copy the **Client ID** and **Client secret**.
6. Supabase → Providers → **Google**: switch on, paste the Client ID and the
   Client secret, save.
7. Back in **Audience**, press **Publish app**. Until you do, the app is in
   testing and only accounts you list as test users — at most a hundred — can
   sign in. Everybody else is refused by Google, not by FRAME.

Uploading a logo on the Branding page can trigger Google's brand verification,
which takes days. Leave the logo off to go live today; add it later.

## Apple

**Needs the Apple Developer Program: US$99 a year.** About thirty minutes,
plus a renewal every six months.

1. In [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list):
   **Identifiers → + → App IDs → App.** Description "FRAME", bundle ID
   `com.worldofstreetphoto.frame`. Tick **Sign In with Apple**. Register.
2. **Identifiers → + → Services IDs.** Description "FRAME on the web",
   identifier `com.worldofstreetphoto.frame.web`. Register, then open it again:
   - Tick **Sign In with Apple → Configure.**
   - Primary App ID: the one from step 1.
   - Domains and subdomains: `fxonyooanbyspbqbfnag.supabase.co`
   - Return URLs: the callback URL.
   - Save. This **Services ID** is the "client ID" for the web.
3. **Keys → +.** Name "FRAME Sign in with Apple", tick **Sign In with Apple →
   Configure**, choose the App ID from step 1, register.
   **Download the `.p8` file — Apple lets you download it once.** Note the
   **Key ID**, and your **Team ID** (top right of the developer site).
   Keep the `.p8` somewhere safe and out of this repository.
4. Make the client secret. It is a JWT signed with the `.p8`, and this script
   makes it on your own machine so the key never leaves it:

   ```bash
   node scripts/apple-client-secret.mjs --key ~/path/AuthKey_XXXXXXXXXX.p8 --key-id XXXXXXXXXX --team-id YYYYYYYYYY --services-id com.worldofstreetphoto.frame.web
   ```

   It prints the JWT and the date it stops working.
5. Supabase → Providers → **Apple**: switch on. *Client IDs*: the Services ID
   from step 2. *Secret Key (for OAuth)*: the JWT. Save.
6. **Put the renewal date in a calendar.** Apple refuses a secret more than six
   months old. When it lapses the Apple button keeps appearing — Supabase still
   reports Apple as switched on — but every attempt fails, and members see
   "That sign-in did not finish". Run step 4 again and paste the new JWT.

Apple lets a member hide their real address behind a relay address
(`…@privaterelay.appleid.com`). Apple's relay delivers only mail from senders
registered with it. FRAME sends nothing to provider accounts today, but anything
that does later — a password-reset link, a notification — will be dropped
silently until the sending domain is registered under **Sign in with Apple for
Email Communication** in the developer account.

## Facebook

Free. About twenty minutes, but going live may depend on the contact-address
point under [What is not covered yet](#what-is-not-covered-yet).

1. [Meta for Developers](https://developers.facebook.com/apps/) → **Create
   app**. Use case: **Authenticate and request data from users with Facebook
   Login.** Name it FRAME.
2. **Use cases → Facebook Login → Customise.**
   - Permissions: make sure **email** is added beside `public_profile`. Both are
     available without App Review.
   - **Settings → Valid OAuth Redirect URIs**: the callback URL. Leave *Enforce
     HTTPS* on.
3. **App settings → Basic.**
   - App domains: `worldofstreetphoto.com`
   - Privacy policy URL and Terms of Service URL: the values above.
   - **User data deletion → Data deletion instructions URL**: the value above.
     It points at the "Signing in with another account" section of the privacy
     notice, which says how to disconnect FRAME from Facebook.
   - Category, and a 1024 × 1024 icon.
   - Copy the **App ID** and **App secret**.
4. Supabase → Providers → **Facebook**: switch on, paste the App ID and App
   secret, save.
5. Switch the app from **Development** to **Live** (the toggle at the top of
   the app dashboard). In development mode only people with a role on the app
   can sign in.

## X

A developer account is needed; X's access tiers and their terms change often,
so check what the free tier allows when you sign up. About twenty minutes.

1. [X developer portal](https://developer.x.com/) → create or choose a project
   and an app.
2. App → **User authentication settings → Set up.**
   - App permissions: **Read**.
   - Tick **Request email from users.** Without it X sends no email address, and
     the member's FRAME account has none — no way to recover it by email. X
     only allows the tick once the terms and privacy URLs below are filled in.
   - Type of app: **Web App**.
   - Callback URI / Redirect URL: the callback URL.
   - Website URL, Terms of service, Privacy policy: the values above.
   - Save.
3. **Keys and tokens → Consumer Keys → API Key and Secret.** Generate or
   regenerate, and copy both. These are the OAuth 1.0a credentials. The
   *OAuth 2.0 Client ID and Client Secret* on the same page are **not** the
   ones — see [How it fits together](#how-it-fits-together) for why.
4. Supabase → Providers → **Twitter**, the OAuth 1.0a one — not "X / Twitter
   (OAuth 2.0)". Switch on. Paste the API Key as the client ID and the API
   Secret as the client secret. Save.

If the dashboard no longer offers the OAuth 1.0a provider, stop there and do not
switch the OAuth 2.0 one on in its place: its button would never appear, for
the reason above. Moving to it needs a small code change.

---

## After switching one on

Within five minutes:

1. Open `https://worldofstreetphoto.com/en/login` in a private window. The
   provider's button is there; the others you have not set up are not.
2. Sign in with it. You land back on FRAME, signed in.
3. Open your profile and check the username: a Google or Facebook account
   gets the part of the email address before the `@`; an Apple account that
   hid its address gets the name instead; an X account gets the handle.
4. Sign out, and sign in once more the same way. It is the same account, not a
   second one.

If the button is missing after five minutes, the provider is not switched on in
Supabase, or was not saved. If the button is there but sign-in fails with "That
sign-in did not finish", the client ID, secret or callback URL in the provider
console is wrong — the runtime log names the reason as
`FRAME auth: a code exchange failed — …`.

## What is not covered yet

- **No contact address is named.** Members can now delete their account from
  **Settings** (migration 0011), so the data-deletion link given to Meta leads to
  something that works. The privacy notice still says the contact route for a
  copy of one's data, or a correction, "must be named here before launch", and
  Meta's reviewers may look for one. Name a real address there before switching
  Facebook to Live.
- **A provider-made username is a guess until the member replaces it.** They
  can replace it once, from Settings. Nothing prompts them to on first sign-in;
  a one-time "choose your username" step then would catch more of them.
- **Apple's secret expires every six months** and nothing in FRAME will notice.
  The calendar entry in the Apple section is the only safeguard.
