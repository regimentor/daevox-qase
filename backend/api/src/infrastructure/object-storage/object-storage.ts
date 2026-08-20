export type ObjectMetadata = { size: bigint; contentType: string | undefined };

export interface ObjectStorage {
  presignPut(
    key: string,
    contentType: string,
    size: bigint,
    expiresSeconds: number,
  ): Promise<string>;
  presignGet(key: string, filename: string, expiresSeconds: number): Promise<string>;
  head(key: string): Promise<ObjectMetadata>;
  delete(key: string): Promise<void>;
  ready(): Promise<void>;
}

export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');
