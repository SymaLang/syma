/**
 * syma build - Build entry from package.syma
 */

import { parsePackageSyma } from '../pm/parser.js';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function buildCommand(args) {
  const pkg = await parsePackageSyma();

  if (!pkg) {
    console.error('Error: No package.syma found');
    process.exit(1);
  }

  // Check for build script
  if (pkg.scripts && pkg.scripts.build) {
    console.log('Running build script...');
    try {
      const { stdout, stderr } = await execAsync(pkg.scripts.build, {
        cwd: process.cwd()
      });
      if (stdout) console.log(stdout);
      if (stderr) console.error(stderr);
      console.log('✓ Build complete');
    } catch (error) {
      console.error(`Build failed: ${error.message}`);
      process.exit(1);
    }
    return;
  }

  // Default: compile entry point
  if (!pkg.entry) {
    console.error('Error: No entry point or build script defined in package.syma');
    process.exit(1);
  }

  console.log(`Building ${pkg.entry}...`);

  const entryPath = path.resolve(process.cwd(), pkg.entry);
  const outputPath = args.includes('--out')
    ? args[args.indexOf('--out') + 1]
    : 'dist/universe.json';

  try {
    // Use syma-compile
    const compileCmd = `syma-compile "${entryPath}" --bundle --out "${outputPath}" --pretty`;
    const { stdout, stderr } = await execAsync(compileCmd, {
      cwd: process.cwd()
    });

    if (stdout) console.log(stdout);
    if (stderr) console.error(stderr);

    console.log(`✓ Built to ${outputPath}`);
  } catch (error) {
    console.error(`Build failed: ${error.message}`);
    process.exit(1);
  }
}
