# Заменить MinIO на SeaweedFS

Status: blocked
Owner: Codex

## Problem

Локальный запуск `docker compose up -d` блокируется скачиванием `minio/mc:latest`: Docker Hub возвращает `denied / unauthorized`. Проверенные официальные образы MinIO на Quay также недоступны. PostgreSQL доступен; его скачивание в исходном запуске прервалось после ошибки MinIO.

MinIO используется в локальном и production Compose, а также в API и frontend e2e. Требуется заменить его на SeaweedFS через S3 API, сохранив существующий контракт вложений.

## Scope

- Заменить MinIO в локальном и production Docker Compose на закреплённую версию SeaweedFS.
- Использовать конфигурацию для одного сервера, начиная с проверки пригодности `weed mini` в выбранной версии.
- Настроить постоянное хранение данных, credentials, создание приватного bucket и readiness.
- Обновить переменные окружения, deployment initializer и зависимости запуска, где они связаны с MinIO.
- Заменить `MinioContainer` в API и frontend e2e; удалить зависимость `@testcontainers/minio`, если она больше не используется.
- Проверить текущий S3-адаптер на SeaweedFS и вносить изменения в него только при подтверждённой несовместимости.
- Обновить документацию, контексты затронутых пакетов и записать решение в ADR.
- До переключения существующего окружения определить наличие вложений в MinIO. Если они есть, подготовить и проверить перенос объектов.

Кластеризация, высокая доступность, новые функции вложений и изменение доменной модели не входят в задачу. Перенос production-данных и переключение работающего окружения выполняются только после подготовки проверяемого плана и отдельного разрешения владельца окружения.

## Acceptance criteria

- [x] Выбрана закреплённая версия SeaweedFS; её образ доступен и поддерживает используемые параметры запуска.
- [ ] `docker compose up -d` запускает локальные PostgreSQL и SeaweedFS без зависимости от образов MinIO и `mc`.
- [ ] Production Compose использует SeaweedFS; backend стартует после готовности S3 endpoint и нужного bucket.
- [x] Credentials и bucket создаются предсказуемо; повторный запуск сохраняет данные и не меняет credentials.
- [x] Анонимные PUT, GET и перечисление объектов запрещены. Внутренние filer/master/admin endpoints не публикуются наружу в production.
- [x] S3 endpoint, используемый для подписанных ссылок, доступен браузеру. Если необходим reverse proxy, подпись сохраняет корректность через него.
- [ ] Браузерная загрузка через presigned PUT проходит с нужным Content-Type и CORS.
- [ ] Подтверждение загрузки через HEAD проверяет размер и MIME; неверные метаданные отклоняются существующим механизмом.
- [x] Presigned GET возвращает исходные байты и корректное имя файла, включая кириллицу; просроченные ссылки отклоняются.
- [ ] Удаление объекта и повторная обработка deletion outbox работают на SeaweedFS.
- [ ] Readiness приложения отражает недоступность S3 endpoint или bucket.
- [ ] API и frontend e2e используют SeaweedFS; сценарии вложений проходят на реальном хранилище.
- [x] GraphQL, tenant isolation и правила авторизации вложений сохранены; миграция БД не требуется либо её необходимость отдельно обоснована.
- [ ] Перезапуск контейнера сохраняет загруженные объекты; документирован способ резервного копирования и восстановления данных и метаданных SeaweedFS.
- [ ] Наличие существующих MinIO-данных установлено. Для окружения с данными подготовлены перенос, сверка целостности и план отката; старые volumes не удаляются автоматически.
- [x] Документация и ADR описывают реализованную конфигурацию; проверки и блокеры записаны ниже.
- [x] Выполнена полная verification gate для изменения нескольких пакетов; непрошедшие проверки сопровождаются точной командой и причиной.

## Constraints and context

- API уже использует `ObjectStorage` и AWS S3 SDK: `backend/api/src/infrastructure/object-storage/`.
- Используемые операции: presigned PUT/GET, HeadObject, DeleteObject и HeadBucket. SeaweedFS заявляет поддержку этих возможностей, но совместимость выбранной версии нужно подтвердить интеграционными проверками.
- Байты вложений остаются вне GraphQL; deletion outbox и авторизация сохраняются.
- Подписанные URL сейчас формируются из одного `S3_ENDPOINT`. Адрес контейнера, доступный только backend, нельзя выдавать браузеру.
- MinIO volumes несовместимы с форматом хранения SeaweedFS. Перенос выполняется через API с сохранением bucket/object keys, Content-Type и содержимого, а не подключением старого volume.
- Credentials, реальные `.env` и локальные данные не коммитить.
- Затронутые места: `docker-compose.yml`, `deploy/docker-compose.production.yml`, `deploy/init.sh`, `.env.example`, API e2e, `frontend/web/e2e/global-setup.ts`, зависимости workspace и документация.
- Официальные источники:
  - https://github.com/seaweedfs/seaweedfs/wiki/Amazon-S3-API
  - https://github.com/seaweedfs/seaweedfs/wiki/Quick-Start-with-weed-mini
  - https://github.com/seaweedfs/seaweedfs/wiki/S3-Credentials

## Implementation notes

2026-10-05: `draft → in-progress → blocked`. Реализация подготовлена; задача не помечена done, поскольку Docker-проверки и инвентаризация существующего MinIO недоступны.

### Изменения

- Закреплён `chrislusf/seaweedfs:4.48`. `docker manifest inspect chrislusf/seaweedfs:4.48` успешно получил multi-platform manifest. Параметры mini проверены по исходникам тега и официальному linux_amd64 бинарнику 4.48.
- Local/production Compose используют mini, постоянный `/data`, credentials из S3 переменных, предварительное создание bucket. Healthcheck проверяет наличие bucket через filer и отклонение анонимного S3 запроса. Нужные curl/LevelDB-конфигурация проверены по versioned Dockerfile/filer.toml. Внутренние порты не опубликованы.
- Production nginx публикует отдельный S3 listener на `S3_PORT`; Host с портом, URI и query сохраняются. `S3_PUBLIC_ENDPOINT` используется только при signing, `S3_ENDPOINT` — для HEAD/DELETE/readiness. init.sh требует PUBLIC_S3_ORIGIN и сохраняет прежние credentials при повторном запуске.
- В реальном PUT обнаружен `BadDigest`: SDK подписывал checksum пустого тела. В S3ObjectStorage установлен `requestChecksumCalculation: WHEN_REQUIRED`; после изменения реальный PUT прошёл.
- API и browser e2e переведены на GenericContainer SeaweedFS; зависимость @testcontainers/minio удалена через npm с обновлением lockfile. E2e очищают унаследованный S3_PUBLIC_ENDPOINT.
- Добавлена реальная compatibility suite и `scripts/migrate-object-storage.mjs` (inventory/copy/verify, SHA-256, размер/MIME, сверка totals). Перенос повторяемый, источник не изменяется. Скрипт проверен между временными bucket SeaweedFS; перенос из существующего MinIO пока не проверен.
- GraphQL SDL, frontend операции, Prisma schema, tenant/domain services и deletion outbox не изменены. Миграция БД не нужна.
- Обновлены README, contexts, development/deployment docs и ADR 0002. Документированы backup/restore и freeze/copy/verify/cutover/rollback. Старые MinIO volumes не удалены; реальные .env не изменены.

### Успешные проверки

- `npm run build`, `npm run typecheck`, `npm run lint`.
- `npm run codegen`, `npm run codegen:check`, `npm run test:web`: 14 файлов, 69 тестов.
- `npx vitest run backend/api/test --exclude '**/*.e2e-spec.ts' --exclude '**/*.integration-spec.ts'`: 6 файлов, 20 тестов.
- `SEAWEED_TEST_ENDPOINT=http://127.0.0.1:8333 npx vitest run --config backend/api/vitest.e2e.config.ts backend/api/test/seaweedfs.e2e-spec.ts`: 4 теста на официальном бинарнике 4.48. Проверены анонимные GET/PUT/list запреты, CORS OPTIONS, реальный presigned PUT, HEAD size/MIME, GET bytes/Cyrillic filename, proxy Host/signature, expiry, idempotent DELETE, missing-bucket readiness, copy/повторный copy/verify с SHA-256.
- Официальный бинарник mini остановлен и запущен с тем же data directory и credentials: ранее загруженные bytes и Content-Type прочитаны после перезапуска. Это проверка процесса, не Docker-volume lifecycle.
- `docker compose config --quiet` и production `docker compose --env-file /tmp/compose-production.env -f deploy/docker-compose.production.yml config --quiet` с фиктивными переменными; `sh -n deploy/init.sh`, `node --check scripts/migrate-object-storage.mjs`, `git diff --check`.
- init.sh выполнен в отдельном временном каталоге дважды: checksum .env сохранился, permissions 600. Реальная .env репозитория не затронута.
- Formatting изменённых файлов проверено отдельно; generated artifacts остались без diff.

### Полная verification gate и ограничения

Все семь команд gate выполнены. Build/typecheck/lint проходят; остальные результаты:

- `npm run format:check`: ошибки в 66 исходно неформатированных файлах `.agents/skills/`. Они доступны только для чтения; `npm run format` также упёрся в read-only filesystem. Форматирование собственных изменений проходит.
- `npm test`: 18 файлов проходят, 3 падают. Корневой Vitest захватывает `frontend/web/e2e/manual-qa-flow.spec.ts` (Playwright hooks), не разрешает alias `@/shared/api/graphql` в filters.test.ts и неверно исполняет browser-session-coordination storage-lease test без frontend test setup. Отдельный `npm run test:web` проходит. Ошибки воспроизводятся и вне sandbox.
- `npm run test:e2e`: `Could not find a working container runtime strategy`; Docker socket permission denied даже вне sandbox. Полный API flow, HEAD mismatch rejection, outbox retry и application readiness на SeaweedFS требуют повторного выполнения.
- `npm run test:coverage`: 6 unit suites проходят, контейнерные suites блокируются той же ошибкой runtime; coverage gate не пройден.
- `npm run test:web:e2e`: вне sandbox доходит до globalSetup, где PostgreSqlContainer падает с `Could not find a working container runtime strategy`.
- Отдельная браузерная проверка: `PLAYWRIGHT_BROWSERS_PATH=/tmp/seaweed-playwright node .scratch/seaweedfs-object-storage/verify-browser.mjs`. Chromium скачан в /tmp, но запуск заблокирован отсутствующей системной библиотекой `libnspr4.so`. CORS preflight проверен HTTP-клиентом; настоящий браузерный PUT/GET пока не подтверждён.
- `docker compose up -d`, реальный production startup, nginx container proxy, Docker persistence и backup/restore не подтверждены: daemon недоступен. Node HTTP proxy сохраняющий Host/URI проверен на реальном S3.

## Blockers

- Нужен рабочий Docker daemon: `docker info --format '{{.ServerVersion}}'` возвращает permission denied к `/var/run/docker.sock`, включая вызов вне sandbox. Нужен повтор полного API/browser e2e и контейнерных operations.
- Для браузера нужна системная библиотека libnspr4.so и остальные runtime-зависимости Chromium либо готовое Playwright окружение.
- Наличие существующих MinIO объектов неизвестно: нет доступа к daemon/старому endpoint. Выполнить inventory перед переключением; не считать bucket пустым. Production-перенос и cutover — только после отдельного разрешения владельца.
- Общая gate также требует устранения существующих ошибок корневой Vitest-конфигурации и форматирования read-only skill файлов.

### Исправление запуска Nest (2026-10-05, после сообщения пользователя)

Ошибка `UnknownDependenciesException: HttpAdapterHost` воспроизведена минимальным Nest + GraphQL bootstrap без БД/S3. API загружал `@nestjs/core` / common 11.2.7 из workspace, а GraphQL/Apollo — root 11.2.1; HttpAdapterHost этих копий не совпадал по identity. Root overrides закрепляют common/core/platform-express 11.2.7; lockfile пересобран npm, зависимости выровнены и установлены в текущем workspace. Platform-express также перенесён на общий уровень для загрузки стандартного HTTP-адаптера из core.

Добавлен `backend/api/test/graphql-bootstrap.spec.ts`: отдельный Node-процесс с реальным разрешением dependencies создаёт и инициализирует GraphQLModule. До исправления воспроизводил ошибку, после — проходит. Подтверждены минимальный repro, полноценное создание AppModule с тестовой конфигурацией (без подключения к БД) и GraphQL bootstrap после независимой чистой `npm ci --ignore-scripts --offline` установки в /tmp.

Повторно прошли build, typecheck, lint, 21 API unit/bootstrap тест и 69 frontend тестов. Полная gate выполнена повторно: root npm test сохраняет те же три frontend ошибки (19 файлов проходят); e2e/coverage по-прежнему блокирует Docker runtime; format:check — те же 66 skill файлов. Документированы правила выравнивания Nest в docs/development.md. Status остаётся blocked из-за ранее перечисленных внешних проверок; ошибка DI устранена.

### Проверка перед PR (2026-10-06)

Docker доступен вне sandbox: Docker Engine 29.8.2, production frontend/backend/PostgreSQL/SeaweedFS healthy. Предыдущие записи о недоступном daemon описывают прошлое состояние.

Повторно прошли build, typecheck, lint, codegen, codegen:check и test:web (69 тестов). После исправления обновления mapped port и S3 clients при Testcontainers restart все 4 SeaweedFS compatibility tests проходят, включая persistence. Первый полный API e2e прошёл 11 тестов; повторный запуск дал 3 ошибки: INTERNAL_SERVER_ERROR при concurrent createTestCase, BAD_USER_INPUT вместо VALIDATION_ERROR и зависимый summary test без созданных кейсов. Полный e2e gate остаётся красным.

Coverage: все 9 suites / 36 тестов прошли, но функции 92.6% ниже порога 95%. npm test вне sandbox: 19 файлов проходят, 3 падают по ранее описанным frontend runner/setup причинам. format:check: те же 66 skill файлов. Typecheck и lint повторены после исправления restart и проходят. Браузерный e2e, реальный MinIO inventory/cutover и backup/restore в этой проверке не выполнялись; статус остаётся blocked для незавершённых критериев.
