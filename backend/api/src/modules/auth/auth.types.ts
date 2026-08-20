export type AuthenticatedUser = { id: string; email: string; name: string };

export type RequestContext = {
  request: { headers: Record<string, string | string[] | undefined>; ip?: string };
  response: unknown;
  correlationId: string;
  user?: AuthenticatedUser;
};
