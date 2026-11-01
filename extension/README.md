# CareerPilot AI Chrome extension

This Manifest V3 extension can assist on employer application pages opened from CareerPilot, including job-board providers other than Greenhouse. It detects common profile fields from the active page after you click the extension action.

## Pairing

1. Sign in to CareerPilot and create a connection in Settings.
2. Copy the one-time scoped extension token into the popup.
3. Keep the token private; it is not the web JWT and is stored hashed by the server.

## Load locally in Chrome

1. Start the CareerPilot API on `http://localhost:4000` and the client on `http://localhost:5173`.
2. Open `chrome://extensions`, enable **Developer mode**, and select **Load unpacked**.
3. Choose this `extension` folder.
4. Open the extension popup and click **Open local test form**. On the test form, click **Fill supported fields on this page**. This uses sample data, needs no extension token, preserves the pre-filled email, and never submits.
5. To test your actual profile, create a connection in CareerPilot Settings, save its one-time token in the extension popup, then open an application page and click **Fill supported fields on this page**.

The extension uses Chrome's `activeTab` permission, so it can access the current page only after you open the popup and click the fill button. Its API connection remains restricted to `localhost` and `127.0.0.1`; update the extension host permissions and API-origin validation together before using a deployed API.

## Safety limits

- Filling requires an explicit click in the popup.
- Existing non-empty fields are not overwritten.
- Common name, email, phone, location, LinkedIn, GitHub, and portfolio fields are supported when their labels or attributes can be identified.
- The extension dispatches input/change events for controlled forms.
- It never clicks Submit, bypasses CAPTCHA/OTP/MFA, fills employer passwords, or sends resumes.
- Review every value and submit the employer form yourself.
- Portal layouts vary; fields the extension cannot confidently identify must be entered manually.
- The extension stores only the API origin and scoped extension token in Chrome local storage. Clear the local connection when the browser profile is no longer trusted.
