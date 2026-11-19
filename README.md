# Daily Wheel + DayLog (front end only)

This folder is what goes on **GitHub Pages**. It contains **no backend code**.
The backend (`Code.gs`) lives only inside Google Apps Script. A `.gitignore` here keeps it out of the repo.

## Deploy
1. Set up the backend first (see `BACKEND-SETUP.md`, kept outside this repo) and copy its `/exec` URL.
2. Open `config.js` and paste the URL: `API_URL: "https://script.google.com/macros/s/XXXX/exec"`.
3. Push everything in this folder to a GitHub repo, then Settings > Pages > Deploy from branch `main` / root.
4. Daily Wheel: `https://<user>.github.io/<repo>/`  DayLog: `https://<user>.github.io/<repo>/daylog/`
5. On a phone: Share / browser menu > Add to Home Screen (or package an APK with pwabuilder.com).

## Updating an existing install
Phones cache the app. After you push an update, open the app, close it fully, and open it again (twice if needed).

Note: the `/exec` URL in `config.js` is visible to anyone who opens your site. That is normal; it is only the address, and the code and the Sheet stay private in your Google account.
