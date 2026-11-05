import { config } from './leads-config.js';
const form = document.querySelector('#candidate-form');
const status = document.querySelector('#application-status');
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
  validation: 'Проверьте поля: имя, контакт, город, работу и согласие.',
  disabled: 'Приём заявок временно выключен. Попробуйте позже.',
  duplicate: 'Похожая заявка уже существует. Повторно отправлять её не нужно.',
  erased: 'Эта заявка удалена или согласие отозвано. Не отправляйте её повторно.',
  unconfirmed: 'Подтверждение не получено: заявка могла сохраниться. Не отправляйте её повторно и не обновляйте страницу. Для проверки сообщите рекрутеру номер заявки: '
};
let widget, busy = false, attempt = null, finished = false, uncertain = false;
const locked = () => busy || finished || uncertain;
const ready = config.enabled && config.privacyApproved && config.privacyVersion &&
  form.dataset.privacyVersion === config.privacyVersion &&
  /^https:\/\//.test(config.endpoint) && config.turnstileSiteKey;
if (ready) {
  status.textContent = copy.instructions;
  const script = document.createElement('script');
  script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  script.onload = () => {
    widget = window.turnstile.render('#anti-spam', {
      sitekey: config.turnstileSiteKey, action: 'candidate',
      ...(ukrainian ? {language:'uk'} : {}),
      callback: () => { button.disabled = locked(); },
      'expired-callback': () => { button.disabled = true; },
      'error-callback': () => { button.disabled = true; status.textContent = copy.widgetError; }
    });
  };
  script.onerror = () => { status.textContent = copy.widgetLoadError; };
  document.head.append(script);
}
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!ready || locked() || !form.reportValidity() || !window.turnstile) return;
  const token = window.turnstile.getResponse(widget);
  if (!token) { button.disabled = true; status.textContent = copy.missingToken; return; }
  const data = Object.fromEntries(new FormData(form));
  const fields = {name:data.name.trim(), contact:data.contact.trim(), city:data.city.trim(), job:data.job.trim(),
    consent:data.consent === 'yes', privacyVersion:config.privacyVersion};
  const serialized = JSON.stringify(fields);
  // Preserve request ID on retry of identical content; never store personal data in browser storage.
  if (!attempt || attempt.content !== serialized) attempt = {id:crypto.randomUUID(),content:serialized};
  const id = attempt.id;
  busy = true; button.disabled = true;
  status.textContent = copy.pending;
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
    status.textContent = copy.saved;
    finished = true; form.reset();
  } catch (error) {
    const outcome = error.message;
    const known = ['rate', 'captcha', 'validation', 'disabled', 'duplicate', 'erased'].includes(outcome);
    const message = known ? copy[outcome] : null;
    uncertain = !message || outcome === 'duplicate' || outcome === 'erased';
    status.textContent = message || copy.unconfirmed + id;
  } finally {
    clearTimeout(timer); busy = false; button.disabled = true;
    window.turnstile.reset(widget);
  }
});
