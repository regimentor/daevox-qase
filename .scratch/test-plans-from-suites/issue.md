# Создание и синхронизация test plans из suites

Status: in-progress
Owner: Codex

## Problem

Test plans сейчас создаются из вручную выбранных test cases. Нужно позволить создавать и редактировать plans на основе нескольких test suites с рекурсивным включением кейсов и автоматической синхронизацией новых active cases.

Операции удаления из repository должны быть обратимыми: suites и cases архивируются, а не удаляются физически.

## Scope

Включено:

- добавить связь `TestPlan` с несколькими source suites;
- добавить provenance для каждой связи plan-case: manual и source suite(s);
- поддержать выбор нескольких suites в создании и редактировании plan;
- рекурсивно включать cases выбранных suites и descendants;
- исключать archived cases при добавлении новых cases;
- дедуплицировать cases при пересечении source suites;
- сохранять порядок suites дерева и порядок cases по `caseNumber`;
- автоматически добавлять отсутствующие cases в связанные plans при создании, перемещении в source suite и восстановлении case;
- при добавлении source suite автоматически добавлять её active cases;
- при удалении source suite из plan удалять связанные с ней cases, если они не покрываются другим source suite;
- сохранять manual cases при синхронизации;
- архивировать suite, её active descendants и cases вместо hard delete;
- показывать impact preview архивации: количество suites/cases и affected plans с количеством удаляемых кейсов;
- архивировать/восстанавливать suite и case с provenance archive operation;
- восстанавливать suite в конец списка siblings;
- не восстанавливать автоматически plan-case и source-связи после archive/restore;
- скрывать archived suites/cases по умолчанию и поддержать просмотр/restore в архивном режиме;
- показывать в plan active и archived case counts отдельно;
- добавить sync summary для уведомления о затронутых plans;
- сохранить immutable run snapshots и append-only results;
- обновить API, storage, frontend, ADR и контекстную документацию;
- добавить API/integration/e2e и frontend Storybook/MSW-покрытие.

Исключено:

- hard delete suites и test cases;
- автоматическое восстановление plan-связей после восстановления suite/case;
- автоматическое удаление manual cases при синхронизации source suites, если у связи остаётся manual provenance;
- изменение уже созданных run snapshots или истории результатов.

## Acceptance criteria

- [ ] Пользователь может выбрать несколько suites при создании нового plan.
- [ ] Выбранные suites включают active cases из всего поддерева.
- [ ] Пересекающиеся suites не создают дубликаты cases.
- [ ] План создаётся как snapshot с детерминированным порядком: порядок suites в дереве, затем `caseNumber`.
- [ ] Cases, выбранные вручную, получают provenance `manual`.
- [ ] Пользователь может добавить suites к существующему plan и автоматически добавить отсутствующие cases.
- [ ] Пользователь может убрать suite из sources; связанные cases удаляются из plan только если не покрываются другим source и не имеют manual provenance.
- [ ] Новые cases автоматически добавляются в связанные plans при создании, перемещении в source suite и восстановлении.
- [ ] Если case уже есть в plan вручную, source provenance добавляется без дубликата.
- [ ] Новые cases добавляются в порядке source suite/case, без перестройки существующих позиций.
- [ ] При превышении лимита 10 000 cases исходная операция полностью отклоняется без частичных изменений.
- [ ] Создание, перемещение и восстановление case синхронизируют связанные plans транзакционно.
- [ ] Archive preview показывает общее количество архивируемых suites/cases и affected plans с количеством затрагиваемых cases.
- [ ] Архивирование suite архивирует active поддерево и cases одной транзакцией.
- [ ] Архивирование suite удаляет её source-связи и affected plan-case связи, но не меняет runs и их snapshots.
- [ ] Архивирование отдельного case показывает связанные plans и удаляет его active plan-связи с сохранением возможности восстановления самого case.
- [ ] Archived suites и cases скрыты в обычном repository и доступны через фильтр архивных объектов.
- [ ] Restore suite восстанавливает объекты соответствующей archive operation и помещает suite в конец списка siblings.
- [ ] Restore case невозможен, пока его suite archived.
- [ ] Restore не восстанавливает автоматически source suites и plan-case связи.
- [ ] Hard-delete mutations для suites и cases удалены из публичного контракта; используются явные `archive*/restore*` mutations.
- [ ] Existing plans/cases после миграции сохранены; старые plan-case связи помечены как `manual`, source suites отсутствуют.
- [ ] Plan API и UI отдельно показывают active и archived case counts.
- [ ] Cross-tenant identifiers не раскрывают существование suites, cases или plans.
- [ ] ADR и контексты API, storage и web описывают soft archive, source suites, provenance и автосинхронизацию.
- [ ] Выполнены cross-package проверки из verification matrix, включая e2e для archive/restore, sync, impact preview, tenant isolation и immutable run snapshots.

## Constraints and context

- `TestPlan` должен оставаться статическим snapshot, но дополнительно хранить source suites и provenance plan-case связей.
- Existing API limit: не более 10 000 cases в plan.
- Existing suite depth limit: 32 уровня.
- Archived cases не добавляются в plans; уже archived cases не должны считаться active составом plan.
- При удалении source suite из plan пользователь явно подтверждает количество удаляемых cases.
- При архивировании suite пользователь явно подтверждает impact по repository и plans.
- Все multi-row изменения выполняются транзакционно.
- Tenant isolation и project write authorization остаются обязанностями API.
- Prisma schema меняется через новую migration; applied migrations не переписывать.
- GraphQL SDL является источником public contract; generated API/frontend/Prisma artifacts вручную не редактировать.
- Нужно сохранить FSD layer order во frontend.

## Implementation notes

Задача создана после согласования дизайна. Реализация в процессе: добавлены source suites/provenance и soft archive в storage/API, GraphQL-контракт, web-сценарии, ADR и контекстная документация. Добавлен e2e-сценарий синхронизации plan из suites, но запуск полного e2e пока невозможен в окружении без Docker/Testcontainers runtime.

Проверки: `npm run build`, `npm run typecheck`, `npm run lint`, `npm run codegen:check`, `npm run db:generate`, `npx prisma validate` и `npm run test:web` выполнены успешно; `npm run test:e2e` и `npm run test:coverage` заблокированы отсутствием container runtime, `npm run test:storybook -w @app/web` — запретом sandbox на bind локального порта.

После review исправлены archive-aware run snapshots, глобально безопасные plan/suite positions, provenance при архивировании descendants, combined 10,000-case validation, persistence of editor ordering, и structured source-sync summary. `npm run build`, `npm run typecheck`, `npm run lint`, `npm run codegen:check` и `npm run test:web` повторно проходят; container-backed e2e по-прежнему требует runtime.

Ожидаемые затронутые контексты: `backend/api`, `backend/storage`, `frontend/web`.

Ожидается ADR для архитектурного решения о source suites, plan-case provenance и обратимом архивировании.

## Blockers

Для закрытия issue нужны запуск миграции/e2e на окружении с PostgreSQL, MinIO и Docker/Testcontainers, а также Storybook browser check вне текущего sandbox.
