# Updating the Apps Script backend

The frontend deploys itself from `main` via GitHub Pages. The backend
(`apps-script/Code.js`) has to be pasted into Apps Script by hand.

**Order matters:** merge the frontend to `main` first and let Pages redeploy,
then update the backend. The new frontend works with the old backend; the old
frontend does not work with the new backend.

1. Open the Apps Script project (Extensions → Apps Script from the IRONLOG sheet).
2. Replace the contents of `Code.gs` with `apps-script/Code.js` from this repo. Save.
3. **Reset the device key** so your phone becomes the trusted device:
   Project Settings (gear) → Script Properties → delete `PROGRAM_AUTH_TOKEN`.
   (Leave `ANTHROPIC_API_KEY` alone.)
4. Deploy → Manage deployments → pencil icon on the existing web app →
   Version: **New version** → Deploy. Editing the existing deployment keeps
   the same URL, so the app doesn't need changing.
5. Open IronLog on your phone first. The first device to connect after the
   reset becomes the trusted one.
6. To add another device: Library tab → **Copy device key** on the phone,
   then **Enter a key** on the other device (or paste it when it asks).

If a device ever gets locked out and you can't copy the key from anywhere,
repeat step 3 and open the app on the device you want to trust.
