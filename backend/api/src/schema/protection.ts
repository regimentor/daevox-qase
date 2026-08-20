import { GraphQLError, type ValidationRule } from 'graphql';

export const queryProtectionRule: ValidationRule = (context) => {
  let depth = 0;
  let maximumDepth = 0;
  let aliases = 0;
  let complexity = 0;
  return {
    Field: {
      enter(node) {
        depth += 1;
        maximumDepth = Math.max(maximumDepth, depth);
        complexity += 1;
        if (node.alias) aliases += 1;
      },
      leave() {
        depth -= 1;
      },
    },
    Document: {
      leave() {
        if (maximumDepth > 12)
          context.reportError(
            new GraphQLError('Query depth limit exceeded', {
              extensions: { code: 'VALIDATION_ERROR' },
            }),
          );
        if (aliases > 20)
          context.reportError(
            new GraphQLError('Query alias limit exceeded', {
              extensions: { code: 'VALIDATION_ERROR' },
            }),
          );
        if (complexity > 1000)
          context.reportError(
            new GraphQLError('Query complexity limit exceeded', {
              extensions: { code: 'VALIDATION_ERROR' },
            }),
          );
      },
    },
  };
};
