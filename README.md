# Easy Clean

## Run locally

1. Install Node.js 22 or newer.
2. Run `npm install`.
3. Copy `.env.example` to `.env`.
4. Set `GOOGLE_CLIENT_ID` in `.env`, then run `npm start`.
5. Open `http://localhost:3000` (do not open the HTML files as `file://` URLs).

Google sign-in requires a Google OAuth **Web application** client:

1. In Google Cloud Console, configure the OAuth consent screen and add test users if the app is in testing mode.
2. Create an OAuth client ID for a Web application.
3. Add `http://localhost:3000` under **Authorized JavaScript origins**.
4. Put the client ID (the public value ending in `.apps.googleusercontent.com`) in `.env` as `GOOGLE_CLIENT_ID`.
5. Restart the server and use the Google button on the sign-in page.

The browser sends the Google ID token to this server. The server verifies its signature, issuer, audience, and expiry with Google's authentication library before creating an HttpOnly, SameSite session cookie. Google accounts are assigned the customer role by default. To grant the administrator role, set `ADMIN_EMAIL` to the exact trusted email in `.env`; never let users select that role during registration.

Email/password accounts and sessions are also handled on the server. Account records and hashed session tokens are stored in the ignored `data/auth.json` file. Passwords are hashed with PBKDF2. Bookings and payments are stored in the ignored `data/transactions.json` file and shared between authenticated customer and admin sessions on this server. Existing browser-local bookings and payments are imported when their owner next visits the site. Addresses, services, applications, reviews, and notifications remain browser-local demo data. The JSON files are not a production database. Password reset by email is not enabled because an email sender and verified reset flow have not been configured.

For production, deploy behind HTTPS, configure the production domain as an authorized JavaScript origin, set `HOST=0.0.0.0`, and set `TRUST_PROXY=1` only when the server is behind a trusted TLS-terminating reverse proxy. Use a durable database/session store with backups and operational monitoring instead of the demo JSON store.
