// Jus Daylog settings.
// LOGIN & SYNC: paste your Google Apps Script web app URL between the quotes. It must start with https://script.google.com/ and end with /exec
// (Apps Script > Deploy > Manage deployments > copy the "Web app" URL).
// While API_URL is empty the app runs in DEMO mode: no login, data stays only on this device.
window.APP_CONFIG = {
  API_URL: "https://script.google.com/macros/s/AKfycbwBiV1Xv352yu55mxtXB0eQlS7U0-gHagfSll--DHKb2SODUXFeU7R4GTseHLLs7qV1/exec",
  // Optional: "Continue with Google". Paste an OAuth Web client ID (see apps-script/BACKEND-SETUP.md, section Google sign-in). Leave empty to hide the button.
  GOOGLE_CLIENT_ID: "",
  APP_NAME: "Jus Daylog",
  APP_URL: "https://YOUR_GITHUB_USERNAME.github.io/YOUR_REPO/"
};
