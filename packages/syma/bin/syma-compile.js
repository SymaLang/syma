#!/usr/bin/env node

// Forward to @syma/cli compiler
import { main } from '@syma/cli/bin/syma-compile.js';

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
