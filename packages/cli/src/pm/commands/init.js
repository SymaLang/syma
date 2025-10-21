/**
 * syma init - Initialize a new Syma project
 */

import { writePackageSyma } from '../parser.js';
import readline from 'readline';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function initCommand(args) {
  const projectRoot = process.cwd();
  const projectName = path.basename(projectRoot);

  console.log('Initializing Syma project...\n');

  // Check if package.syma already exists
  const packagePath = path.join(projectRoot, 'package.syma');
  try {
    await fs.access(packagePath);
    console.error('Error: package.syma already exists in this directory.');
    process.exit(1);
  } catch (error) {
    // File doesn't exist, proceed
  }

  // Interactive prompts
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (query) =>
    new Promise((resolve) => rl.question(query, resolve));

  const name = (await question(`Package name (${projectName}): `)) || projectName;
  const engine = (await question('Engine version (^0.9.0): ')) || '^0.9.0';
  const entry = (await question('Entry point (src/main.syma): ')) || 'src/main.syma';

  rl.close();

  // Create package.syma
  const pkg = {
    name,
    engine,
    entry,
    deps: [],
    scripts: {}
  };

  await writePackageSyma(projectRoot, pkg);

  // Create directory structure
  const srcDir = path.join(projectRoot, 'src');
  await fs.mkdir(srcDir, { recursive: true });

  // Create entry file if it doesn't exist
  const entryPath = path.join(projectRoot, entry);
  try {
    await fs.access(entryPath);
  } catch (error) {
    // Load template from file
    const templatePath = path.join(__dirname, '../../../templates/entry.syma');
    const entryContent = await fs.readFile(templatePath, 'utf8');
    await fs.writeFile(entryPath, entryContent, 'utf8');
  }

  console.log(`\n✓ Created package.syma`);
  console.log(`✓ Created ${entry}`);
  console.log('\nNext steps:');
  console.log('  syma add <package>  - Add dependencies');
  console.log('  syma install        - Install dependencies');
  console.log('  syma run            - Run the program\n');
}
