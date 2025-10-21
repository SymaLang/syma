/**
 * syma list - List installed packages
 */

import { PackageManager } from '../index.js';

export async function listCommand(args) {
  const pm = new PackageManager();

  try {
    await pm.list();
  } catch (error) {
    console.error(`\nError listing packages: ${error.message}`);
    process.exit(1);
  }
}
