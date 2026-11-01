const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const contentScript = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');

class MockField {
  constructor({ tagName = 'INPUT', type = 'text', value = '', attributes = {}, labels = [] } = {}) {
    this.tagName = tagName;
    this.type = type;
    this.value = value;
    this.attributes = attributes;
    this.labels = labels.map(textContent => ({ textContent }));
    this.id = attributes.id || '';
    this.disabled = false;
    this.readOnly = false;
    this.events = [];
  }

  getAttribute(name) {
    return this.attributes[name] ?? (name === 'type' ? this.type : null);
  }

  get value() {
    return this._value;
  }

  set value(value) {
    this._value = value;
  }

  dispatchEvent(event) {
    this.events.push(event.type);
  }
}

function createContentContext(fields) {
  let listener;
  const context = vm.createContext({
    document: {
      querySelectorAll: () => fields,
      getElementById: () => null
    },
    chrome: {
      runtime: {
        onMessage: {
          addListener(callback) {
            listener = callback;
          }
        }
      }
    },
    HTMLInputElement: MockField,
    HTMLTextAreaElement: MockField,
    Event: class {
      constructor(type) {
        this.type = type;
      }
    }
  });

  return {
    execute() {
      vm.runInContext(contentScript, context);
    },
    send(profile) {
      let response;
      listener({ type: 'CAREERPILOT_FILL', profile }, {}, value => { response = value; });
      return JSON.parse(JSON.stringify(response));
    }
  };
}

test('fills recognizable profile fields on a generic employer application form', () => {
  const fields = [
    new MockField({ attributes: { name: 'candidate[first_name]' } }),
    new MockField({ attributes: { autocomplete: 'family-name' } }),
    new MockField({ type: 'email', attributes: { type: 'email' } }),
    new MockField({ labels: ['Phone number'] }),
    new MockField({ attributes: { placeholder: 'City' } }),
    new MockField({ attributes: { 'aria-label': 'LinkedIn profile' } }),
    new MockField({ attributes: { name: 'github_url' } }),
    new MockField({ attributes: { name: 'personal_website' } }),
    new MockField({ type: 'email', value: 'already@example.com', attributes: { type: 'email' } }),
    new MockField({ type: 'file', attributes: { type: 'file', name: 'resume' } }),
    new MockField({ labels: ['Company name'] }),
    new MockField({ labels: ['Reference email'], type: 'email', attributes: { type: 'email' } })
  ];
  const extension = createContentContext(fields);
  extension.execute();

  const result = extension.send({
    name: 'Alex Chen',
    email: 'alex@example.com',
    phone: '+1 555 0100',
    location: 'Bengaluru, India',
    linkedIn: 'https://linkedin.com/in/alexchen',
    github: 'https://github.com/alexchen',
    portfolio: 'https://alexchen.dev'
  });

  assert.deepEqual(result, { filled: 8, skipped: 1, detected: 9 });
  assert.deepEqual(fields.slice(0, 8).map(field => field.value), [
    'Alex', 'Chen', 'alex@example.com', '+1 555 0100', 'Bengaluru, India',
    'https://linkedin.com/in/alexchen', 'https://github.com/alexchen', 'https://alexchen.dev'
  ]);
  assert.equal(fields[8].value, 'already@example.com');
  assert.deepEqual(fields[0].events, ['input', 'change']);
  assert.equal(fields[9].value, '');
  assert.equal(fields[10].value, '');
  assert.equal(fields[11].value, '');
});

test('does not replace existing values and installs its message listener once', () => {
  const fields = [new MockField({
    value: 'Candidate supplied',
    attributes: { autocomplete: 'name' }
  })];
  const extension = createContentContext(fields);
  extension.execute();
  extension.execute();

  assert.deepEqual(extension.send({ name: 'Alex Chen' }), { filled: 0, skipped: 1, detected: 1 });
  assert.equal(fields[0].value, 'Candidate supplied');
});

test('reports no supported fields when the page has no recognized profile inputs', () => {
  const extension = createContentContext([new MockField({ attributes: { name: 'cover_letter' } })]);
  extension.execute();

  assert.deepEqual(extension.send({ name: 'Alex Chen', email: 'alex@example.com' }), {
    filled: 0,
    skipped: 0,
    detected: 0
  });
});
