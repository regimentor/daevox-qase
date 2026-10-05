import type { RunCaseFieldsFragment } from '@/shared/api/graphql';

export type RunNavigationNode =
  | { kind: 'suite'; id: string; title: string; children: RunNavigationNode[] }
  | { kind: 'case'; id: string; item: RunCaseFieldsFragment };

/** Reconstruct only the immutable ancestor chains included in this run. */
export function runSuiteTree(cases: readonly RunCaseFieldsFragment[]): RunNavigationNode[] {
  const roots: RunNavigationNode[] = [];
  const loose: RunNavigationNode[] = [];
  for (const item of cases.toSorted((a, b) => a.position - b.position)) {
    let children = roots;
    const chain = item.suiteMetadata.toSorted((a, b) => a.position - b.position);
    for (const suite of chain) {
      let node = children.find(
        (candidate) => candidate.kind === 'suite' && candidate.id === suite.suiteId,
      );
      if (!node || node.kind !== 'suite') {
        node = { kind: 'suite', id: suite.suiteId, title: suite.suiteTitle, children: [] };
        children.push(node);
      }
      children = node.children;
    }
    (chain.length ? children : loose).push({ kind: 'case', id: item.id, item });
  }
  if (loose.length)
    roots.push({ kind: 'suite', id: 'ungrouped', title: 'Без сьюта', children: loose });
  return roots;
}

function visitCases(nodes: RunNavigationNode[]): RunCaseFieldsFragment[] {
  return nodes.flatMap((node) => (node.kind === 'case' ? [node.item] : visitCases(node.children)));
}

export function runCasesInTreeOrder(
  cases: readonly RunCaseFieldsFragment[],
): RunCaseFieldsFragment[] {
  return visitCases(runSuiteTree(cases));
}
