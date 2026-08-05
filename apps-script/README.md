# Apps Script backup

Snapshot of the two Google Apps Script projects behind the SGF apps. Google keeps
these only inside its own editor, where there is no readable version history and a
deleted project is gone after 30 days in Drive trash. This folder is the copy you
control.

**This is a snapshot, not a live sync.** Editing a file here changes nothing in
Google. After changing a script in the Apps Script editor, re-copy it into this
folder so the backup stays current.

Last captured: 2026-08-05.

---

## live-scoring-api/

Serves the live scoring app at https://live.saturdaygolffriends.com

- Project: **SGF Live Scoring API**
- Script ID: `1EQz03aMtroeGcewJjDvoGUffqKHy-xRJi4MUtx1VFeZW6CjeKzVjnX1O`
- Owner: chris@zstudios.com
- Deployed version at capture time: **Version 2** (Aug 5, 2026)
- Deployment settings: **Execute as: Me** / **Who has access: Anyone**

Standalone script: it takes the spreadsheet ID as a parameter and opens the sheet
by ID, so it is NOT copied every time you copy the master sheet. (Doing it the
other way is what produced eleven identically-named projects.)

Handles `POST {type:'scores'|'closies'|'settle'}` plus `GET ?action=ping`,
`?action=loadSetup`, `?action=loadMoneySetup`.

The deployed URL is baked into the live app as `APPS_SCRIPT_URL` in `index.html`
at the repo root.

## event-signup-form/

Serves the Calendar & Register app, reachable via
https://live.saturdaygolffriends.com/signup

- Project: **SGF Event Signup Form**
- Script ID: `1XxMtiktCQ2VGpRYrnd-C8ubLctqWzw9IqfVrgMiJwdx-BlX9L9VJt3vz`
- Owner: chris@zstudios.com
- Deployed version at capture time: **Version 15**
- Manifest: `executeAs: USER_DEPLOYING`, `access: ANYONE_ANONYMOUS`

Writes to the **SGF Tracker** sheet, ID
`1xJF3G0oPOeRRuYEVXaTxhMjNAKwzm7bH9X3mcmeB3Tk`, tab `CurrentUpcoming Rounds`.
Read that ID carefully: it is `...G0oPOeRRu...` with the letter O, not a Q.

---

## Rules that will bite you

**Redeploy with "New version", never "New deployment".**
Deploy > Manage deployments > pencil > Version: New version > Deploy.
Keeping the same deployment entry preserves the URL. "New deployment" mints a
different URL, and the app keeps calling the old one, so everything silently
stops working.

**Saving in the editor does not update the live app.** You must redeploy.

**Keep every string in these files ASCII-only.** Smart quotes and em dashes come
out as mojibake in the emails these scripts send.

**Do not rename the labels in the SETUP.MONEY tab.** `loadMoneySetup_()` finds
those cells by matching the label text, not by cell address. Renaming a label
silently breaks the payout numbers in the app.

---

## Restoring a project from this folder

1. Open the project in the Apps Script editor (or create a new one).
2. Replace each file's contents with the copy here, matching filenames exactly.
   `appsscript.json` is only visible if you enable
   Project Settings > "Show appsscript.json manifest file in editor".
3. Save, then Deploy > Manage deployments > pencil > Version: New version.
4. If the deployment URL changed, update `APPS_SCRIPT_URL` in the root
   `index.html` (live scoring) or the redirect target in `signup/index.html`
   (calendar), then commit so GitHub Pages rebuilds.
