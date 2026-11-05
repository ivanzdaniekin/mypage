import { config } from './leads-config.js';
const dialog = document.querySelector('#application');
const closeButton = dialog.querySelector('.application-close');
const applicationHash = '#application';
const form = document.querySelector('#candidate-form');
const status = document.querySelector('#application-status');
const countryCode = form.querySelector('#candidate-country-code');
const otherCode = form.querySelector('#candidate-other-code');
const button = form.querySelector('button[type="submit"]');
const ukrainian = document.documentElement.lang === 'uk';
const copy = ukrainian ? {
  instructions: 'Заповніть поля та підтвердьте згоду. Не надсилайте документи або чутливі дані.',
  widgetError: 'Перевірка захисту недоступна. Спробуйте пізніше.',
  widgetLoadError: 'Перевірка захисту не завантажилася. Надсилання недоступне.',
  missingToken: 'Пройдіть перевірку захисту перед надсиланням.',
  pending: 'Очікуємо підтвердження збереження заявки…',
  saved: 'Заявку збережено. Повторно надсилати її не потрібно.',
  rate: 'Забагато запитів. Зачекайте 10 хвилин.',
  captcha: 'Перевірку захисту не прийнято. Пройдіть її ще раз перед надсиланням.',
  invalidContact: 'Перевірте код країни й номер телефону. Для +48 введіть 9 цифр після коду.',
  validation: 'Перевірте ім’я, контакт, місто, опис роботи та згоду.',
  disabled: 'Приймання заявок тимчасово призупинено. Спробуйте пізніше.',
  duplicate: 'Схожа заявка вже існує. Повторно надсилати її не потрібно.',
  erased: 'Цю заявку видалено або згоду відкликано. Не надсилайте її повторно.',
  unconfirmed: 'Підтвердження не отримано. Заявка могла зберегтися. Не надсилайте її повторно й не оновлюйте сторінку. Для перевірки повідомте рекрутеру номер заявки: '
} : {
  instructions: 'Заполните поля и подтвердите согласие. Не отправляйте документы или чувствительные сведения.',
  widgetError: 'Проверка защиты недоступна. Попробуйте позже.',
  widgetLoadError: 'Проверка защиты не загрузилась. Отправка недоступна.',
  missingToken: 'Пройдите проверку защиты перед отправкой.',
  pending: 'Ожидаем подтверждение сохранения заявки…',
  saved: 'Заявка сохранена. Повторно отправлять её не нужно.',
  rate: 'Слишком много запросов. Подождите 10 минут.',
  captcha: 'Проверка защиты не принята. Пройдите её заново перед отправкой.',
  invalidContact: 'Проверьте код страны и номер телефона. Для +48 введите 9 цифр после кода.',
  validation: 'Проверьте поля: имя, контакт, город, работу и согласие.',
  disabled: 'Приём заявок временно выключен. Попробуйте позже.',
  duplicate: 'Похожая заявка уже существует. Повторно отправлять её не нужно.',
  erased: 'Эта заявка удалена или согласие отозвано. Не отправляйте её повторно.',
  unconfirmed: 'Подтверждение не получено: заявка могла сохраниться. Не отправляйте её повторно и не обновляйте страницу. Для проверки сообщите рекрутеру номер заявки: '
};
let widget, turnstileToken = '', busy = false, attempt = null, finished = false, uncertain = false;
const locked = () => busy || finished || uncertain;
const ready = config.enabled && config.privacyApproved && config.privacyVersion &&
  form.dataset.privacyVersion === config.privacyVersion &&
  /^https:\/\//.test(config.endpoint) && config.turnstileSiteKey;
let widgetLoading = false;
let opener;
status.textContent = ready ? copy.instructions : copy.disabled;
status.tabIndex = -1;

function showSubmissionStatus(message) {
  status.textContent = message;
  if (dialog.open) {
    status.focus({preventScroll: true});
    status.scrollIntoView({block: 'nearest'});
  }
}

function clearToken() {
  turnstileToken = '';
  button.disabled = true;
}

function invalidateToken(message) {
  clearToken();
  if (!attempt && !locked()) status.textContent = message;
}

function prepareTurnstile() {
  if (!ready || widget !== undefined || widgetLoading || !dialog.open) return;
  if (window.turnstile) {
    widget = window.turnstile.render('#anti-spam', {
      sitekey: config.turnstileSiteKey, action: 'candidate', size: 'compact',
      ...(ukrainian ? {language:'uk'} : {}),
      callback: token => {
        turnstileToken = token;
        button.disabled = locked() || !token;
        if (status.textContent === copy.widgetError || status.textContent === copy.missingToken) {
          status.textContent = copy.instructions;
        }
      },
      'expired-callback': () => invalidateToken(copy.missingToken),
      'error-callback': () => invalidateToken(copy.widgetError)
    });
    return;
  }
  widgetLoading = true;
  status.textContent = copy.instructions;
  const script = document.createElement('script');
  script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  script.onload = () => {
    widgetLoading = false;
    if (window.turnstile) prepareTurnstile();
    else status.textContent = copy.widgetLoadError;
  };
  script.onerror = () => {
    widgetLoading = false;
    script.remove();
    status.textContent = copy.widgetLoadError;
  };
  document.head.append(script);
}

function syncDialog() {
  if (location.hash === applicationHash) {
    if (!dialog.open) dialog.showModal();
    prepareTurnstile();
  } else if (dialog.open) {
    dialog.close();
  }
}

document.querySelectorAll('a[href="#application"]').forEach(link => {
  link.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey ||
        event.shiftKey || event.altKey) return;
    event.preventDefault();
    opener = link;
    if (location.hash !== applicationHash) {
      const url = new URL(location.href);
      url.hash = applicationHash;
      history.pushState({applicationFrom: location.hash}, '', url);
    }
    syncDialog();
  });
});
closeButton.addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => {
  if (dialog.open) return;
  if (location.hash === applicationHash) {
    const url = new URL(location.href);
    url.hash = history.state?.applicationFrom ?? '';
    history.replaceState(null, '', url);
    (opener ?? document.querySelector('a[href="#application"]'))?.focus({preventScroll: true});
  }
  opener = undefined;
});
window.addEventListener('hashchange', syncDialog);
syncDialog();

function syncCountryCode() {
  const custom = countryCode.value === 'other';
  otherCode.hidden = !custom;
  otherCode.disabled = !custom;
}
countryCode.addEventListener('change', syncCountryCode);
syncCountryCode();

function formatPhone(data) {
  const code = data.countryCode === 'other' ? data.otherCode.trim().replace(/^\+/, '') : data.countryCode;
  const number = data.phoneNumber.trim();
  if (!/^[1-9]\d{0,2}$/.test(code) || !/^[\d ()-]+$/.test(number)) return null;
  const digits = number.replace(/\D/g, '');
  const phone = code + digits;
  if (!digits || phone.length < 7 || phone.length > 15 || (code === '48' && digits.length !== 9)) return null;
  return '+' + phone;
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (locked() || !form.reportValidity()) return;
  if (!ready) { showSubmissionStatus(copy.disabled); return; }
  const data = Object.fromEntries(new FormData(form));
  const contact = formatPhone(data);
  if (!contact) {
    showSubmissionStatus(copy.invalidContact);
    return;
  }
  const token = turnstileToken;
  if (!token) { showSubmissionStatus(copy.missingToken); return; }
  // The Worker accepts single-line text. Keep the original draft in the textarea.
  const job = data.job.replace(/[\r\n\t]+/g, ' ').trim();
  const fields = {name:data.name.trim(), contact, city:data.city.trim(), job,
    consent:data.consent === 'yes', privacyVersion:config.privacyVersion};
  const serialized = JSON.stringify(fields);
  // Preserve request ID on retry of identical content; never store personal data in browser storage.
  if (!attempt || attempt.content !== serialized) attempt = {id:crypto.randomUUID(),content:serialized};
  const id = attempt.id;
  busy = true;
  clearToken();
  showSubmissionStatus(copy.pending);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch(config.endpoint, {method:'POST',credentials:'omit',
      headers:{'Content-Type':'application/json'},signal:controller.signal,
      body:JSON.stringify({...fields, requestId:id, website:data.website,
        turnstileToken:token})});
    const receipt = await response.json();
    if (!response.ok || receipt.saved !== true || receipt.requestId !== id) {
      if (response.status === 429) throw new Error('rate');
      if (response.status === 403) throw new Error('captcha');
      if (response.status === 400 || response.status === 413) throw new Error('validation');
      if (response.status === 503) throw new Error('disabled');
      if (response.status === 409 && receipt.code === 'DUPLICATE') throw new Error('duplicate');
      if (response.status === 410 && receipt.code === 'ERASED') throw new Error('erased');
      throw new Error('unconfirmed');
    }
    finished = true;
    form.reset();
    syncCountryCode();
    form.hidden = true;
    showSubmissionStatus(copy.saved);
  } catch (error) {
    const outcome = error.message;
    const known = ['rate', 'captcha', 'validation', 'disabled', 'duplicate', 'erased'].includes(outcome);
    const message = known ? copy[outcome] : null;
    uncertain = !message || outcome === 'duplicate' || outcome === 'erased';
    showSubmissionStatus(message || copy.unconfirmed + id);
  } finally {
    clearTimeout(timer);
    busy = false;
    clearToken();
    if (!locked()) window.turnstile.reset(widget);
  }
});
