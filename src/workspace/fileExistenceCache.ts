import { fileExists } from './workspaceUtils';

/**
 * 工作区文件存在性内存缓存。同一路径在失效前只 stat 一次；
 * 工作区切换时清空；文件创建/删除/重命名时按路径失效。
 */
export class FileExistenceCache {
  private readonly cache = new Map<string, boolean>();

  async exists(relativePath: string): Promise<boolean> {
    const cached = this.cache.get(relativePath);
    if (cached !== undefined) {
      return cached;
    }

    const result = await fileExists(relativePath);
    this.cache.set(relativePath, result);
    return result;
  }

  invalidate(relativePath: string): void {
    this.cache.delete(relativePath);
  }

  invalidateMany(relativePaths: Iterable<string>): void {
    for (const relativePath of relativePaths) {
      this.cache.delete(relativePath);
    }
  }

  clear(): void {
    this.cache.clear();
  }
}

export const fileExistenceCache = new FileExistenceCache();
