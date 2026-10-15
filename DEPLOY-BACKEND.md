# Updating the Apps Script backend

The frontend deploys itself from `main` via GitHub Pages. The backend
(`apps-script/Code.js`) deploys automatically too once you've done the
one-time setup below; until then, use the manual steps.

## One-time setup: automatic backend deploys

This gives GitHub Actions (not Claude, and not anyone reading the public
repo) permission to update your Apps Script project. Secrets are never shown
in logs or to forks.

1. Turn on the Apps Script API: https://script.google.com/home/usersettings → Google Apps Script API → On.
2. On your computer, with Node installed:
   `npm install -g @google/clasp@2.4.2` then `clasp login` (sign in as the Google account that owns the IRONLOG sheet).
3. That creates a file called `.clasprc.json` in your home folder. Copy its entire contents.
4. GitHub → the IronLog repo → Settings → Secrets and variables → Actions → New repository secret.
   Name: `CLASPRC_JSON`. Value: paste. Save.
5. Optional: delete `~/.clasprc.json` from your computer afterwards.

From then on, any change to `apps-script/` merged into `main` runs the tests,
pushes the code, and updates your existing deployment (same URL). You can also
run it by hand from the Actions tab → Deploy Apps Script → Run workflow.

To revoke: delete the secret, and remove "clasp" at https://myaccount.google.com/permissions.

## Manual deploy

**Order matters:** merge the frontend to `main` first and let Pages redeploy,
then update the backend. The new frontend works with the old backend; the old
frontend does not work with the new backend.

1. Open the Apps Script project (Extensions → Apps Script from the IRONLOG sheet).
2. Replace the contents of `Code.gs` with `apps-script/Code.js` from this repo. Save.
3. Deploy → Manage deployments → pencil icon on the existing web app →
   Version: **New version** → Deploy. Editing the existing deployment keeps
   the same URL, so the app doesn't need changing.
