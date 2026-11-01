const api = document.getElementById('api');
const token = document.getElementById('token');
const message = document.getElementById('message');
const defaultApiOrigin = 'http://localhost:4000';

function showMessage(text, isError = false) {
  message.textContent = text;
  message.className = isError ? 'error' : 'muted';
}

function normalizeOrigin(value) {
  const origin = String(value || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
    throw new Error('For local development, API origin must be localhost or 127.0.0.1.');
  }
  return origin;
}

function isLocalTestPage(url) {
  return url.protocol === 'http:'
    && ['localhost', '127.0.0.1'].includes(url.hostname)
    && url.pathname === '/extension-test-form.html';
}

chrome.storage.local.get(['apiOrigin', 'extensionToken'], saved => {
  if (saved.apiOrigin) api.value = saved.apiOrigin;
  if (saved.extensionToken) token.value = saved.extensionToken;
});

document.getElementById('save').addEventListener('click', () => {
  const value = token.value.trim();
  if (!value) {
    showMessage('Paste the one-time extension token from Settings.', true);
    return;
  }
  try {
    const apiOrigin = normalizeOrigin(api.value || defaultApiOrigin);
    chrome.storage.local.set({ apiOrigin, extensionToken: value }, () => showMessage('Connection saved locally.'));
  } catch (error) {
    showMessage(error.message, true);
  }
});

document.getElementById('fill').addEventListener('click', async () => {
  const saved = await chrome.storage.local.get(['apiOrigin', 'extensionToken']);
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      throw new Error('Could not find the active browser tab.');
    }
    const pageUrl = new URL(tab.url || '');
    if (!['http:', 'https:'].includes(pageUrl.protocol)) {
      throw new Error('Open an employer application page in a normal browser tab before filling.');
    }
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    let profile;
    const isTestPage = isLocalTestPage(pageUrl);
    if (isTestPage) {
      profile = {
        name: 'Taylor Example',
        email: 'taylor@example.test',
        phone: '+1 555 010 2040',
        location: 'Bengaluru, India',
        linkedIn: 'https://linkedin.com/in/taylor-example',
        github: 'https://github.com/taylor-example',
        portfolio: 'https://taylor.example.test'
      };
    } else {
      if (!saved.extensionToken) {
        throw new Error('Save an extension token from CareerPilot Settings first. Use “Open local test form” to test without one.');
      }
      showMessage('Reading your approved profile...');
      const origin = normalizeOrigin(saved.apiOrigin || defaultApiOrigin);
      const response = await fetch(`${origin}/api/extension/profile`, {
        headers: { Authorization: `Extension ${saved.extensionToken}` }
      });
      if (!response.ok) {
        if (response.status === 401) {
          await chrome.storage.local.remove(['extensionToken']);
          token.value = '';
          throw new Error('The extension connection is expired or revoked; its saved token was cleared.');
        }
        if (response.status === 403) throw new Error('This connection is not allowed to read profile fields.');
        throw new Error('CareerPilot could not read the approved profile.');
      }
      profile = await response.json();
    }
    const result = await chrome.tabs.sendMessage(tab.id, { type: 'CAREERPILOT_FILL', profile });
    if (!result?.detected) {
      showMessage('No supported profile fields found. Open an application form and try again.', true);
      return;
    }
    const source = isTestPage ? 'Sample test data' : 'Your approved profile';
    showMessage(`${source}: ${result.filled} field(s) filled; ${result.skipped} left unchanged. Review all values.`);
  } catch (error) {
    const message = error.message || 'The extension could not complete the fill request.';
    showMessage(/cannot access contents|cannot be scripted|receiving end does not exist|not allowed to access/i.test(message)
      ? 'This page does not allow form assistance. Try the employer application page.'
      : message, true);
  }
});

document.getElementById('open-test').addEventListener('click', () => {
  chrome.tabs.create({ url: 'http://localhost:5173/extension-test-form.html' });
});

document.getElementById('clear').addEventListener('click', () => {
  chrome.storage.local.remove(['apiOrigin', 'extensionToken'], () => {
    token.value = '';
    api.value = defaultApiOrigin;
    showMessage('Local extension connection cleared.');
  });
});
