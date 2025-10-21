/**
 * syma install - Install all dependencies from package.syma
 */

import { PackageManager } from '../index.js';

export async function installCommand(args) {
  const options = {
    noVerify: args.includes('--no-verify'),
    force: args.includes('--force')
  };

  const pm = new PackageManager();

  try {
    await pm.install(options);
  } catch (error) {
    console.error(`\nError installing packages: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}
