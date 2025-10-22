#!/usr/bin/env node

/*****************************************************************
 * Create Syma - Project Scaffolding Tool
 *
 * Creates a new Syma project with Vite configuration
 ******************************************************************/

import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const templates = {
  default: 'Simple counter app with basic UI',
  tailwind: 'Counter app with Tailwind CSS 4 pre-configured',
};

async function copyDir(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

async function createProject(projectName, template) {
  const targetDir = path.resolve(process.cwd(), projectName);

  // Check if directory exists
  try {
    await fs.access(targetDir);
    console.error(`Error: Directory ${projectName} already exists`);
    process.exit(1);
  } catch {
    // Directory doesn't exist, good to proceed
  }

  console.log(`Creating Syma project in ${targetDir}...`);

  // Copy template
  const templateDir = path.join(__dirname, '..', 'templates', template);
  await copyDir(templateDir, targetDir);

  // Update package.json with project name
  const packageJsonPath = path.join(targetDir, 'package.json');
  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
  packageJson.name = projectName;
  await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));

  console.log('\nDone! Now run:\n');
  console.log(`  cd ${projectName}`);
  console.log(`  npm install`);
  console.log(`  syma install`);
  console.log(`  npm run dev`);
  console.log();
}

function printUsage() {
  console.log(`
Create Syma - Scaffolding tool for Syma applications

Usage:
  npm create syma@latest <project-name> [template]

Templates:
${Object.entries(templates).map(([name, desc]) => `  ${name.padEnd(12)} - ${desc}`).join('\n')}

Examples:
  npm create syma@latest my-app
  npm create syma@latest my-app counter
`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    printUsage();
    process.exit(0);
  }

  const projectName = args[0];
  const template = args[1] || 'default';

  if (!templates[template]) {
    console.error(`Unknown template: ${template}`);
    console.error(`Available templates: ${Object.keys(templates).join(', ')}`);
    process.exit(1);
  }

  try {
    await createProject(projectName, template);
  } catch (error) {
    console.error('Error creating project:', error.message);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
