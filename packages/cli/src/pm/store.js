/**
 * Global content-addressed store manager
 *
 * Packages are stored in ~/.syma/store/<algo>/<hash>/...
 * Per-project virtual view: .syma/virtual/ with symlinks
 */

import fs from 'fs/promises';
import fss from 'fs';
import path from 'path';
import { homedir } from 'os';
import crypto from 'crypto';

const SYMA_HOME = process.env.SYMA_HOME || path.join(homedir(), '.syma');
const STORE_DIR = path.join(SYMA_HOME, 'store');
const VIRTUAL_DIR = '.syma/virtual';

export class Store {
  constructor(projectRoot = process.cwd()) {
    this.projectRoot = projectRoot;
    this.storeDir = STORE_DIR;
    this.virtualDir = path.join(projectRoot, VIRTUAL_DIR);
  }

  /**
   * Ensure store directories exist
   */
  async ensureStore() {
    await fs.mkdir(this.storeDir, { recursive: true });
    await fs.mkdir(this.virtualDir, { recursive: true });
  }

  /**
   * Compute content hash for a file or directory
   */
  async computeHash(sourcePath, algorithm = 'sha512') {
    const stats = await fs.stat(sourcePath);

    if (stats.isFile()) {
      return this.hashFile(sourcePath, algorithm);
    } else if (stats.isDirectory()) {
      return this.hashDirectory(sourcePath, algorithm);
    }

    throw new Error(`Invalid source path: ${sourcePath}`);
  }

  /**
   * Hash a single file
   */
  async hashFile(filePath, algorithm = 'sha512') {
    const content = await fs.readFile(filePath);
    return crypto.createHash(algorithm).update(content).digest('hex');
  }

  /**
   * Hash a directory recursively (deterministic)
   */
  async hashDirectory(dirPath, algorithm = 'sha512') {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const hash = crypto.createHash(algorithm);

    // Sort entries for deterministic hashing
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      // Skip .git, node_modules, etc.
      if (this.shouldSkip(entry.name)) continue;

      hash.update(entry.name);

      if (entry.isDirectory()) {
        const subHash = await this.hashDirectory(fullPath, algorithm);
        hash.update(subHash);
      } else if (entry.isFile()) {
        const content = await fs.readFile(fullPath);
        hash.update(content);
      }
    }

    return hash.digest('hex');
  }

  /**
   * Check if path should be skipped during hashing
   */
  shouldSkip(name) {
    const skipList = [
      '.git',
      'node_modules',
      '.syma',
      '.DS_Store',
      'package-lock.json',
      'package-lock.syma'
    ];
    return skipList.includes(name);
  }

  /**
   * Add content to store and return store path
   */
  async addToStore(sourcePath, integrity) {
    await this.ensureStore();

    const { algorithm, hash } = this.parseIntegrity(integrity);
    const storePath = this.getStorePath(algorithm, hash);

    // Check if already in store
    if (fss.existsSync(storePath)) {
      return storePath;
    }

    // Copy to store
    await fs.mkdir(path.dirname(storePath), { recursive: true });
    await this.copyRecursive(sourcePath, storePath);

    return storePath;
  }

  /**
   * Get store path for given integrity hash
   */
  getStorePath(algorithm, hash) {
    return path.join(this.storeDir, algorithm, hash);
  }

  /**
   * Parse integrity string (e.g., "sha512-abc123...")
   */
  parseIntegrity(integrity) {
    const match = integrity.match(/^([a-z0-9]+)-([a-f0-9]+)$/);
    if (!match) {
      throw new Error(`Invalid integrity format: ${integrity}`);
    }
    return { algorithm: match[1], hash: match[2] };
  }

  /**
   * Format integrity string
   */
  formatIntegrity(algorithm, hash) {
    return `${algorithm}-${hash}`;
  }

  /**
   * Create symlink in virtual directory
   */
  async linkToVirtual(packageName, storePath) {
    await this.ensureStore();

    const virtualPath = path.join(this.virtualDir, packageName);
    const virtualDir = path.dirname(virtualPath);

    await fs.mkdir(virtualDir, { recursive: true });

    // Remove existing link if present
    if (fss.existsSync(virtualPath)) {
      await fs.unlink(virtualPath);
    }

    // Create symlink
    await fs.symlink(storePath, virtualPath, 'dir');

    return virtualPath;
  }

  /**
   * Copy recursively (for local packages outside monorepo)
   */
  async copyRecursive(src, dest) {
    const stats = await fs.stat(src);

    if (stats.isDirectory()) {
      await fs.mkdir(dest, { recursive: true });
      const entries = await fs.readdir(src, { withFileTypes: true });

      for (const entry of entries) {
        if (this.shouldSkip(entry.name)) continue;

        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        await this.copyRecursive(srcPath, destPath);
      }
    } else if (stats.isFile()) {
      await fs.copyFile(src, dest);
    }
  }

  /**
   * Remove package from virtual directory
   */
  async unlinkFromVirtual(packageName) {
    const virtualPath = path.join(this.virtualDir, packageName);

    if (fss.existsSync(virtualPath)) {
      await fs.unlink(virtualPath);
    }
  }

  /**
   * Clean orphaned packages from store (not referenced by any lockfile)
   */
  async gc() {
    // TODO: Implement garbage collection
    // Scan all project lockfiles, mark referenced packages, delete unreferenced
    console.log('GC not yet implemented');
  }
}
