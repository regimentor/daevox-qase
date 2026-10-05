# Web context

## Responsibility

`@app/web` is a React Router Framework Mode SPA with React, strict TypeScript, Ant Design, and Apollo Client. It provides authentication, workspace/project navigation, test repository and suite management, plans, environments, runs, execution, result history, dashboards, and attachment upload flows.

## Structure

The app follows Feature-Sliced Design layers in `app/`:

```text
shared → entities → features → widgets → pages → app
```

- `shared` contains reusable API, configuration, routing, testing, and UI primitives.
- `entities` represents domain data and GraphQL operations.
- `features` contains user actions and workflows.
- `widgets` composes reusable page-level sections.
- `pages` represents route-facing screens.
- `app` owns providers, routes, global styles, and application composition.

Stories are application-level compositions for boundary checking even when colocated with a slice.

## Boundary rules

- Respect the layer order and avoid imports from a higher layer. Do not import sibling slices directly; use their public `index.ts` API.
- Do not deep-import into another slice when a public API exists.
- GraphQL operations live under `app/**/*.graphql`; generated types and typed documents live at `app/shared/api/graphql/generated.ts` and must not be edited manually.
- The API remains the authority for authentication, authorization, tenant isolation, and persistence. Client route protection improves UX but cannot replace server checks.
- The repository supports an archive mode for suites and cases. Active views hide archived objects by default; archive actions show an API impact preview, and restore actions do not assume that old plan/source links are restored.
- Plan editing supports multiple source suites and manual case provenance. The source-suite selector uses the active suite tree, while active and archived case counts are shown separately on plan list/detail views. Saving source changes also persists the displayed case order and reports synchronization counts from the API.
- Suite authoring supports nullable plain-text preconditions and postconditions. Repository editing shows the selected Suite's own metadata, while run execution renders the immutable ordered Suite metadata snapshot separately from the Test Case pre/postconditions.
- On desktop, the repository suite panel can be resized horizontally; its width is constrained to leave at least 320 px for the right pane. The table scrolls horizontally within that pane, and suite titles wrap. At viewport widths of 1023 px or less, the panes stack and resizing is disabled.
- Keep attachment upload/download flows aligned with the API's presigned object-storage contract; file bytes should not be routed through GraphQL.

## Data and routing

Apollo Client manages the GraphQL boundary and session refresh coordination. React Router owns route composition and the SPA fallback. The GraphQL URL is configured with `VITE_GRAPHQL_URL`; local hosting normally uses `/graphql` through the configured development setup.

## Generated work

Run `npm run codegen` after changing GraphQL operations or the API SDL. Run `npm run codegen:check` to verify generated output. Run React Router type generation through `npm run typecheck:web`. Never modify generated GraphQL output directly.

## Verification

For UI or feature changes, run `npm run typecheck:web`, `npm run test:web`, and `npm run lint`. For GraphQL changes, include codegen and codegen check. For route or browser behavior, use Storybook and/or `npm run test:web:e2e`; the e2e workflow starts isolated PostgreSQL and SeaweedFS services with the real API.
