(() => {
  if (globalThis.__careerPilotFillInstalled) return;
  globalThis.__careerPilotFillInstalled = true;

  const fieldPatterns = [
    ['firstName', /(?:^|\b)(?:first\s*name|given\s*name)(?:\b|$)/],
    ['lastName', /(?:^|\b)(?:last\s*name|family\s*name|surname)(?:\b|$)/],
    ['email', /(?:^|\b)e[\s-]?mail(?:\b|$)/],
    ['phone', /(?:^|\b)(?:phone|mobile|telephone)(?:\b|$)/],
    ['location', /(?:^|\b)(?:current\s+)?(?:location|city)(?:\b|$)/],
    ['linkedIn', /linkedin/],
    ['github', /github/],
    ['portfolio', /(?:portfolio|personal\s+website|website\s+url)/],
    ['name', /(?:^|\b)(?:full\s+name|your\s+name|candidate\s+name|name)(?:\b|$)/]
  ];

  function getDescriptor(field) {
    const labels = Array.from(field.labels || [], label => label.textContent || '');
    const labelledBy = (field.getAttribute('aria-labelledby') || '')
      .split(/\s+/)
      .map(id => document.getElementById(id)?.textContent || '');
    return [
      field.getAttribute('type'),
      field.getAttribute('autocomplete'),
      field.getAttribute('name'),
      field.id,
      field.getAttribute('placeholder'),
      field.getAttribute('aria-label'),
      ...labels,
      ...labelledBy
    ].filter(Boolean).join(' ').toLowerCase().replace(/[_-]+/g, ' ');
  }

  function getProfileValue(key, profile, nameParts) {
    if (key === 'firstName') return nameParts[0] || '';
    if (key === 'lastName') return nameParts.slice(1).join(' ');
    return profile[key] || '';
  }

  function getFieldValue(field, profile, nameParts) {
    const descriptor = getDescriptor(field);
    const type = (field.getAttribute('type') || '').toLowerCase();
    const autocomplete = (field.getAttribute('autocomplete') || '').toLowerCase();
    const fieldKey = autocomplete === 'given-name'
      ? 'firstName'
      : autocomplete === 'family-name'
        ? 'lastName'
        : autocomplete === 'name'
          ? 'name'
          : autocomplete === 'email'
            ? 'email'
            : /^tel(?:-|$)/.test(autocomplete)
              ? 'phone'
              : autocomplete === 'address-level2'
                ? 'location'
              : fieldPatterns.find(([, pattern]) => pattern.test(descriptor))?.[0];

    if (!fieldKey) return null;
    if (/\b(?:emergency|reference|referee|recruiter|manager|supervisor|company|employer|school|university|organization)\b/.test(descriptor)) return null;
    if (fieldKey === 'email' && type && type !== 'email' && type !== 'text') return null;
    if (fieldKey === 'phone' && type && type !== 'tel' && type !== 'text') return null;
    return getProfileValue(fieldKey, profile, nameParts);
  }

  function setValue(field, value) {
    if (!value || String(field.value || '').trim() || field.disabled || field.readOnly) return false;
    const element = field.tagName === 'TEXTAREA' ? HTMLTextAreaElement : HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(element.prototype, 'value')?.set;
    if (!setter) return false;
    setter.call(field, String(value).trim());
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'CAREERPILOT_FILL') return;
    const profile = message.profile || {};
    const nameParts = String(profile.name || '').trim().split(/\s+/).filter(Boolean);
    let filled = 0;
    let skipped = 0;
    let detected = 0;

    for (const field of document.querySelectorAll('input, textarea')) {
      if (field.disabled || field.readOnly) continue;
      const type = (field.getAttribute('type') || 'text').toLowerCase();
      if (['hidden', 'password', 'submit', 'button', 'reset', 'checkbox', 'radio', 'file'].includes(type)) continue;
      const value = getFieldValue(field, profile, nameParts);
      if (value === null || !value) continue;
      detected += 1;
      if (setValue(field, value)) filled += 1;
      else skipped += 1;
    }

    sendResponse({ filled, skipped, detected });
  });
})();
