const labelText = element => {
  const label = element.labels?.[0]?.textContent || element.getAttribute('aria-label') || element.placeholder || element.name || '';
  return label.toLowerCase();
};
const valueFor = (field, profile) => {
  const label = labelText(field);
  if (/first.*name/.test(label)) return profile.fullName?.split(/\s+/)[0] || '';
  if (/last.*name/.test(label)) return profile.fullName?.split(/\s+/).slice(1).join(' ') || '';
  if (/name/.test(label)) return profile.fullName || '';
  if (/email/.test(label)) return profile.email || '';
  if (/phone|mobile/.test(label)) return profile.phone || '';
  if (/linkedin/.test(label)) return profile.linkedInUrl || '';
  if (/github/.test(label)) return profile.githubUrl || '';
  if (/portfolio|website/.test(label)) return profile.portfolioUrl || '';
  if (/location|city/.test(label)) return profile.location || '';
  return '';
};
chrome.runtime.onMessage.addListener(message => {
  if (message.type !== 'CAREERPILOT_FILL') return;
  const filled = [];
  document.querySelectorAll('input:not([type="hidden"]), textarea').forEach(field => {
    const value = valueFor(field, message.profile);
    if (!value || field.value) return;
    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
    filled.push(labelText(field));
  });
  window.alert(`CareerPilot filled ${filled.length} supported field(s). Review every value before submitting.`);
});
