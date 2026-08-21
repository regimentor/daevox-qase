# Предусловия и постусловия для test suites

Status: done
Owner: Codex

## Problem

Test Case уже хранит собственные `preconditions` и `postconditions`, но Suite не может описать общие условия для группы кейсов. Во время запуска кейса оператору нужна неизменяемая метаинформация всей цепочки Suite, к которой относится кейс.

## Scope

Включено:

- добавить в `TestSuite` nullable plain-text поля `preconditions` и `postconditions`;
- поддержать ввод и редактирование этих полей при создании и редактировании Suite;
- показывать и редактировать собственные значения выбранной Suite в форме над таблицей Test Case;
- при создании запуска собрать текущую Suite и всех её предков;
- сохранить в snapshot запуска упорядоченные записи с `suiteId`, `suiteTitle`, `preconditions` и `postconditions`;
- сохранять Suite metadata в порядке от корневой Suite к текущей;
- показывать в интерфейсе запуска отдельный metadata-блок для каждой Suite;
- применять поведение одинаково для ручного запуска и запуска из Test Plan;
- добавить миграцию, GraphQL-контракт, frontend operations и тестовое покрытие.

Исключено:

- наследование Suite metadata в исходные Test Case;
- объединение или переопределение `TestCase.preconditions` и `TestCase.postconditions`;
- live-загрузка Suite metadata для уже созданного запуска;
- изменение snapshot уже созданного запуска при переименовании или редактировании Suite;
- rich text и отдельные правила валидации, отличные от Test Case.

## Acceptance criteria

- [x] `TestSuite` имеет nullable поля `preconditions` и `postconditions` в storage и GraphQL API.
- [x] Создание Suite принимает и сохраняет оба поля.
- [x] Редактирование Suite принимает оба поля; пустая строка очищает значение и сохраняет `null`.
- [x] Форма Suite над таблицей Test Case показывает только собственные значения выбранной Suite и позволяет их изменить.
- [x] Для кейса в цепочке `Root → Child` при создании запуска snapshot содержит `Root`, затем `Child`; текущая Suite включается в цепочку.
- [x] Snapshot содержит идентификатор, название, preconditions и postconditions каждой Suite, включая `null` для незаполненных полей.
- [x] Suite metadata попадает в snapshot при ручном запуске и при запуске из Test Plan.
- [x] После создания запуска изменение названия или pre/postconditions Suite не изменяет его snapshot.
- [x] Интерфейс запуска показывает Suite metadata отдельными блоками в порядке от корневой Suite к текущей.
- [x] Собственные `TestCase.preconditions` и `TestCase.postconditions` продолжают отображаться отдельно и не заменяются Suite metadata.
- [x] Покрыты создание и редактирование Suite, пустые значения, вложенная цепочка Suite, snapshot, ручной запуск, запуск из Test Plan и отображение metadata.
- [x] Выполнены проверки, соответствующие cross-package изменению; ограничения среды перечислены ниже.

## Constraints and context

- Затрагиваются контексты Storage, API и Web; контракт между ними должен быть задокументирован в изменённых контекстах, если меняется поддерживаемая граница.
- `backend/api/src/schema/schema.graphql` — источник GraphQL-контракта. Generated-файлы не редактировать вручную; после изменения SDL запустить генерацию API и frontend codegen.
- Для изменения Prisma schema создать новую миграцию; применённые миграции не переписывать.
- Сохранить tenant isolation и одинаковое not-found поведение для cross-tenant идентификаторов.
- Сбор цепочки Suite и создание snapshot должны оставаться транзакционными и согласованными с существующим retry/locking-поведением создания запусков.
- Snapshot запуска должен оставаться immutable; изменения исходной Suite после создания запуска не должны ретроактивно менять данные.
- Использовать существующие названия `preconditions` и `postconditions` и те же правила plain-text/nullable, что у Test Case.

## Implementation notes

Предварительно затронутые области:

- `backend/storage`: поля `TestSuite`, миграция и генерация Prisma client;
- `backend/api`: suite inputs/resolvers/services, run snapshot model/service и GraphQL SDL;
- `frontend/web`: suite form and repository view, run GraphQL operations and run-case metadata UI;
- тесты API/storage/e2e и frontend Storybook/component coverage.

Выбрано persistence-представление: отдельная таблица `test_run_case_suite_metadata` с упорядоченными immutable записями, связанная с `TestRunCase` каскадно. Нельзя решать это live-резолвингом через текущую структуру Suite.

## Blockers

Нет.

- Добавлены nullable поля Suite и миграция `20260821000200_add_suite_metadata_snapshots`.
- Snapshot Suite metadata хранится в отдельной таблице `test_run_case_suite_metadata` с immutable trigger и создаётся в той же транзакции, что и `TestRunCase`.
- GraphQL и frontend codegen обновлены; добавлены API e2e и Storybook-сценарии для цепочки, ручного/plan запуска, очистки пустых значений и UI-редактирования.
- Проверки пройдены: `npm run db:generate`, `npx prisma validate`, `npm run codegen`, `npm run codegen:check`, `npm run typecheck`, `npm run typecheck:web`, `npm run lint`, `npm run test:web`, `npm run build`, `npm run test:e2e` (11/11 тестов с host container runtime) и `git diff --check`.
- Ограничения среды: `npm test` падает на существующей root Vitest-конфигурации (`@/shared/api/graphql` и Playwright spec), `npm run format:check` видит существующий drift в `.agents`, `build:web` не может bind `0.0.0.0` в sandbox, `npm run test:coverage` не проходит sandbox Testcontainers, а Storybook browser не запускается из-за отсутствующего `libnss3.so`.
