// FakeData -- shared library, loaded by the popup (script tag) and the service
// worker (importScripts). Two globals:
//   generatePersona()  -> a coherent fake person (runs on the extension side)
//   fillPage(persona, options) -> injected into the page to classify + fill fields
// No network, no dependencies. All data is the local tables below.

const FD = {
  firstNames: ['James', 'Mary', 'Robert', 'Patricia', 'John', 'Jennifer', 'Michael', 'Linda',
    'David', 'Elizabeth', 'William', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica', 'Thomas',
    'Sarah', 'Chris', 'Karen', 'Daniel', 'Nancy', 'Matthew', 'Lisa', 'Anthony', 'Betty', 'Mark',
    'Sandra', 'Ava', 'Noah', 'Olivia', 'Liam', 'Emma', 'Mia', 'Ethan', 'Sofia', 'Lucas', 'Aria', 'Leo', 'Zoe'],
  lastNames: ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
    'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas',
    'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez',
    'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott',
    'Torres', 'Nguyen', 'Hill', 'Flores'],
  cities: ['Springfield', 'Riverside', 'Franklin', 'Greenville', 'Bristol', 'Clinton', 'Fairview',
    'Salem', 'Madison', 'Georgetown', 'Arlington', 'Ashland', 'Burlington', 'Manchester', 'Oakland',
    'Dayton', 'Auburn', 'Milton', 'Newport', 'Kingston', 'Dover', 'Hudson', 'Lakewood', 'Marion',
    'Cleveland', 'Bloomington', 'Concord', 'Winchester', 'Chester', 'Trenton'],
  states: [['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'], ['CA', 'California'],
    ['CO', 'Colorado'], ['CT', 'Connecticut'], ['DE', 'Delaware'], ['FL', 'Florida'], ['GA', 'Georgia'],
    ['HI', 'Hawaii'], ['ID', 'Idaho'], ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'], ['KS', 'Kansas'],
    ['KY', 'Kentucky'], ['LA', 'Louisiana'], ['ME', 'Maine'], ['MD', 'Maryland'], ['MA', 'Massachusetts'],
    ['MI', 'Michigan'], ['MN', 'Minnesota'], ['MS', 'Mississippi'], ['MO', 'Missouri'], ['MT', 'Montana'],
    ['NE', 'Nebraska'], ['NV', 'Nevada'], ['NH', 'New Hampshire'], ['NJ', 'New Jersey'], ['NM', 'New Mexico'],
    ['NY', 'New York'], ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'], ['OK', 'Oklahoma'],
    ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'], ['SC', 'South Carolina'],
    ['SD', 'South Dakota'], ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'], ['VT', 'Vermont'],
    ['VA', 'Virginia'], ['WA', 'Washington'], ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming']],
  streetNames: ['Main', 'Oak', 'Pine', 'Maple', 'Cedar', 'Elm', 'Washington', 'Lake', 'Hill', 'Park',
    'Sunset', 'Ridge', 'River', 'Meadow', 'Forest', 'Highland', 'Franklin', 'Church', 'Spring', 'Willow',
    'Birch', 'Valley', 'Union', 'Garden', 'Prospect', 'Chestnut', 'Walnut', 'Cherry', 'Center', 'Grove'],
  streetTypes: ['St', 'Ave', 'Rd', 'Blvd', 'Ln', 'Dr', 'Ct', 'Way', 'Pl', 'Ter'],
  companies: ['Acme Corp', 'Globex', 'Initech', 'Umbrella LLC', 'Soylent Industries', 'Hooli',
    'Vandelay Ltd', 'Wonka Group', 'Stark Solutions', 'Wayne Enterprises', 'Cyberdyne', 'Massive Dynamic',
    'Pied Piper', 'Aperture Labs', 'Gringotts', 'Prestige Worldwide', 'Dunder Mifflin', 'Bluth Company',
    'Nakatomi', 'Tyrell Corp', 'Oscorp', 'Wernham Hogg', 'Vehement Capital', 'Sterling Cooper', 'Los Pollos'],
  jobs: ['Software Engineer', 'Product Manager', 'Designer', 'Accountant', 'Teacher', 'Nurse',
    'Consultant', 'Analyst', 'Project Manager', 'Marketing Lead', 'Sales Director', 'Data Scientist',
    'Writer', 'Architect', 'Operations Manager', 'Recruiter', 'Attorney', 'Electrician', 'Chef',
    'Photographer', 'Pharmacist', 'Researcher', 'Developer', 'Coordinator', 'Administrator'],
  domains: ['example.com', 'mailinator.com', 'test.dev', 'inbox.test', 'demo.email', 'sample.org'],
  words: ['Sample', 'Placeholder', 'Draft', 'Untitled', 'Demo', 'Test', 'General', 'Misc', 'Notes', 'Item'],
  lorem: ['lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing', 'elit', 'sed', 'do',
    'eiusmod', 'tempor', 'incididunt', 'labore', 'magna', 'aliqua', 'enim', 'minim', 'veniam', 'quis',
    'nostrud', 'ullamco', 'laboris', 'nisi', 'aliquip', 'commodo', 'consequat', 'aute', 'irure', 'reprehenderit']
};

function fdRand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function fdInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function fdPad2(n) { return String(n).padStart(2, '0'); }

function fdLuhnCheck(numStr) {
  let sum = 0;
  let dbl = true;
  for (let i = numStr.length - 1; i >= 0; i--) {
    let d = +numStr[i];
    if (dbl) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
    dbl = !dbl;
  }
  return (10 - (sum % 10)) % 10;
}
function fdMakeCard() {
  let s = '4';
  for (let i = 0; i < 14; i++) s += fdInt(0, 9);
  const full = s + fdLuhnCheck(s);
  return full.replace(/(.{4})/g, '$1 ').trim();
}
function fdMakePassword() {
  const U = 'ABCDEFGHJKLMNPQRSTUVWXYZ', L = 'abcdefghijkmnpqrstuvwxyz', D = '23456789', S = '!@#$%^&*';
  const all = U + L + D + S;
  let p = fdRand(U.split('')) + fdRand(L.split('')) + fdRand(D.split('')) + fdRand(S.split(''));
  for (let i = 0; i < 10; i++) p += all[Math.floor(Math.random() * all.length)];
  return p.split('').sort(() => Math.random() - 0.5).join('');
}
function fdSentence() {
  const n = fdInt(8, 16);
  const out = [];
  for (let i = 0; i < n; i++) out.push(fdRand(FD.lorem));
  const s = out.join(' ');
  return s.charAt(0).toUpperCase() + s.slice(1) + '.';
}

function generatePersona() {
  const first = fdRand(FD.firstNames);
  const last = fdRand(FD.lastNames);
  const [stateAbbr, stateName] = fdRand(FD.states);
  const city = fdRand(FD.cities);
  const street = fdInt(100, 9899) + ' ' + fdRand(FD.streetNames) + ' ' + fdRand(FD.streetTypes);
  const domain = fdRand(FD.domains);
  const emailUser = (first + '.' + last).toLowerCase().replace(/[^a-z.]/g, '') + (Math.random() < 0.5 ? fdInt(1, 99) : '');
  const year = fdInt(1956, 2003), month = fdInt(1, 12), day = fdInt(1, 28);

  return {
    firstName: first,
    lastName: last,
    fullName: first + ' ' + last,
    email: emailUser + '@' + domain,
    username: (first[0] + last).toLowerCase().replace(/[^a-z]/g, '') + fdInt(1, 999),
    password: fdMakePassword(),
    phone: '(' + fdInt(201, 989) + ') ' + fdInt(201, 989) + '-' + String(fdInt(0, 9999)).padStart(4, '0'),
    street: street,
    address2: 'Apt ' + fdInt(1, 999),
    city: city,
    state: stateName,
    stateAbbr: stateAbbr,
    zip: String(fdInt(1000, 99999)).padStart(5, '0'),
    country: 'United States',
    company: fdRand(FD.companies),
    jobTitle: fdRand(FD.jobs),
    website: 'https://www.' + (first + last).toLowerCase().replace(/[^a-z]/g, '') + '.' + fdRand(['com', 'io', 'dev', 'net']),
    age: 2026 - year,
    dob: fdPad2(month) + '/' + fdPad2(day) + '/' + year,
    dobISO: year + '-' + fdPad2(month) + '-' + fdPad2(day),
    ssn: fdInt(100, 899) + '-' + fdPad2(fdInt(1, 99)) + '-' + String(fdInt(1, 9999)).padStart(4, '0'),
    cardNumber: fdMakeCard(),
    cardExp: fdPad2(fdInt(1, 12)) + '/' + fdInt(27, 31),
    cvv: String(fdInt(0, 999)).padStart(3, '0'),
    color: '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0'),
    message: fdSentence(),
    words: fdRand(FD.words) + ' ' + fdRand(FD.words)
  };
}

// Injected into the page. Self-contained: uses only `persona` (data) + `options`.
function fillPage(persona, options) {
  options = options || {};
  const overwrite = options.overwrite !== false;
  const doControls = options.controls !== false;
  const onlyVisible = options.onlyVisible !== false;
  const scope = options.scope || 'page';

  function visible(el) {
    if ((el.type || '').toLowerCase() === 'hidden') return false;
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }
  function labelText(el) {
    let t = '';
    try {
      if (el.id) { const l = document.querySelector('label[for="' + CSS.escape(el.id) + '"]'); if (l) t += ' ' + l.textContent; }
    } catch (_) { /* ignore */ }
    const wrap = el.closest && el.closest('label');
    if (wrap) t += ' ' + wrap.textContent;
    if (el.getAttribute('aria-label')) t += ' ' + el.getAttribute('aria-label');
    const lb = el.getAttribute('aria-labelledby');
    if (lb) { const e = document.getElementById(lb); if (e) t += ' ' + e.textContent; }
    return t;
  }
  function signal(el) {
    return [el.name, el.id, el.getAttribute('placeholder'), el.getAttribute('autocomplete'), labelText(el), el.className]
      .filter(Boolean).join(' ').toLowerCase();
  }
  function classify(el) {
    const acMap = {
      'given-name': 'firstName', 'additional-name': 'firstName', 'family-name': 'lastName', 'name': 'fullName',
      'email': 'email', 'tel': 'phone', 'tel-national': 'phone', 'street-address': 'street',
      'address-line1': 'street', 'address-line2': 'address2', 'address-level2': 'city', 'address-level1': 'state',
      'postal-code': 'zip', 'country': 'country', 'country-name': 'country', 'organization': 'company',
      'organization-title': 'jobTitle', 'username': 'username', 'new-password': 'password',
      'current-password': 'password', 'bday': 'dobISO', 'url': 'website', 'cc-number': 'cardNumber',
      'cc-exp': 'cardExp', 'cc-csc': 'cvv', 'cc-name': 'fullName'
    };
    const ac = (el.getAttribute('autocomplete') || '').toLowerCase();
    for (const tok of ac.split(/\s+/)) if (acMap[tok]) return acMap[tok];

    const type = (el.type || '').toLowerCase();
    if (type === 'email') return 'email';
    if (type === 'tel') return 'phone';
    if (type === 'url') return 'website';
    if (type === 'password') return 'password';
    if (type === 'color') return 'color';

    const s = signal(el);
    const rules = [
      ['email', /e-?mail/],
      ['firstName', /first.?name|given.?name|\bfname\b|forename/],
      ['lastName', /last.?name|surname|family.?name|\blname\b/],
      ['cvv', /cvv|cvc|csc|security.?code/],
      ['cardExp', /exp(iry|iration)?|\bexp\b/],
      ['cardNumber', /card.?number|cc.?number|credit.?card|\bcardno\b/],
      ['phone', /phone|mobile|\btel\b|cell/],
      ['company', /company|organi[sz]ation|employer|business/],
      ['jobTitle', /job.?title|position|occupation|\brole\b/],
      ['address2', /address.?2|addr.?2|line.?2|\bapt\b|suite|\bunit\b/],
      ['street', /street|address.?1|addr.?1|address.?line.?1|^address$|\baddress\b/],
      ['city', /\bcity\b|town|locality/],
      ['state', /\bstate\b|province|region/],
      ['zip', /\bzip\b|postal|postcode/],
      ['country', /country/],
      ['dobISO', /birth|\bdob\b|b-?day/],
      ['age', /\bage\b/],
      ['username', /user.?name|\buser\b|login|handle/],
      ['password', /pass.?word|passwd|\bpass\b/],
      ['website', /website|\burl\b|homepage/],
      ['ssn', /ssn|social.?security/],
      ['fullName', /full.?name|your.?name|contact.?name|cardholder|^name$|\bname\b/],
      ['message', /message|comment|feedback|\babout\b|\bbio\b|description|notes|\bbody\b/]
    ];
    for (const [kind, re] of rules) if (re.test(s)) return kind;
    return '';
  }
  function valueFor(kind) {
    const v = {
      firstName: persona.firstName, lastName: persona.lastName, fullName: persona.fullName,
      email: persona.email, phone: persona.phone, company: persona.company, jobTitle: persona.jobTitle,
      street: persona.street, address2: persona.address2, city: persona.city, state: persona.state,
      zip: persona.zip, country: persona.country, username: persona.username, password: persona.password,
      website: persona.website, age: String(persona.age), ssn: persona.ssn, cardNumber: persona.cardNumber,
      cardExp: persona.cardExp, cvv: persona.cvv, color: persona.color, dobISO: persona.dobISO,
      dob: persona.dob, message: persona.message
    };
    return kind in v ? v[kind] : persona.words;
  }
  function setValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) desc.set.call(el, value); else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function fillSelect(sel) {
    const opts = Array.from(sel.options).filter((o) => !o.disabled && o.value !== '' && !/please|select|choose|--/i.test(o.textContent));
    if (!opts.length) return false;
    const s = signal(sel);
    let chosen = null;
    if (/\bstate\b|province/.test(s)) chosen = opts.find((o) => o.value === persona.stateAbbr || o.textContent.trim() === persona.state);
    if (!chosen && /country/.test(s)) chosen = opts.find((o) => /united states|usa|^us$/i.test(o.textContent) || /^us$/i.test(o.value));
    if (!chosen) chosen = opts[Math.floor(Math.random() * opts.length)];
    sel.value = chosen.value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  let filled = 0;
  const targets = scope === 'active'
    ? (document.activeElement ? [document.activeElement] : [])
    : Array.from(document.querySelectorAll('input, textarea, select'));

  for (const el of targets) {
    if (!(el instanceof HTMLElement)) continue;
    if (el.disabled || el.readOnly) continue;
    const tag = el.tagName.toLowerCase();
    const type = (el.type || '').toLowerCase();
    if (['hidden', 'submit', 'button', 'reset', 'image', 'file'].indexOf(type) !== -1) continue;
    if (onlyVisible && !visible(el)) continue;

    if (tag === 'select') { if (doControls && fillSelect(el)) filled++; continue; }
    if (type === 'checkbox') {
      if (doControls && el.required && !el.checked) { el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); filled++; }
      continue;
    }
    if (type === 'radio') continue; // handled per-group below
    if (type === 'range') {
      const mn = Number(el.min || 0), mx = Number(el.max || 100);
      setValue(el, String(Math.floor(mn + Math.random() * (mx - mn)))); filled++; continue;
    }
    if (type === 'color') { setValue(el, persona.color); filled++; continue; }

    if (!overwrite && el.value && el.value.trim() !== '') continue;

    const kind = classify(el);
    let val = valueFor(kind);
    if (type === 'number' && !/^-?\d/.test(String(val))) val = String(persona.age || Math.floor(Math.random() * 999) + 1);
    if (type === 'date') val = persona.dobISO;
    if (type === 'month') val = persona.dobISO.slice(0, 7);
    if (type === 'week') val = persona.dobISO.slice(0, 4) + '-W' + String(Math.floor(Math.random() * 52) + 1).padStart(2, '0');
    if (type === 'time') val = ('0' + Math.floor(Math.random() * 24)).slice(-2) + ':' + ('0' + Math.floor(Math.random() * 60)).slice(-2);
    setValue(el, String(val));
    filled++;
  }

  if (doControls && scope !== 'active') {
    const groups = {};
    let anon = 0;
    document.querySelectorAll('input[type=radio]').forEach((r) => {
      if (r.disabled) return;
      if (onlyVisible && !visible(r)) return;
      const key = r.name || ('__anon' + (anon++));
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    });
    for (const name in groups) {
      const list = groups[name];
      if (list.some((r) => r.checked)) continue;
      const pick = list[Math.floor(Math.random() * list.length)];
      pick.checked = true;
      pick.dispatchEvent(new Event('change', { bubbles: true }));
      filled++;
    }
  }

  return filled;
}
