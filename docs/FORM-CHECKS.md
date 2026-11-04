# Проверки формы

- База ветки: origin/main 9351cdf (включает слитый SEO PR и файл подтверждения Google).
- `python3 tools/check_site.py`: PASS. Метаданные, canonical, Person, sitemap, внутренние ссылки/якоря и ресурсы сохранены.
- `node --check assets/leads.js`, `node --check backend/worker.mjs`: PASS.
- `node --test tests/leads.test.mjs`: 10 PASS. Offline SQLite и VM Apps Script; валидация, consent, honeypot, лимит размера, Turnstile, атомарные rate limits, idempotency, timeout, отсутствие ложного saved, запрет чужих redirect, корректный Google redirect, literal ячейки и pending Telegram outbox.
- `tests/form-browser.cjs`: 10 PASS: 5 ширин (320/375/390/768/1440), 5 искусственных транспортных сценариев. Без горизонтального переполнения. В отключённом режиме кнопка заблокирована и Turnstile не загружается. Изолированные ответы saved/negative/wrong-id/429/network failure: успех только при saved:true и совпадающем requestId.
- Скриншот `/private/tmp/mypage-form-mobile.png` просмотрен: фото, фон, соцссылки и существующие секции сохранены, форма читается. HTML главной ~15 КБ.
- Фотографии, favicon, SEO title/description, canonical, Person, sitemap, существующие социальные URL и файл подтверждения Google не менялись. CSS дополнен только стилями формы. CTA «Найти работу» намеренно переведён с канала к якорю формы.
- Реальные Google Sheets/Telegram/Apps Script/Cloudflare не подключались; квоты, реальная CORS-настройка Worker, сценарий Google authorization и live-триггер требуют отдельной проверки после согласования. Это подготовленный код, не работающая интеграция.

## Полный Code.gs — финальная доработка PR #2

- `node --test tests/*.test.mjs`: **17 PASS**. Полный Code.gs исполняется в VM с эмуляцией сервисов Google; Worker генерирует реальный HMAC для него. Проверены повтор UUID, lock contention, неопределённый исход append журнала / записи A:G / отметки SAVED, неправильный секрет/consent, размер, формулы, pending/backoff/sent Telegram, подписанный probe и закрытый TEST_ONLY gate.
- Это офлайн-тесты, не тест реальной Google Sheets транзакции или параллельных Apps Script executions. Ни одного сетевого теста с записью/Telegram не выполнено. Endpoint развёрнутого Apps Script не предоставлен.
- Подготовлены tests/live-contract-probe.mjs (подписанный Google Web App read-only probe) и tests/live-owner-test.cjs (одна синтетическая отправка после отдельного разрешения и ручного действия владельца).
- Node syntax checks Worker/live runners — PASS; SEO checker — PASS. Frontend/CSS/images в этой доработке не менялись, предыдущие браузерные проверки остаются применимы.
- Политика в docs/PRIVACY-RU-PL.md — полный проект, не опубликован. Google Sites и живой Apps Script не изменены.
- Public flags выключены; TEST_ONLY=true в шаблоне. Не проведены merge, deployment, создание ресурсов или запись секретов в Git.
