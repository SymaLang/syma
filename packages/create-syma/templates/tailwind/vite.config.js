import { defineConfig } from 'vite';
import symaPlugin from '@syma/vite-plugin';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    tailwindcss(),
    symaPlugin({
      entryModule: 'App/Main',
      modulesDir: 'src'
    })
  ]
});
