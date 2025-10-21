#!/usr/bin/env node

// Forward to @syma/cli REPL
import { main } from '@syma/cli/bin/syma-repl.js';

main().catch(error => {
  if (error.code === 'ENOENT') {
    console.error(`Error: File not found: ${error.path}`);
  } else {
    console.error('Unhandled error:', error.message);
    if (process.env.DEBUG) {
      console.error(error.stack);
    }
  }
  process.exit(1);
});
