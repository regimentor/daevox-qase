interface RestoreSessionDependencies<User> {
  hasRefreshToken(): boolean;
  authorize(): Promise<unknown>;
  loadUser(): Promise<User>;
  clearStore(): Promise<unknown>;
}

export async function restoreSession<User>({
  hasRefreshToken,
  authorize,
  loadUser,
  clearStore,
}: RestoreSessionDependencies<User>): Promise<User | null> {
  if (!hasRefreshToken()) return null;
  try {
    await authorize();
    return await loadUser();
  } catch (error) {
    await clearStore();
    if (hasRefreshToken()) throw error;
    return null;
  }
}
