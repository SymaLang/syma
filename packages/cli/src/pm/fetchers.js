/**
 * Package fetchers for different sources:
 * - gh:org/repo@tag (GitHub tarball)
 * - git+https://... (Git clone)
 * - fs:path (Local filesystem)
 */

import fs from 'fs/promises';
import fss from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { extract as Extract } from 'tar';
import os from 'os';
import crypto from 'crypto';

const execAsync = promisify(exec);

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

/**
 * Parse package locator and determine fetcher
 */
export function parseLocator(locator) {
  // GitHub: gh:org/repo@tag
  if (locator.startsWith('gh:')) {
    const match = locator.match(/^gh:([^/]+)\/([^@]+)@(.+)$/);
    if (!match) {
      throw new Error(`Invalid GitHub locator: ${locator}`);
    }
    return {
      type: 'github',
      org: match[1],
      repo: match[2],
      ref: match[3]
    };
  }

  // Git: git+https://... or git+ssh://...
  if (locator.startsWith('git+')) {
    const url = locator.slice(4);
    const [baseUrl, ref] = url.split('#');
    return {
      type: 'git',
      url: baseUrl,
      ref: ref || 'HEAD'
    };
  }

  // Filesystem: fs:path
  if (locator.startsWith('fs:')) {
    const fsPath = locator.slice(3);
    return {
      type: 'filesystem',
      path: fsPath
    };
  }

  throw new Error(`Unknown locator format: ${locator}`);
}

/**
 * Fetch package based on locator
 */
export async function fetchPackage(name, locator, options = {}) {
  const parsed = parseLocator(locator);

  switch (parsed.type) {
    case 'github':
      return fetchGitHub(name, parsed, options);

    case 'git':
      return fetchGit(name, parsed, options);

    case 'filesystem':
      return fetchFilesystem(name, parsed, options);

    default:
      throw new Error(`Unsupported locator type: ${parsed.type}`);
  }
}

/**
 * Fetch from GitHub (prefer tarball download)
 */
async function fetchGitHub(name, { org, repo, ref }, options) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'syma-'));

  try {
    // Determine if ref is a commit SHA (40 hex chars)
    const isCommit = /^[a-f0-9]{40}$/i.test(ref);

    let tarballUrl;
    if (isCommit) {
      // For commits, use archive API
      tarballUrl = `https://api.github.com/repos/${org}/${repo}/tarball/${ref}`;
    } else {
      // For tags/branches, use codeload
      tarballUrl = `https://codeload.github.com/${org}/${repo}/tar.gz/refs/tags/${ref}`;
    }

    console.log(`Fetching ${name} from ${tarballUrl}...`);

    const headers = {};
    if (GITHUB_TOKEN) {
      headers['Authorization'] = `token ${GITHUB_TOKEN}`;
    }

    const response = await fetch(tarballUrl, { headers });

    if (!response.ok) {
      // Fallback to git clone for commits if API fails
      if (isCommit) {
        console.log(`Tarball download failed, falling back to git clone...`);
        return fetchGit(name, {
          url: `https://github.com/${org}/${repo}.git`,
          ref
        }, options);
      }
      throw new Error(`Failed to fetch from GitHub: ${response.statusText}`);
    }

    // Extract tarball
    const extractDir = path.join(tmpDir, 'extract');
    await fs.mkdir(extractDir, { recursive: true });

    // Use node:stream for compatibility
    const { Readable } = await import('stream');
    await pipeline(
      Readable.fromWeb(response.body),
      Extract({ cwd: extractDir, strip: 1 })
    );

    return {
      path: extractDir,
      resolved: tarballUrl,
      cleanup: async () => {
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    };
  } catch (error) {
    // Cleanup on error
    await fs.rm(tmpDir, { recursive: true, force: true });
    throw error;
  }
}

/**
 * Fetch from Git repository
 */
async function fetchGit(name, { url, ref }, options) {
  // Check if git is available
  try {
    await execAsync('git --version');
  } catch (error) {
    throw new Error(`git is required for locator ${url}. Please install git.`);
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'syma-'));
  const cloneDir = path.join(tmpDir, 'repo');

  try {
    console.log(`Cloning ${name} from ${url}...`);

    // Shallow clone for specific ref
    await execAsync(`git clone --depth 1 --branch ${ref} "${url}" "${cloneDir}"`);

    // Get actual commit SHA
    const { stdout: commitSha } = await execAsync('git rev-parse HEAD', {
      cwd: cloneDir
    });

    const actualRef = commitSha.trim();

    return {
      path: cloneDir,
      resolved: `git+${url}#${actualRef}`,
      cleanup: async () => {
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    };
  } catch (error) {
    // Cleanup on error
    await fs.rm(tmpDir, { recursive: true, force: true });
    throw new Error(`Failed to clone repository: ${error.message}`);
  }
}

/**
 * Fetch from local filesystem
 */
async function fetchFilesystem(name, { path: fsPath }, options) {
  const { mode = 'auto', projectRoot = process.cwd() } = options;

  // Resolve relative paths
  const absolutePath = path.isAbsolute(fsPath)
    ? fsPath
    : path.resolve(projectRoot, fsPath);

  // Check if path exists
  if (!fss.existsSync(absolutePath)) {
    throw new Error(`Local path not found: ${absolutePath}`);
  }

  // Determine mode: link or copy
  let actualMode = mode;

  if (mode === 'auto') {
    // Inside monorepo (same parent directory tree): symlink
    // Outside: copy
    const projectParent = path.dirname(projectRoot);
    const isInside = absolutePath.startsWith(projectParent);
    actualMode = isInside ? 'link' : 'copy';
  }

  return {
    path: absolutePath,
    resolved: absolutePath,
    mode: actualMode,
    cleanup: async () => {
      // No cleanup needed for filesystem packages
    }
  };
}

/**
 * Compute package files and hashes
 */
export async function computeFileHashes(pkgPath) {
  const files = {};

  async function walk(dir, prefix = '') {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;

      // Skip common ignored patterns
      if (shouldSkip(entry.name)) continue;

      if (entry.isDirectory()) {
        await walk(fullPath, relativePath);
      } else if (entry.isFile()) {
        const content = await fs.readFile(fullPath);
        const hash = crypto
          .createHash('sha512')
          .update(content)
          .digest('hex');

        files[relativePath] = `sha512-${hash}`;
      }
    }
  }

  await walk(pkgPath);
  return files;
}

function shouldSkip(name) {
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
