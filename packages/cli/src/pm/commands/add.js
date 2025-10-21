/**
 * syma add - Add a package to dependencies
 */

import { PackageManager } from '../index.js';

export async function addCommand(args) {
  if (args.length === 0) {
    console.error('Error: Package specifier required');
    console.error('Usage: syma add <package> [locator]');
    console.error('');
    console.error('Examples:');
    console.error('  syma add @syma/stdlib gh:syma-lang/stdlib@v0.9.1');
    console.error('  syma add my-utils fs:../utils');
    console.error('  syma add some-lib git+https://github.com/user/lib#main');
    process.exit(1);
  }

  const packageName = args[0];
  let locator = args[1];

  // Parse flags
  const options = {
    link: args.includes('--link'),
    copy: args.includes('--copy'),
    noVerify: args.includes('--no-verify')
  };

  // Auto-detect locator if not provided
  if (!locator) {
    // Try to infer from package name
    if (packageName.startsWith('@syma/')) {
      const pkgName = packageName.slice(6);
      console.log(`No locator provided, assuming gh:syma-lang/${pkgName}@latest`);
      locator = `gh:syma-lang/${pkgName}@latest`;
    } else {
      console.error('Error: Locator required for non-@syma packages');
      console.error('Usage: syma add <package> <locator>');
      process.exit(1);
    }
  }

  const pm = new PackageManager();

  try {
    await pm.add(packageName, locator, options);
  } catch (error) {
    console.error(`\nError adding package: ${error.message}`);
    process.exit(1);
  }
}
