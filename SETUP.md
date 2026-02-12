# Reminders App - Step-by-Step Setup Guide

Welcome! This guide will walk you through setting up your Reminders App from start to finish. We assume you have already installed the project dependencies.

## Current Status
- [x] Project dependencies installed (`npm install` in root)
- [x] Cloud Functions dependencies installed (`npm install` in `functions`)
- [x] Firebase Credentials configured in `.env.local`
- [x] Firebase CLI installed

---

## Step 1: Set up Twilio (for SMS)
**If you want SMS notifications to work, you need a Twilio account.**
*If you don't have one or don't want to set it up right now, you can skip this, but you won't receive actual text messages.*

1.  **Create Account**: Go to [Twilio](https://www.twilio.com/) and sign up for a free trial.
2.  **Get Phone Number**: Buy a number (or get a free trial number) from the Twilio Console.
3.  **Get Credentials**: On your Twilio Dashboard, find your:
    -   **Account SID**
    -   **Auth Token**
4.  **Configure in Project**:
    -   Open the file `.env.local` in this folder.
    -   Paste your values after the equal signs:
        ```env
        TWILIO_ACCOUNT_SID=AC... (your SID)
        TWILIO_AUTH_TOKEN=... (your token)
        TWILIO_PHONE_NUMBER=+1234567890 (your Twilio number)
        ```

---

## Step 2: deploy Security Rules
This ensures only YOU can see your data.

1.  Open your terminal in the root folder `f:\Reminders App`.
2.  Login to Firebase (if not already logged in):
    ```bash
    firebase login
    ```
    *Follow the browser prompt to sign in with your Google account.*
3.  **Set Active Project** (Important!):
    ```bash
    firebase use reminders-app-3beb4
    ```
    *This tells the CLI to use your specific project.*
4.  Deploy the database rules:
    ```bash
    firebase deploy --only firestore:rules
    ```
    *Success Message: "Deploy complete"*

---

## Step 3: Run the App Locally
Now let's see the app directly on your computer!

1.  In your terminal (root folder `f:\Reminders App`), run:
    ```bash
    npm run dev
    ```
2.  You should see text saying `Ready in ...` and a URL like `http://localhost:3000`.
3.  Open your web browser (Chrome, Edge, etc.) and go to **[http://localhost:3000](http://localhost:3000)**.
4.  **Test the App**:
    -   Click **Sign Up**.
    -   Create an account (e.g., `test@example.com`, password `password123`).
    -   You will be redirected to the Dashboard.
    -   Try creating a Reminder! Click "+ New Reminder".

---

## Step 4: Test Cloud Functions (Optional / Advanced)
This step runs the background service that checks for reminders to send SMS.

1.  **Open a NEW Terminal window** (keep the `npm run dev` one running).
2.  Navigate to the functions folder:
    ```bash
    cd functions
    ```
3.  We need to give the functions your Twilio keys. Create a file named `.env` inside the `functions` folder and add your specific keys there too (for local testing):
    ```env
    TWILIO_ACCOUNT_SID=...
    TWILIO_AUTH_TOKEN=...
    TWILIO_PHONE_NUMBER=...
    ```
4.  Run the emulator:
    ```bash
    npm run serve
    ```
    *This starts a "fake" server on your computer that mimics the cloud.*
5.  If you created a reminder due in 24 hours, wait 5 minutes, or manually modify the due time to test. The logs in this terminal will show "Checking reminders..." every 5 minutes.

---

## Step 5: Deploying to the Internet (Optional)
To make your app accessible from your phone without your computer running:

1.  Build the project:
    ```bash
    npm run build
    ```
2.  Deploy the web app and functions to Firebase (requires you to set up Firebase Hosting in the console):
    ```bash
    firebase deploy
    ```
    *Note: For the best experience with Next.js, we often recommend deploying the frontend to [Vercel](https://vercel.com) and just using Firebase for the backend/database.*

---

## Troubleshooting

-   **Browser Extensions**: logic/hydration errors like `Extra attributes from the server` often come from extensions like "Dark Reader" or "Grammarly". Try opening in Incognito/Private mode to verify.
-   **Hydration Mismatch**: If you see errors about "server rendered HTML didn't match", it's usually benign in dev mode, often caused by extensions modifying the DOM. 
    -   Check the terminal where `npm run serve` is running.
    -   Ensure your Twilio trial account has verified the "To" phone number (Twilio trial only sends to verified numbers).
-   Check that you enabled "SMS Opt-in" in the App Settings (Sidebar > Settings).

---

## Step 6: Setup Recurring Reminders (Cron)

To ensure recurring reminders generate automatically, you need to set up the Cron job.

### Vercel Cron (Recommended)
If deploying to Vercel, the `vercel.json` file handles the schedule automatically. You just need to set the secret:
1.  Go to your Vercel Project Settings > Environment Variables.
2.  Add a new variable:
    -   **Key**: `CRON_SECRET`
    -   **Value**: (Generate a random string, e.g., `openssl rand -hex 32`)

### GitHub Actions (Alternative)
If you prefer to use GitHub Actions to trigger the cron:
1.  Go to your GitHub Repository > Settings > Secrets and variables > Actions.
2.  Add the following secrets:
    -   `CRON_SECRET`: The same random string you generated.
    -   `APP_URL`: Your deployed URL (e.g., `https://your-app.vercel.app`).

