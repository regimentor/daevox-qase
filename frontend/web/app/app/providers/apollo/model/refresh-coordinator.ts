export class RefreshCoordinator<T> {
  private pending: Promise<T> | null = null;

  run(refresh: () => Promise<T>): Promise<T> {
    if (!this.pending) {
      this.pending = refresh().finally(() => {
        this.pending = null;
      });
    }
    return this.pending;
  }
}
