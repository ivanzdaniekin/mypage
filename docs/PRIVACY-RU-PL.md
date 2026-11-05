# Политика конфиденциальности / Polityka prywatności

Версия: **mypage-privacy-2026-11-04-v1**. Подготовленная дата редакции: **4 ноября 2026**. Дата вступления в силу / Data wejścia w życie: **2026-11-05**. [Опубликованная редакция / Opublikowana wersja](https://ivanzdaniekin.github.io/mypage/privacy/). Имя, контакты, единоличный доступ, срок и основания утверждены владельцем. Неподтверждённые условия конкретных аккаунтов и международных передач перечислены отдельно в PROVIDERS-AND-TRANSFERS.md; текст не объявляет договор заключённым.

## Русский

### 1. Кто отвечает за данные и как связаться
Администратор персональных данных — Ivan Zdaniekin, физическое лицо, осуществляющее подбор кандидатов для работы в Польше. Контакт по вопросам данных и отзыва согласия: ivanz.astarta@gmail.com. Адрес для корреспонденции: aleja Powstańców Wielkopolskich 51, 85-090 Bydgoszcz, Polska.

### 2. Где и какие данные собираются
Политика охватывает рекламные формы Facebook и Instagram и форму сайта https://ivanzdaniekin.github.io/mypage/. Рекламные формы Meta могут запрашивать имя и фамилию, телефон, город и предпочтительную работу. Форма сайта запрашивает имя, телефон с кодом страны или Telegram, город и интересующую работу. При дальнейшем общении можно добровольно уточнить пожелания по трудоустройству.

Для формы сайта сохраняются также согласие, версия политики, время получения согласия сервером, идентификатор заявки и технический журнал сохранения и уведомлений. Для защиты используются IP-адрес, сведения запроса и результаты проверки Turnstile. В D1 записываются HMAC-идентификаторы, время и квитанции, а не исходные контактные поля. IP поступает Cloudflare и используется при антиспам-проверке. Служебные журналы поставщиков могут содержать IP и метаданные запросов. Собственные диагностические сообщения приложения содержат коды этапов и идентификатор заявки.

Не отправляйте PESEL, паспорт, документы, данные о здоровье и другие чувствительные сведения: форма их не требует.

### 3. Цели и правовые основания
Имя, контакты и пожелания используются для ответа на заявку, уточнения условий, подбора и предложения работы, а также согласованного повторного контакта в пределах срока хранения. Основание — добровольное согласие, статья 6(1)(a) GDPR/RODO. Эта форма не оформляет отдельного согласия на рекламную рассылку.

Защита от спама, злоупотреблений и повторных записей, безопасность и восстановление подтверждений служат законному интересу администратора поддерживать безопасный и работоспособный канал связи, статья 6(1)(f) GDPR/RODO. Такие технические проверки не оценивают профессиональную пригодность кандидата. Оценка законного интереса, необходимости и баланса прав документирована для описанных технических целей; она не распространяется на маркетинг или решения о найме.

### 4. Добровольность и согласие
Передача данных добровольна. Для обработки заявки нужны имя, способ связи, город, направление работы и согласие. Без них форма не отправит заявку. Согласие можно отозвать письмом на указанный email. Отзыв не влияет на законность обработки, выполненной до него. После отзыва обработка на основании согласия прекращается; данные удаляются, если нет другого применимого законного основания для их сохранения.

### 5. Кому доступны данные
Для рекламных форм используются Meta Platforms, для размещения сайта — GitHub Pages. Заявки сайта проходят через Cloudflare Worker, Turnstile и D1, затем Google Apps Script сохраняет их в Google Sheets и в техническом журнале. В подготовленной версии Telegram используется только для краткого уведомления с идентификатором заявки, без имени, контакта, города и работы. Идентификатор остаётся псевдонимными данными. Эта ветка выключена до подтверждения условий её использования.

Пользовательский доступ к Google Sheets и закрытой Telegram-группе имеет только владелец Ivan Zdaniekin. Поставщики сервисов обрабатывают данные в рамках своих функций и применимых условий. Данные не направляются потенциальным работодателям или другим рекрутерам автоматически; передача конкретному работодателю предварительно согласовывается с кандидатом на надлежащем основании.

### 6. Сроки и удаление
Заявки и согласия хранятся не более 6 месяцев с получения заявки, если согласие не отозвано раньше. Этот срок относится к Google Sheets, журналу с кодированной копией заявки, уведомлениям Telegram и управляемым администратором выгрузкам и резервным копиям. Кодирование base64 не является шифрованием.

Запланированная очистка активных строк Google и кодированной копии в журнале начинается за сутки до истечения 6 календарных месяцев, чтобы исправное регулярное выполнение укладывалось в этот предел. При подтверждённом отзыве согласия или запросе на удаление обработка прекращается, и удаление ставится в очередь без ожидания этого срока, если нет другого действительного основания. Обезличивание полей не подменяется скрытием строки: поля очищаются, а старый requestId временно блокируется от восстановления.

D1-квитанции хранятся до 7 дней плюс интервал ежедневной очистки, счётчики — до 20 минут плюс этот интервал. После удаления минимальные UUID-маркеры сверки могут сохраняться до 7 дней после завершения процесса на основании безопасности, без исходных полей заявки. Уведомления Telegram запланировано удалять значительно раньше 6 месяцев; неполученное подтверждение и ограничения API требуют ручной проверки владельцем.

Очистка текущих ячеек не стирает историю Google Sheets и все резервные копии провайдера. История, именованные версии, выгрузки и копии владельца подлежат отдельной проверке и удалению; настройки и доступность удаления истории зависят от аккаунта. Восстановление резервной копии не должно возвращать удалённые заявки в обработку. Сроки технических копий поставщиков определяются их применимыми условиями и не объявляются равными 6 месяцам хранения активных заявок. Сведения и запрос на удаление доступны по email контролёра.

### 7. Обработка за пределами ЕЭЗ
Используемые поставщики могут обрабатывать данные за пределами ЕЭЗ. GitHub указывает GitHub, Inc./GitHub B.V.; Cloudflare публикует DPA Cloudflare, Inc.; Google — отдельные потребительские условия и Cloud DPA для соответствующих услуг; Telegram называет Telegram Messenger Inc. и представителя EDPO в ЕЭЗ. Представитель в ЕЭЗ или расположение дата-центра сами по себе не являются механизмом международной передачи.

Официальные документы GitHub и Cloudflare описывают SCC и/или DPF при соответствующих условиях. Это описание опубликованных механизмов, а не утверждение их применения ко всем данным этого проекта. Для Meta и Google роль, юридическая сторона, договор и режим передачи определяются фактическим аккаунтом и услугой. Для Telegram применимость необходимого механизма к выбранной схеме ещё не подтверждена; уведомления остаются выключенными. Пока основания конкретной передачи не проверены, соответствующая обработка не активируется. Информацию о получателях, странах, применимых гарантиях и способе получения их копий можно запросить у контролёра.

Официальные уведомления: [GitHub](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement), [Cloudflare DPA](https://www.cloudflare.com/cloudflare-customer-dpa/), [Turnstile](https://www.cloudflare.com/turnstile-privacy-policy/), [Google](https://policies.google.com/privacy), [Google Cloud DPA](https://cloud.google.com/terms/data-processing-addendum/), [Telegram](https://telegram.org/privacy/eu), [Meta](https://www.facebook.com/privacy/policy/). Они не заменяют проверку условий аккаунта контролёра.

### 8. Ваши права
Можно запросить доступ, исправление, удаление или ограничение обработки. Переносимость данных применяется в предусмотренных законом случаях. Можно отозвать согласие; для обработки на основании законного интереса — заявить возражение с учётом своей ситуации. Для обращения используйте ivanz.astarta@gmail.com. При необходимости подтверждения личности запрашиваются только соразмерные сведения. Обычно ответ предоставляется в течение месяца; при законном продлении заявитель уведомляется.

Можно подать жалобу в польский надзорный орган Prezes Urzędu Ochrony Danych Osobowych (UODO), https://uodo.gov.pl/.

### 9. Автоматизированные решения и обновления
Решения о найме с юридическими или аналогичными существенными последствиями исключительно автоматизированно не принимаются. Антиспам может отклонить запрос; это не решение о трудоустройстве. При существенном изменении целей, получателей или условий обработки политика обновляется до начала соответствующей обработки. Актуальная утверждённая редакция доступна по ссылке возле согласия в форме.

## Polski

### 1. Administrator i kontakt
Administratorem danych jest Ivan Zdaniekin, osoba fizyczna zajmująca się doborem kandydatów do pracy w Polsce. Kontakt w sprawach danych i wycofania zgody: ivanz.astarta@gmail.com. Adres do korespondencji: aleja Powstańców Wielkopolskich 51, 85-090 Bydgoszcz, Polska.

### 2. Źródła i zakres danych
Polityka obejmuje formularze reklamowe Facebooka i Instagrama oraz formularz https://ivanzdaniekin.github.io/mypage/. Formularze Meta mogą zbierać imię i nazwisko, telefon, miasto i preferowaną pracę. Formularz witryny zbiera imię, telefon z numerem kierunkowym lub Telegram, miasto i rodzaj pracy. Podczas dalszej rozmowy można dobrowolnie doprecyzować oczekiwania zawodowe.

Dla formularza witryny zapisywane są także zgoda, wersja polityki, czas otrzymania zgody przez serwer, identyfikator zgłoszenia oraz dziennik zapisu i powiadomień. Do ochrony wykorzystywane są adres IP, metadane żądania i wynik Turnstile. D1 przechowuje identyfikatory HMAC, czas i potwierdzenia, a nie jawne dane kontaktowe. Cloudflare otrzymuje IP i wykorzystuje go przy kontroli antyspamowej. Logi usługodawców mogą zawierać IP i metadane. Własne komunikaty diagnostyczne aplikacji zawierają kody etapów i identyfikator zgłoszenia.

Nie przesyłaj numeru PESEL, paszportu, dokumentów, danych o zdrowiu ani innych danych szczególnych kategorii: formularz ich nie wymaga.

### 3. Cele i podstawy prawne
Imię, kontakt i preferencje służą odpowiedzi na zgłoszenie, ustaleniu warunków, doborowi i przedstawieniu pracy oraz uzgodnionemu ponownemu kontaktowi w okresie przechowywania. Podstawą jest dobrowolna zgoda, art. 6 ust. 1 lit. a RODO. Formularz nie stanowi odrębnej zgody na reklamowe wysyłki.

Ochrona przed spamem, nadużyciami i duplikatami, bezpieczeństwo oraz odtwarzanie potwierdzeń służą prawnie uzasadnionemu interesowi administratora polegającemu na utrzymaniu bezpiecznego i działającego kanału kontaktu, art. 6 ust. 1 lit. f RODO. Kontrole techniczne nie oceniają przydatności zawodowej. Ocena uzasadnionego interesu, niezbędności i równowagi praw została udokumentowana dla tych celów technicznych; nie obejmuje marketingu ani decyzji o zatrudnieniu.

### 4. Dobrowolność i zgoda
Podanie danych jest dobrowolne. Obsługa zgłoszenia wymaga imienia, kontaktu, miasta, rodzaju pracy i zgody. Bez nich formularz nie wyśle zgłoszenia. Zgodę można wycofać e-mailem. Nie wpływa to na zgodność przetwarzania przed wycofaniem. Przetwarzanie oparte na zgodzie ustaje, a dane są usuwane, chyba że istnieje inna właściwa podstawa prawna ich przechowywania.

### 5. Odbiorcy i usługi
Formularze reklamowe korzystają z Meta Platforms, a hosting witryny z GitHub Pages. Zgłoszenia witryny przechodzą przez Cloudflare Worker, Turnstile i D1, następnie Google Apps Script zapisuje je w Arkuszach Google i dzienniku technicznym. Przygotowana wersja przekazuje do Telegram wyłącznie krótkie powiadomienie z identyfikatorem zgłoszenia, bez imienia, kontaktu, miasta i pracy. Identyfikator nadal jest danymi pseudonimowymi. Ten kanał pozostaje wyłączony do potwierdzenia warunków jego użycia.

Dostęp użytkownika do Arkuszy Google i zamkniętej grupy Telegram ma wyłącznie właściciel Ivan Zdaniekin. Usługodawcy przetwarzają dane w zakresie swoich funkcji i odpowiednich warunków. Dane nie są automatycznie przekazywane potencjalnym pracodawcom ani innym rekruterom. Przekazanie konkretnemu pracodawcy jest wcześniej uzgadniane z kandydatem na właściwej podstawie.

### 6. Przechowywanie i usuwanie
Zgłoszenia i zgody są przechowywane nie dłużej niż 6 miesięcy od otrzymania zgłoszenia, o ile zgoda nie zostanie wcześniej wycofana. Termin obejmuje Arkusze Google, dziennik z kodowaną kopią zgłoszenia, powiadomienia Telegram oraz eksporty i kopie zapasowe zarządzane przez administratora. Base64 nie jest szyfrowaniem.

Planowane usuwanie aktywnych wierszy Google i kodowanej kopii dziennika rozpoczyna się dobę przed upływem 6 miesięcy kalendarzowych, aby prawidłowe regularne wykonanie mieściło się w tym terminie. Po potwierdzonym wycofaniu zgody lub żądaniu usunięcia przetwarzanie ustaje, a usunięcie jest zlecane bez czekania na ten termin, chyba że istnieje inna ważna podstawa. Pola są czyszczone, a stary requestId tymczasowo blokowany przed odtworzeniem; ukrycie wiersza nie jest usunięciem.

Potwierdzenia D1: do 7 dni plus odstęp codziennego czyszczenia; liczniki: do 20 minut plus ten odstęp. Po usunięciu minimalne znaczniki UUID mogą pozostać do 7 dni od zakończenia procesu ze względów bezpieczeństwa, bez pierwotnych pól zgłoszenia. Powiadomienia Telegram mają być usuwane znacznie wcześniej niż po 6 miesiącach; brak potwierdzenia i ograniczenia API wymagają ręcznej weryfikacji właściciela.

Wyczyszczenie bieżących komórek nie usuwa historii Arkuszy Google ani wszystkich kopii usługodawcy. Historia, nazwane wersje, eksporty i kopie właściciela wymagają osobnej kontroli i usuwania; dostępność usuwania historii zależy od konta. Przywrócenie backupu nie może ponownie uruchomić przetwarzania usuniętych zgłoszeń. Terminy kopii technicznych dostawców wynikają z właściwych warunków i nie są deklarowane jako identyczne z 6 miesiącami przechowywania aktywnych zgłoszeń. Informacje i żądania usunięcia: email administratora.

### 7. Przekazywanie poza EOG
Usługodawcy mogą przetwarzać dane poza EOG. GitHub wskazuje GitHub, Inc./GitHub B.V.; Cloudflare publikuje DPA Cloudflare, Inc.; Google odrębne warunki konsumenckie i Cloud DPA dla odpowiednich usług; Telegram wskazuje Telegram Messenger Inc. i przedstawiciela EDPO w EOG. Przedstawiciel w EOG ani lokalizacja centrum danych same w sobie nie stanowią mechanizmu transferu.

Dokumenty GitHub i Cloudflare opisują SCC i/lub DPF na określonych warunkach. Nie oznacza to potwierdzenia ich zastosowania do wszystkich danych projektu. Dla Meta i Google rola, podmiot, umowa i mechanizm zależą od konta i usługi. Właściwy mechanizm dla wybranej integracji Telegram nie został jeszcze potwierdzony; powiadomienia pozostają wyłączone. Przetwarzanie wymagające niezweryfikowanej podstawy transferu nie jest uruchamiane. Informacje o odbiorcach, krajach, gwarancjach i sposobie otrzymania ich kopii można uzyskać od administratora.

Oficjalne informacje: [GitHub](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement), [Cloudflare DPA](https://www.cloudflare.com/cloudflare-customer-dpa/), [Turnstile](https://www.cloudflare.com/turnstile-privacy-policy/), [Google](https://policies.google.com/privacy), [Google Cloud DPA](https://cloud.google.com/terms/data-processing-addendum/), [Telegram](https://telegram.org/privacy/eu), [Meta](https://www.facebook.com/privacy/policy/). Nie zastępują one weryfikacji warunków konta administratora.

### 8. Prawa
Można żądać dostępu, sprostowania, usunięcia i ograniczenia przetwarzania. Prawo do przenoszenia danych przysługuje w przypadkach określonych prawem. Można wycofać zgodę, a wobec przetwarzania opartego na uzasadnionym interesie wnieść sprzeciw z przyczyn związanych ze swoją sytuacją. Kontakt: ivanz.astarta@gmail.com. W razie potrzeby potwierdzenia tożsamości wymagane są tylko proporcjonalne informacje. Odpowiedź jest zwykle udzielana w ciągu miesiąca; o zgodnym z prawem przedłużeniu osoba zostaje poinformowana.

Można wnieść skargę do Prezesa Urzędu Ochrony Danych Osobowych (UODO), https://uodo.gov.pl/.

### 9. Decyzje automatyczne i aktualizacje
Nie są podejmowane wyłącznie automatyczne decyzje o zatrudnieniu wywołujące skutki prawne lub podobnie istotne. Kontrola antyspamowa może odrzucić żądanie, lecz nie jest decyzją o zatrudnieniu. Przy istotnej zmianie celów, odbiorców lub warunków polityka jest aktualizowana przed rozpoczęciem takiego przetwarzania. Aktualna zatwierdzona wersja jest dostępna przy zgodzie w formularzu.

## Основания редакции / Źródła redakcji

Предыдущие разделы Meta сохранены в PRIVACY-META-ARCHIVE.md. Данные оператора и срок 6 месяцев перенесены оттуда; новые юридические реквизиты не добавлялись. Права и информирование сверены с руководством EDPB: https://www.edpb.europa.eu/sme/be-compliant/respect-individuals-rights_en . Технические сведения основаны на коде проекта; применение поставщиками конкретных договоров, стран обработки и сроков не предполагается без проверки владельцем.
