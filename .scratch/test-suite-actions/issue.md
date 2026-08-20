# Удаление и переименование test suites

Status: done
Owner: Codex

## Problem

В дереве test suites пока нет пользовательских действий для переименования и удаления suite, хотя backend API уже предоставляет мутации `updateTestSuite` и `deleteTestSuite`.

## Scope

Включено:

- добавить frontend GraphQL-операции для переименования и удаления suite;
- добавить постоянно видимое меню `...` у каждой suite;
- добавить modal переименования с предзаполненным названием;
- добавить confirmation modal удаления;
- обновлять дерево после успешных мутаций через refetch;
- после удаления выбирать родительскую suite или «Все тест-кейсы» для корневой suite;
- поддержать отображение suites на всей допустимой глубине вложенности — до 32 уровней;
- обработать disabled-состояние и согласованные пользовательские ошибки;
- добавить Storybook/MSW-сценарии для rename, delete, `SUITE_NOT_EMPTY` и disabled-состояния.

Исключено:

- изменение backend API или storage-модели;
- каскадное удаление suites, test cases или дочерних suites;
- удаление непустых suites;
- расширение create-flow для создания дочерних suites;
- редактирование description suite.

## Acceptance criteria

- [x] У каждой suite в дереве постоянно доступно меню `...`.
- [x] Пункт «Переименовать» открывает modal с текущим названием.
- [x] Переименование сохраняет только `title`; пустое название запрещено, одинаковые названия разрешены.
- [x] Сохранение переименования выполняется по кнопке и Enter; отмена закрывает modal без изменений.
- [x] Пункт «Удалить» открывает confirmation modal с названием suite.
- [x] После успешного удаления дерево обновляется, а выделение переходит на родителя либо на «Все тест-кейсы».
- [x] Удаление suite с test cases или дочерними suites не выполняется; ошибка `SUITE_NOT_EMPTY` отображается как «Suite можно удалить только если в нём нет тестов и дочерних suites».
- [x] При `disabled=true` mutation-действия остаются видимыми, но недоступными.
- [x] Suites любой поддерживаемой глубины до 32 уровней доступны для rename/delete.
- [x] Storybook/MSW покрывает успешное переименование, успешное удаление, ошибку непустой suite и disabled-состояние.
- [x] Выполнены `npm run codegen`, `npm run codegen:check`, `npm run typecheck:web`, `npm run test:web` и `npm run lint`.

## Constraints and context

- GraphQL SDL в `backend/api/src/schema/schema.graphql` уже содержит `updateTestSuite` и `deleteTestSuite`; generated-файлы вручную не редактировать.
- Backend разрешает удалять только пустые suites и уже возвращает `SUITE_NOT_EMPTY`.
- Сохранить tenant isolation и существующую авторизацию API.
- Соблюдать FSD-границы frontend и публичные `index.ts` API.
- Не использовать optimistic update; после мутаций делать refetch дерева.
- Не менять текущий create-flow.

## Implementation notes

Реализовано во `frontend/web`: добавлены операции `UpdateSuite` и `DeleteSuite`, меню действий у каждого узла, модальные окна rename/delete, refetch дерева после мутаций, восстановление выделения после удаления, 32 уровня вложенности и Storybook/MSW-сценарии. Backend и storage не изменялись.

Проверки: `npm run codegen` — успешно; `npm run codegen:check` — успешно; `npm run typecheck:web` — успешно; `npm run test:web` — 46 тестов успешно; `npm run lint` — успешно; формат изменённых файлов — успешно.

`npm run test:storybook -w @app/web` не запустился: bundled Chromium завершается с ошибкой `libnspr4.so: cannot open shared object file`. `npm run format:check` также находит существующие несформатированные файлы в `.agents/`; изменённые файлы проходят targeted format check.

Затронутый основной контекст: `frontend/web`. Backend и storage должны остаться без изменений.

## Blockers

Проверка Storybook browser не выполнена в текущем окружении: bundled Chromium требует отсутствующую системную библиотеку `libnspr4.so`.
