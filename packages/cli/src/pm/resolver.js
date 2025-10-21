/**
 * Dependency resolution with transitive dependencies
 *
 * Builds complete dependency graph from package.syma files
 */

import { parsePackageSyma } from './parser.js';
import { fetchPackage } from './fetchers.js';
import path from 'path';

/**
 * Resolve all dependencies (including transitive)
 */
export async function resolveDependencies(projectRoot, options = {}) {
  const { noVerify = false } = options;

  // Parse root package.syma
  const rootPkg = await parsePackageSyma(projectRoot);
  if (!rootPkg) {
    throw new Error('No package.syma found in project root');
  }

  if (!rootPkg.deps || rootPkg.deps.length === 0) {
    return {
      packages: [],
      graph: {}
    };
  }

  // Build dependency graph
  const resolved = new Map(); // name@locator -> package info
  const graph = {}; // name -> [dependencies]

  async function resolvePkg(name, locator, depth = 0) {
    const key = `${name}@${locator}`;

    // Already resolved
    if (resolved.has(key)) {
      return resolved.get(key);
    }

    console.log(`${'  '.repeat(depth)}Resolving ${name}...`);

    // Fetch package
    const fetched = await fetchPackage(name, locator, {
      projectRoot,
      noVerify
    });

    const pkgInfo = {
      name,
      locator,
      resolved: fetched.resolved,
      path: fetched.path,
      mode: fetched.mode,
      deps: [],
      cleanup: fetched.cleanup
    };

    resolved.set(key, pkgInfo);
    graph[name] = [];

    // Check if package has its own package.syma
    try {
      const nestedPkg = await parsePackageSyma(fetched.path);

      if (nestedPkg && nestedPkg.deps && nestedPkg.deps.length > 0) {
        // Resolve transitive dependencies
        for (const dep of nestedPkg.deps) {
          const nestedKey = `${dep.name}@${dep.locator}`;

          // Avoid circular dependencies
          if (!resolved.has(nestedKey)) {
            const nested = await resolvePkg(dep.name, dep.locator, depth + 1);
            pkgInfo.deps.push(nested);
            graph[name].push(dep.name);
          }
        }
      }
    } catch (error) {
      // No package.syma in dependency - that's ok, it might be a leaf package
      console.log(`${'  '.repeat(depth + 1)}No package.syma found in ${name}`);
    }

    return pkgInfo;
  }

  // Resolve all root dependencies
  const packages = [];
  for (const dep of rootPkg.deps) {
    const pkg = await resolvePkg(dep.name, dep.locator);
    packages.push(pkg);
    if (!graph['<root>']) {
      graph['<root>'] = [];
    }
    graph['<root>'].push(dep.name);
  }

  return {
    packages: Array.from(resolved.values()),
    graph
  };
}

/**
 * Topological sort of dependency graph
 */
export function topologicalSort(graph) {
  const sorted = [];
  const visited = new Set();
  const visiting = new Set();

  function visit(node) {
    if (visited.has(node)) return;

    if (visiting.has(node)) {
      throw new Error(`Circular dependency detected: ${node}`);
    }

    visiting.add(node);

    const deps = graph[node] || [];
    for (const dep of deps) {
      visit(dep);
    }

    visiting.delete(node);
    visited.add(node);
    sorted.push(node);
  }

  // Visit all nodes
  for (const node of Object.keys(graph)) {
    if (node !== '<root>') {
      visit(node);
    }
  }

  return sorted;
}

/**
 * Check for version conflicts
 */
export function checkConflicts(packages) {
  const byName = new Map();

  for (const pkg of packages) {
    if (!byName.has(pkg.name)) {
      byName.set(pkg.name, []);
    }
    byName.get(pkg.name).push(pkg);
  }

  const conflicts = [];

  for (const [name, versions] of byName.entries()) {
    if (versions.length > 1) {
      // Check if all versions have the same locator
      const locators = new Set(versions.map(v => v.locator));
      if (locators.size > 1) {
        conflicts.push({
          name,
          versions: versions.map(v => v.locator)
        });
      }
    }
  }

  return conflicts;
}
