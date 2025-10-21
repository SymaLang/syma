/**
 * Package Manager Core
 *
 * Orchestrates package installation, resolution, and lockfile management
 */

import { Store } from './store.js';
import { parsePackageSyma, parseLockfile, writeLockfile } from './parser.js';
import { resolveDependencies, checkConflicts } from './resolver.js';
import { fetchPackage, computeFileHashes } from './fetchers.js';
import path from 'path';

export class PackageManager {
  constructor(projectRoot = process.cwd()) {
    this.projectRoot = projectRoot;
    this.store = new Store(projectRoot);
  }

  /**
   * Install all dependencies from package.syma
   */
  async install(options = {}) {
    const { noVerify = false, force = false } = options;

    console.log('Resolving dependencies...');

    // Resolve dependency graph
    const { packages, graph } = await resolveDependencies(this.projectRoot, {
      noVerify
    });

    if (packages.length === 0) {
      console.log('No dependencies to install.');
      return;
    }

    // Check for conflicts
    const conflicts = checkConflicts(packages);
    if (conflicts.length > 0) {
      console.error('Version conflicts detected:');
      for (const conflict of conflicts) {
        console.error(`  ${conflict.name}:`);
        for (const version of conflict.versions) {
          console.error(`    - ${version}`);
        }
      }
      throw new Error('Cannot install due to version conflicts');
    }

    console.log(`Installing ${packages.length} package(s)...`);

    // Load existing lockfile
    const existingLock = await parseLockfile(this.projectRoot);

    const lockPackages = [];

    for (const pkg of packages) {
      console.log(`Installing ${pkg.name}...`);

      // Check if already installed and integrity matches
      if (!force && existingLock) {
        const existing = existingLock.packages.find(
          p => p.id === `${pkg.name}@${pkg.locator}`
        );

        if (existing && !noVerify) {
          // Verify integrity
          const storePath = this.store.getStorePath(...this.store.parseIntegrity(existing.integrity));

          try {
            const computed = await this.store.computeHash(storePath);
            const { hash } = this.store.parseIntegrity(existing.integrity);

            if (computed === hash) {
              console.log(`  ${pkg.name} already installed, skipping`);
              await this.store.linkToVirtual(pkg.name, storePath);
              lockPackages.push(existing);
              continue;
            }
          } catch (error) {
            // Store path doesn't exist or verification failed, reinstall
          }
        }
      }

      // Compute integrity
      const integrity = await this.store.computeHash(pkg.path);
      const integrityStr = this.store.formatIntegrity('sha512', integrity);

      // Compute file hashes
      const files = await computeFileHashes(pkg.path);

      // Add to store
      const storePath = await this.store.addToStore(pkg.path, integrityStr);

      // Handle filesystem packages
      if (pkg.mode === 'link') {
        // Symlink directly to source (monorepo)
        await this.store.linkToVirtual(pkg.name, pkg.path);
      } else {
        // Link to store
        await this.store.linkToVirtual(pkg.name, storePath);
      }

      lockPackages.push({
        id: `${pkg.name}@${pkg.locator}`,
        resolved: pkg.resolved,
        integrity: integrityStr,
        mode: pkg.mode,
        files
      });

      // Cleanup temporary directories
      if (pkg.cleanup) {
        await pkg.cleanup();
      }
    }

    // Write lockfile
    const lock = {
      engine: await this.getCurrentEngineVersion(),
      packages: lockPackages
    };

    await writeLockfile(this.projectRoot, lock);

    console.log(`\n✓ Installed ${packages.length} package(s)`);
  }

  /**
   * Add a new dependency
   */
  async add(name, locator, options = {}) {
    const { dev = false, link = false, copy = false } = options;

    console.log(`Adding ${name}...`);

    // Parse existing package.syma
    let pkg = await parsePackageSyma(this.projectRoot);
    if (!pkg) {
      throw new Error('No package.syma found. Run `syma init` first.');
    }

    // Check if already exists
    const existing = pkg.deps.find(d => d.name === name);
    if (existing) {
      console.log(`Updating ${name} from ${existing.locator} to ${locator}`);
      existing.locator = locator;
    } else {
      pkg.deps.push({ name, locator });
    }

    // Write updated package.syma
    const { writePackageSyma } = await import('./parser.js');
    await writePackageSyma(this.projectRoot, pkg);

    // Install
    await this.install(options);
  }

  /**
   * Remove a dependency
   */
  async remove(name, options = {}) {
    console.log(`Removing ${name}...`);

    // Parse existing package.syma
    let pkg = await parsePackageSyma(this.projectRoot);
    if (!pkg) {
      throw new Error('No package.syma found.');
    }

    // Remove from deps
    const index = pkg.deps.findIndex(d => d.name === name);
    if (index === -1) {
      console.log(`Package ${name} not found in dependencies.`);
      return;
    }

    pkg.deps.splice(index, 1);

    // Write updated package.syma
    const { writePackageSyma } = await import('./parser.js');
    await writePackageSyma(this.projectRoot, pkg);

    // Remove from virtual directory
    await this.store.unlinkFromVirtual(name);

    // Reinstall remaining packages
    await this.install(options);

    console.log(`✓ Removed ${name}`);
  }

  /**
   * List installed packages
   */
  async list() {
    const lock = await parseLockfile(this.projectRoot);

    if (!lock || lock.packages.length === 0) {
      console.log('No packages installed.');
      return;
    }

    console.log(`\nInstalled packages (engine: ${lock.engine || 'unknown'}):\n`);

    for (const pkg of lock.packages) {
      const [name, locator] = pkg.id.split('@', 2);
      console.log(`  ${name}@${locator}`);
      console.log(`    Resolved: ${pkg.resolved}`);
      console.log(`    Integrity: ${pkg.integrity}`);
      if (pkg.mode) {
        console.log(`    Mode: ${pkg.mode}`);
      }
      console.log('');
    }
  }

  /**
   * Get current engine version
   */
  async getCurrentEngineVersion() {
    try {
      const corePkg = await import('@syma/core/package.json', {
        assert: { type: 'json' }
      });
      return corePkg.default.version;
    } catch (error) {
      return '0.0.0';
    }
  }
}

export { Store, parsePackageSyma, parseLockfile, writeLockfile };
