export function adjacentRunCase<T extends { id: string; currentStatus: string }>(
  cases: readonly T[],
  currentId: string,
  direction: 'previous' | 'next',
): T | undefined {
  const index = cases.findIndex((item) => item.id === currentId);
  if (index < 0) return undefined;
  return cases[index + (direction === 'next' ? 1 : -1)];
}

export function nextUntestedRunCase<T extends { id: string; currentStatus: string }>(
  cases: readonly T[],
  currentId: string,
): T | undefined {
  const index = cases.findIndex((item) => item.id === currentId);
  return (
    cases.find((item, itemIndex) => itemIndex > index && item.currentStatus === 'UNTESTED') ??
    cases.find((item) => item.currentStatus === 'UNTESTED')
  );
}
