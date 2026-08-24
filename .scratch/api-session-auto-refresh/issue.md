# Авторефреш сессии при API-запросах

Status: blocked
Owner: Codex

## Problem

Frontend уже умеет реактивно обновлять сессию после GraphQL-ошибки `UNAUTHENTICATED`, но не обновляет access-токен до отправки запроса и некорректно обрабатывает часть конкурентных и временных ошибок.

Текущая реализация может запускать лишние последовательные refresh после поздних ответов, завершает сессию при любой ошибке refresh и не координирует ротацию одноразового refresh-токена между вкладками. Межвкладочная гонка особенно опасна: повторное использование старого refresh-токена трактуется backend как reuse и отзывает все активные refresh-сессии пользователя.

Нужен безопасный проактивный и реактивный авторефреш, который сохраняет активную сессию неограниченно, не дублирует уже выполненные GraphQL mutations и согласованно работает при параллельных запросах и в нескольких вкладках.

## Scope

Включено:

- хранить срок действия access-токена в памяти вместе с самим токеном;
- перед каждым запросом основного Apollo Client проверять срок access-токена;
- проактивно обновлять сессию, если до истечения access-токена осталось менее 60 секунд;
- сохранить реактивный refresh после `UNAUTHENTICATED` как защитный механизм;
- повторять исходную GraphQL-операцию не более одного раза и только при отсутствии `data` в ошибочном ответе;
- объединять конкурентные refresh в один запрос внутри вкладки;
- различать поздний `UNAUTHENTICATED` от запроса со старым поколением токена и реальную необходимость нового refresh;
- координировать refresh, обновление токенов и завершение сессии между вкладками;
- использовать `Web Locks` и `BroadcastChannel` как основной межвкладочный механизм;
- добавить fallback на lease и эфемерные сообщения через `localStorage`/`storage` event;
- синхронизировать logout и окончательное истечение сессии во всех вкладках;
- сохранять сессию при временных ошибках refresh;
- добавить unit- и browser/e2e-покрытие согласованных сценариев.

Исключено:

- изменение GraphQL schema, refresh mutation или backend auth-модели;
- абсолютный предел длительности активной сессии;
- хранение access-токена в постоянном browser storage;
- скрытые многократные retry refresh или исходной GraphQL-операции;
- автоматический повтор GraphQL-операции, вернувшей одновременно `data` и `UNAUTHENTICATED`;
- изменение текущего 30-дневного срока refresh-токена при полной неактивности.

## Acceptance criteria

- [x] Login, register, refresh и bootstrap сохраняют в памяти access-токен вместе с серверным `accessTokenExpiresAt`; JWT на клиенте для определения срока не декодируется.
- [x] Перед запросом основного Apollo Client при наличии сессии выполняется refresh, если access-токен истёк или истечёт менее чем через 60 секунд.
- [x] Публичный запрос без текущей сессии отправляется без предварительного refresh; отдельный refresh client не попадает в рекурсивную refresh-цепочку.
- [x] Если проактивный refresh временно не удался, но access-токен ещё действителен, исходный запрос отправляется с действительным токеном.
- [x] Если access-токен уже истёк и refresh завершился временной ошибкой, исходный запрос не отправляется, ошибка возвращается вызывающему коду, а локальная сессия не очищается.
- [x] Ответ `UNAUTHENTICATED` без `data` запускает refresh при необходимости и повторяет исходную операцию ровно один раз.
- [x] GraphQL-ответ, содержащий и `data`, и `UNAUTHENTICATED`, не приводит к автоматическому повтору операции.
- [x] Если после отправки операции поколение access-токена уже изменилось, поздний `UNAUTHENTICATED` повторяет операцию с новым токеном без дополнительного refresh.
- [x] Одновременные запросы в одной вкладке ожидают один общий refresh и получают единый результат.
- [x] Одновременные запросы в разных вкладках не используют один и тот же одноразовый refresh-токен параллельно.
- [x] Вкладка-владелец refresh передаёт новый access-токен, `accessTokenExpiresAt` и поколение ожидающим вкладкам, не сохраняя access-токен постоянно в `localStorage`.
- [x] Устаревшее межвкладочное сообщение не может заменить более новое состояние сессии; принимаются только сообщения с более новым поколением.
- [x] После истечения lease ожидающая вкладка перечитывает актуальный refresh-токен и может безопасно выполнить следующую ротацию, если вкладка-владелец закрылась до публикации результата.
- [x] Logout или окончательная ошибка refresh в одной вкладке завершает сессию, очищает Apollo cache и уведомляет остальные вкладки.
- [x] Только `REFRESH_TOKEN_INVALID` и `REFRESH_TOKEN_REUSED` считаются окончательными refresh-ошибками и очищают сессию.
- [x] Сетевые ошибки, HTTP 5xx, throttling/429 и неизвестные технические ошибки refresh не очищают сессию.
- [x] Активность может продлевать сессию неограниченно; после 30 дней без refresh пользователь должен войти снова в соответствии с текущим backend TTL.
- [x] Поведение покрыто unit-тестами на порог срока, single-flight, поколения, поздний `UNAUTHENTICATED`, частичный GraphQL-ответ, временные/окончательные ошибки и межвкладочные события.
- [ ] Browser/e2e-тест подтверждает истечение access-токена, успешный refresh и прозрачное завершение исходного API-запроса.
- [ ] Browser/e2e-тест подтверждает отсутствие reuse/revocation при конкурентном refresh из нескольких вкладок и синхронизацию logout.
- [ ] Выполнены и записаны проверки для frontend source: `npm run codegen`, `npm run codegen:check`, `npm run typecheck:web`, `npm run test:web`, `npm run lint` и релевантные browser/e2e-тесты.

## Constraints and context

- Затрагивается только `frontend/web`; публичный GraphQL-контракт и backend не меняются.
- Apollo Client владеет GraphQL boundary и координацией refresh в соответствии с `frontend/web/CONTEXT.md`.
- Access-токен остаётся только в памяти. Refresh-токен остаётся в `localStorage` под существующим session storage contract.
- Backend использует одноразовые refresh-токены. Refresh выполняет ротацию под блокировкой, а reuse старого токена отзывает все активные refresh-сессии пользователя.
- Значения `accessTokenExpiresAt` и `refreshTokenExpiresAt` уже возвращаются существующими login/register/refresh operations; generated GraphQL artifact нельзя редактировать вручную.
- Межвкладочная координация является security requirement, а не только оптимизацией запросов.
- Повтор mutation допустим только когда ответ не содержит `data` и аутентификация однозначно не дала операции успешно завершиться.
- Полный протокол и обработка отказов описаны в [`design.md`](design.md).

## Implementation notes

Предполагаемые затронутые области:

- `frontend/web/app/app/providers/apollo/model/access-token.ts` — состояние токена, expiry и поколение;
- `frontend/web/app/app/providers/apollo/model/client.ts` — проактивная проверка, реактивный retry и классификация ошибок;
- `frontend/web/app/app/providers/apollo/model/refresh-coordinator.ts` — внутривкладочная и межвкладочная координация;
- `frontend/web/app/app/providers/auth/AuthContext.tsx` — сохранение expiry и синхронизация lifecycle сессии;
- `frontend/web/app/shared/lib/storage/session-token-storage.ts` — refresh token и минимальные служебные данные координации;
- frontend unit tests и Playwright/browser e2e.

GraphQL operations уже запрашивают expiry-поля. Если их менять не потребуется, generated artifacts должны остаться без ручных правок; `codegen` и `codegen:check` всё равно входят в verification gate для frontend GraphQL boundary.

Согласованный дизайн получен в grilling-сессии 2026-08-24. Продуктовые решения закрыты, внешних блокеров для реализации нет.

Реализация начата 2026-08-24 через подтверждённые TDD-швы: session module interface, Apollo operation seam и browser seam.

Реализованы глубокий session module, Apollo operation link, `Web Locks`/`BroadcastChannel` coordination и lease/storage fallback. Session-management operations (`Login`, `Register`, `Logout`, `RefreshSession`) исключены из preflight, чтобы logout не мог отправить уже ротированный refresh-токен.

Добавлен browser/e2e-сценарий: login-ответ получает короткий access expiry, следующий запрос проактивно обновляет сессию; затем две новые вкладки одновременно bootstrap-ят общую сессию, ожидают один refresh и синхронно завершают сессию после logout. Сценарий не был выполнен из-за отсутствующего container runtime.

Проверки 2026-08-24:

- прошли `npm run codegen`, `npm run codegen:check`, `npm run typecheck:web`, `npm run test:web` (14 файлов, 69 тестов), `npm run lint`, `npm run build:web` (вне sandbox для prerender preview), targeted `oxfmt --check` и `git diff --check`;
- после review исправлены гонка logout с in-flight refresh, обработка временной ошибки bootstrap и browser-сценарий с уже истёкшим access-токеном; повторно прошли `npm run typecheck:web`, `npm run test:web`, `npm run lint`, targeted `oxfmt --check` и `git diff --check`;
- `npm run test:web:e2e` вне sandbox остановился в `frontend/web/e2e/global-setup.ts:20`: `Could not find a working container runtime strategy`; browser-тесты не стартовали;
- repository-wide `npm run format:check` остаётся красным из-за существующего format drift в `.agents`; все изменённые файлы проходят targeted format check.

## Blockers

Для запуска обязательных browser/e2e-проверок нужен рабочий container runtime, доступный Testcontainers. После его появления повторить `npm run test:web:e2e`; при успешном результате отметить два browser-критерия и verification criterion, затем перевести issue в `done`.
