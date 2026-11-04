import { config } from './leads-config.js';
const form = document.querySelector('#candidate-form');
const status = document.querySelector('#application-status');
const button = form.querySelector('button[type="submit"]');
let widget, busy = false, attempt = null;
const ready = config.enabled && config.privacyApproved && config.privacyVersion &&
  /^https:\/\//.test(config.endpoint) && config.turnstileSiteKey;
if (ready) {
  status.textContent = 'Заполните поля и подтвердите согласие. Не отправляйте документы или чувствительные сведения.';
  const script = document.createElement('script');
  script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  script.onload = () => {
    widget = window.turnstile.render('#anti-spam', {
      sitekey: config.turnstileSiteKey, action: 'candidate',
      callback: () => { button.disabled = busy; },
      'expired-callback': () => { button.disabled = true; },
      'error-callback': () => { button.disabled = true; status.textContent = 'Проверка защиты недоступна. Попробуйте позже.'; }
    });
  };
  script.onerror = () => { status.textContent = 'Проверка защиты не загрузилась. Отправка недоступна.'; };
  document.head.append(script);
}
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!ready || busy || !form.reportValidity() || !window.turnstile) return;
  const data = Object.fromEntries(new FormData(form));
  const fields = {name:data.name.trim(), contact:data.contact.trim(), city:data.city.trim(), job:data.job.trim(),
    consent:data.consent === 'yes', privacyVersion:config.privacyVersion};
  const serialized = JSON.stringify(fields);
  // Preserve request ID on retry of identical content; never store personal data in browser storage.
  if (!attempt || attempt.content !== serialized) attempt = {id:crypto.randomUUID(),content:serialized};
  const id = attempt.id;
  busy = true; button.disabled = true;
  status.textContent = 'Ожидаем подтверждение сохранения заявки…';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch(config.endpoint, {method:'POST',credentials:'omit',
      headers:{'Content-Type':'application/json'},signal:controller.signal,
      body:JSON.stringify({...fields, requestId:id, website:data.website,
        turnstileToken:window.turnstile.getResponse(widget)})});
    const receipt = await response.json();
    if (!response.ok || receipt.saved !== true || receipt.requestId !== id) {
      if (response.status === 429) throw new Error('rate');
      throw new Error('unconfirmed');
    }
    status.textContent = 'Заявка сохранена. Повторно отправлять её не нужно.';
    form.reset(); attempt = null;
  } catch (error) {
    status.textContent = error.message === 'rate' ? 'Слишком много запросов. Подождите 10 минут.' :
      'Подтверждение сохранения не получено. Заявка могла сохраниться. Повторите отправку с теми же данными: повтор будет проверен сервером.';
  } finally {
    clearTimeout(timer); busy = false; button.disabled = true;
    window.turnstile.reset(widget);
  }
});
