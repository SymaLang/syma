/**
 * Parser for package.syma and package-lock.syma files
 *
 * Handles symbolic expression format:
 * {Package {Name "..."} {Engine "..."} {Entry "..."} {Deps ...}}
 * {Lock {Engine "..."} {Package ...} ...}
 */

import { createParser } from '@syma/core/parser-factory';
import fs from 'fs/promises';
import path from 'path';

/**
 * Parse package.syma configuration
 */
export async function parsePackageSyma(projectRoot = process.cwd()) {
  const packagePath = path.join(projectRoot, 'package.syma');

  try {
    const content = await fs.readFile(packagePath, 'utf8');
    const parser = await createParser({ useTreeSitter: false });
    const ast = parser.parseString(content, packagePath);
    return extractPackageInfo(ast);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null; // No package.syma found
    }
    throw new Error(`Failed to parse package.syma: ${error.message}`);
  }
}

/**
 * Extract package info from AST
 */
function extractPackageInfo(ast) {
  if (ast.k !== 'Call' || ast.h.v !== 'Package') {
    throw new Error('Invalid package.syma: root must be {Package ...}');
  }

  const pkg = {
    name: null,
    engine: null,
    entry: null,
    deps: [],
    scripts: {}
  };

  for (const arg of ast.a) {
    if (arg.k !== 'Call') continue;

    const head = arg.h.v;

    switch (head) {
      case 'Name':
        pkg.name = arg.a[0]?.v;
        break;

      case 'Engine':
        pkg.engine = arg.a[0]?.v;
        break;

      case 'Entry':
        pkg.entry = arg.a[0]?.v;
        break;

      case 'Deps':
        pkg.deps = extractDeps(arg.a);
        break;

      case 'Scripts':
        pkg.scripts = extractScripts(arg.a);
        break;
    }
  }

  return pkg;
}

/**
 * Extract dependencies
 */
function extractDeps(args) {
  const deps = [];

  for (const arg of args) {
    if (arg.k === 'Call' && arg.h.v === 'Dep') {
      const [nameExpr, locatorExpr] = arg.a;

      if (nameExpr && locatorExpr) {
        deps.push({
          name: nameExpr.v,
          locator: locatorExpr.v
        });
      }
    }
  }

  return deps;
}

/**
 * Extract scripts
 */
function extractScripts(args) {
  const scripts = {};

  for (const arg of args) {
    if (arg.k === 'Call' && arg.h.v === 'Script') {
      const [nameExpr, cmdExpr] = arg.a;

      if (nameExpr && cmdExpr) {
        scripts[nameExpr.v] = cmdExpr.v;
      }
    }
  }

  return scripts;
}

/**
 * Write package.syma file
 */
export async function writePackageSyma(projectRoot, pkg) {
  const packagePath = path.join(projectRoot, 'package.syma');

  const lines = ['{Package'];

  if (pkg.name) {
    lines.push(`  {Name "${pkg.name}"}`);
  }

  if (pkg.engine) {
    lines.push(`  {Engine "${pkg.engine}"}`);
  }

  if (pkg.entry) {
    lines.push(`  {Entry "${pkg.entry}"}`);
  }

  if (pkg.deps && pkg.deps.length > 0) {
    lines.push('  {Deps');
    for (const dep of pkg.deps) {
      lines.push(`    {Dep "${dep.name}" "${dep.locator}"}`);
    }
    lines.push('  }');
  }

  if (pkg.scripts && Object.keys(pkg.scripts).length > 0) {
    lines.push('  {Scripts');
    for (const [name, cmd] of Object.entries(pkg.scripts)) {
      lines.push(`    {Script "${name}" "${cmd}"}`);
    }
    lines.push('  }');
  }

  lines.push('}');

  await fs.writeFile(packagePath, lines.join('\n') + '\n', 'utf8');
}

/**
 * Parse package-lock.syma lockfile
 */
export async function parseLockfile(projectRoot = process.cwd()) {
  const lockPath = path.join(projectRoot, 'package-lock.syma');

  try {
    const content = await fs.readFile(lockPath, 'utf8');
    const parser = await createParser({ useTreeSitter: false });
    const ast = parser.parseString(content, lockPath);
    return extractLockInfo(ast);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null; // No lockfile found
    }
    throw new Error(`Failed to parse package-lock.syma: ${error.message}`);
  }
}

/**
 * Extract lock info from AST
 */
function extractLockInfo(ast) {
  if (ast.k !== 'Call' || ast.h.v !== 'Lock') {
    throw new Error('Invalid package-lock.syma: root must be {Lock ...}');
  }

  const lock = {
    engine: null,
    packages: []
  };

  for (const arg of ast.a) {
    if (arg.k !== 'Call') continue;

    const head = arg.h.v;

    switch (head) {
      case 'Engine':
        lock.engine = arg.a[0]?.v;
        break;

      case 'Package':
        lock.packages.push(extractPackageLock(arg));
        break;
    }
  }

  return lock;
}

/**
 * Extract single package lock entry
 */
function extractPackageLock(packageCall) {
  const [idExpr, ...rest] = packageCall.a;

  const pkgLock = {
    id: idExpr?.v,
    resolved: null,
    integrity: null,
    mode: null,
    files: {}
  };

  for (const arg of rest) {
    if (arg.k !== 'Call') continue;

    const head = arg.h.v;

    switch (head) {
      case 'Resolved':
        pkgLock.resolved = arg.a[0]?.v;
        break;

      case 'Integrity':
        pkgLock.integrity = arg.a[0]?.v;
        break;

      case 'Mode':
        pkgLock.mode = arg.a[0]?.v;
        break;

      case 'Files':
        pkgLock.files = extractFiles(arg.a);
        break;
    }
  }

  return pkgLock;
}

/**
 * Extract file hashes
 */
function extractFiles(args) {
  const files = {};

  for (const arg of args) {
    if (arg.k === 'Call') {
      const [pathExpr, hashExpr] = arg.a;
      if (pathExpr && hashExpr) {
        files[pathExpr.v] = hashExpr.v;
      }
    }
  }

  return files;
}

/**
 * Write lockfile
 */
export async function writeLockfile(projectRoot, lock) {
  const lockPath = path.join(projectRoot, 'package-lock.syma');

  const lines = ['{Lock'];

  if (lock.engine) {
    lines.push(`  {Engine "${lock.engine}"}`);
  }

  lines.push('');

  for (const pkg of lock.packages) {
    lines.push(`  {Package "${pkg.id}"`);

    if (pkg.resolved) {
      lines.push(`    {Resolved "${pkg.resolved}"}`);
    }

    if (pkg.integrity) {
      lines.push(`    {Integrity "${pkg.integrity}"}`);
    }

    if (pkg.mode) {
      lines.push(`    {Mode "${pkg.mode}"}`);
    }

    if (pkg.files && Object.keys(pkg.files).length > 0) {
      lines.push('    {Files');
      for (const [file, hash] of Object.entries(pkg.files)) {
        lines.push(`      {"${file}" "${hash}"}`);
      }
      lines.push('    }');
    }

    lines.push('  }');
    lines.push('');
  }

  lines.push('}');

  await fs.writeFile(lockPath, lines.join('\n') + '\n', 'utf8');
}
