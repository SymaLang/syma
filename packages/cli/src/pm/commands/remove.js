/**
 * syma remove - Remove a package from dependencies
 */

import { PackageManager } from '../index.js';

export async function removeCommand(args) {
  if (args.length === 0) {
    console.error('Error: Package name required');
    console.error('Usage: syma remove <package>');
    process.exit(1);
  }

  const packageName = args[0];

  const options = {
    noVerify: args.includes('--no-verify')
  };

  const pm = new PackageManager();

  try {
    await pm.remove(packageName, options);
  } catch (error) {
    console.error(`\nError removing package: ${error.message}`);
    process.exit(1);
  }
}
