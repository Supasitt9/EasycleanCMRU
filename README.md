# Easy Clean

## Run locally with the Node.js demo server

1. Install Node.js 22 or newer.
2. Run `npm install`.
3. Copy `.env.example` to `.env`.
4. Set `GOOGLE_CLIENT_ID` in `.env`, then run `npm start`.
5. Open `http://localhost:3000` (do not open the HTML files as `file://` URLs).

Google sign-in in local mode requires a Google OAuth **Web application** client:

1. In Google Cloud Console, configure the OAuth consent screen and add test users if the app is in testing mode.
2. Create an OAuth client ID for a Web application.
3. Add `http://localhost:3000` under **Authorized JavaScript origins**.
4. Put the client ID (the public value ending in `.apps.googleusercontent.com`) in `.env` as `GOOGLE_CLIENT_ID`.
5. Restart the server and use the Google button on the sign-in page.

The local Node server is a demo mode. It stores account and transaction data in the ignored `data/` directory; other profile data remains in each browser's local storage. Do not use this JSON-file storage as a production database.

## Deploy the static website with Firebase (Spark plan)

The hosted version uses Firebase Authentication and Cloud Firestore directly from the browser; it does not use the local Node server. Firebase's public web configuration belongs in `firebase-config.js`. It is not a secret. Never put service-account keys or other private credentials in browser files.

1. Create a Firebase project using the **Spark** plan and add a Web app.
2. In **Authentication → Sign-in method**, enable **Email/Password** and **Google**.
3. In **Authentication → Settings → Authorized domains**, add the Firebase Hosting domain (for example, `your-project.web.app`).
4. In **Firestore Database**, create a database. The `firestore.rules` file is deployed with the site and limits access by signed-in user and verified admin email.
5. The current project's public Web app config is already in `firebase-config.js`. If deploying to a different Firebase project, replace it with that project's Web app config (`apiKey`, `authDomain`, `projectId`, `appId`; the remaining fields may also be copied). Do not change `EASYCLEAN_ADMIN_EMAIL` unless the administrator account is intentionally being changed.
6. Install the Firebase CLI, sign in, select the project, then deploy:

   ```sh
   npm install --global firebase-tools
   firebase login
   firebase use --add
   firebase deploy --only hosting,firestore:rules
   ```

7. Open the Hosting URL printed by the deploy command. Register the administrator using `admineasyclean@gmail.com`, then verify that address through the email Firebase sends. Only that verified email receives admin privileges.

The Firebase Web SDK is loaded from Google's CDN, so the hosted site needs an internet connection. Email/password accounts from the old local Node server cannot be transferred with their existing passwords; users must register again. Old browser-local data can only be imported from the browser that still has it, after that user signs in. QR slips and applicant documents are stored inside Firestore documents, so Firebase mode limits new files to 500 KB. Payments are demo records only; no real payment gateway is connected. Stay within the Firebase Spark quotas; Firebase Hosting and Authentication have free allowances, and Firestore has free daily quotas.

The Firestore rules have been compiled and deployed to the configured Firebase project, and the hosted homepage has been smoke-checked. Registration, sign-in, bookings, payments, admin updates, and realtime booking updates have not been end-to-end tested against Firebase or the Firebase Emulator; verify these flows before inviting users.

## Automatic deployment from GitHub

The `.github/workflows/firebase-hosting.yml` workflow checks JavaScript and deploys to the live Firebase Hosting site whenever code is pushed to `main`. To authorize it, create a dedicated Google Cloud service account for project `easy-clean-4aaac`, grant it the Firebase Hosting Admin role, create a JSON key, then add the complete JSON as the GitHub Actions repository secret `FIREBASE_SERVICE_ACCOUNT_EASY_CLEAN_4AAAC` under **Settings → Secrets and variables → Actions**. Do not commit the key or paste it into source files. The first workflow run will fail until this secret is configured. Rotate or revoke the key if it is ever exposed.
