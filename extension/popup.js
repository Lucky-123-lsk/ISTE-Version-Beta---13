const apiBase = 'http://localhost:4000';
const status = message => { document.getElementById('status').textContent = message; };
document.getElementById('save').addEventListener('click', async () => {
  const token = document.getElementById('token').value.trim();
  if (!token) return status('Enter a scoped token.');
  await chrome.storage.local.set({ extensionToken: token });
  status('Extension connected. Open a supported application page.');
});
document.getElementById('fill').addEventListener('click', async () => {
  const { extensionToken } = await chrome.storage.local.get('extensionToken');
  if (!extensionToken) return status('Connect the extension first.');
  const response = await fetch(`${apiBase}/api/extension/profile`, { headers: { Authorization: `Extension ${extensionToken}` } });
  if (!response.ok) return status('The extension token is invalid or expired.');
  const profile = await response.json();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await chrome.tabs.sendMessage(tab.id, { type: 'CAREERPILOT_FILL', profile });
  status('Supported fields were filled for your review. Nothing was submitted.');
});
