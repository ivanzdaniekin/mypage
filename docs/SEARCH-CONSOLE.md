# Google Search Console — после одобрения PR и публикации

1. Откройте https://search.google.com/search-console/ и добавьте ресурс типа «Префикс URL»: https://ivanzdaniekin.github.io/mypage/ . Не выбирайте доменный ресурс github.io: DNS этого домена вам не принадлежит.
2. Выберите подтверждение HTML-тегом. Скопируйте выданный Google тег `<meta name="google-site-verification" content="...">` в `<head>` главной страницы. Токен не выдумывать. Внесите отдельным PR, одобрите и опубликуйте, затем нажмите «Подтвердить». Сохраните тег при последующих изменениях.
3. В разделе Sitemaps отправьте https://ivanzdaniekin.github.io/mypage/sitemap.xml . В карте только три готовые страницы. Городские Markdown-шаблоны не включены.
4. Через «Проверка URL» проверьте главную, /vakansii/ и /rabotodatelyam/. Запустите проверку опубликованного URL и запросите индексирование.
5. Проверьте доступность каждой страницы и изображений с телефона, а также выбор canonical в Search Console. Следите за отчётами индексирования и эффективности.

## robots.txt на проектном GitHub Pages

Файл в этом репозитории публикуется по /mypage/robots.txt. Google не использует robots.txt из подкаталога. Чтобы директива Sitemap работала через robots.txt, владелец должен при необходимости разместить файл в корне https://ivanzdaniekin.github.io/robots.txt через отдельный репозиторий ivanzdaniekin.github.io. Этот PR не создаёт и не меняет тот репозиторий. Отсутствие корневого robots.txt не запрещает обход: sitemap отправляется напрямую в Search Console. Перед публикацией проверить, не блокирует ли существующий корневой robots.txt путь /mypage/.

## Контент и вакансии

Подтвердите формулировки о направлениях подбора на главной. Предоставьте реальные текущие вакансии и сведения из docs/templates/vacancy.md. Для городов используйте соответствующие шаблоны; публикуйте только после появления полезного уникального содержания. После публикации страницы добавляйте в sitemap и внутреннее меню. JobPosting добавлять только по подтверждённым данным и требованиям Google, с обновлением при закрытии набора.

Индексирование и позиции не гарантированы технической оптимизацией. В этом PR нет аналитики, рекламы или платных сервисов.

Официальные источники:
- https://support.google.com/webmasters/answer/9008080
- https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
- https://developers.google.com/crawling/docs/robots-txt/create-robots-txt
- https://developers.google.com/search/docs/appearance/structured-data/job-posting
