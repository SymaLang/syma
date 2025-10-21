import { defineConfig } from 'vite';
import symaPlugin from '@syma/vite-plugin';

export default defineConfig({
  plugins: [
    symaPlugin({
      entryModule: 'App/Main',
      modulesDir: 'src/modules'
    })
  ]
});
