/**
 * syma update - Update package(s) to latest version
 */

import { PackageManager } from '../index.js';
import { parsePackageSyma } from '../parser.js';

export async function updateCommand(args) {
  const packageName = args[0]; // Optional: specific package

  const options = {
    noVerify: args.includes('--no-verify'),
    force: true // Force reinstall
  };

  const pm = new PackageManager();

  try {
    if (packageName) {
      // Update specific package
      console.log(`Updating ${packageName}...`);

      const pkg = await parsePackageSyma();
      if (!pkg) {
        throw new Error('No package.syma found');
      }

      const dep = pkg.deps.find(d => d.name === packageName);
      if (!dep) {
        throw new Error(`Package ${packageName} not found in dependencies`);
      }

      // For now, just reinstall with force
      // TODO: Implement version resolution to find "latest"
      console.log(`Reinstalling ${packageName}...`);
      await pm.install(options);
    } else {
      // Update all packages
      console.log('Updating all packages...');
      await pm.install(options);
    }

    console.log('\n✓ Update complete');
  } catch (error) {
    console.error(`\nError updating: ${error.message}`);
    process.exit(1);
  }
}
