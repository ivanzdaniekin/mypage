# Проверки формы

- База ветки: origin/main 9351cdf (включает слитый SEO PR и файл подтверждения Google).
- `python3 tools/check_site.py`: PASS. Метаданные, canonical, Person, sitemap, внутренние ссылки/якоря и ресурсы сохранены.
- `node --check assets/leads.js`, `node --check backend/worker.mjs`: PASS.
- `node --test tests/leads.test.mjs`: 10 PASS. Offline SQLite и VM Apps Script; валидация, consent, honeypot, лимит размера, Turnstile, атомарные rate limits, idempotency, timeout, отсутствие ложного saved, запрет чужих redirect, корректный Google redirect, literal ячейки и pending Telegram outbox.
- `tests/form-browser.cjs`: 10 PASS: 5 ширин (320/375/390/768/1440), 5 искусственных транспортных сценариев. Без горизонтального переполнения. В отключённом режиме кнопка заблокирована и Turnstile не загружается. Изолированные ответы saved/negative/wrong-id/429/network failure: успех только при saved:true и совпадающем requestId.
- Скриншот `/private/tmp/mypage-form-mobile.png` просмотрен: фото, фон, соцссылки и существующие секции сохранены, форма читается. HTML главной ~15 КБ.
- Фотографии, favicon, SEO title/description, canonical, Person, sitemap, существующие социальные URL и файл подтверждения Google не менялись. CSS дополнен только стилями формы. CTA «Найти работу» намеренно переведён с канала к якорю формы.
- Реальные Google Sheets/Telegram/Apps Script/Cloudflare не подключались; квоты, реальная CORS-настройка Worker, сценарий Google authorization и live-триггер требуют отдельной проверки после согласования. Это подготовленный код, не работающая интеграция.
