Task:

We want to leverage npm workspaces to manage Syma monorepo.

This requires infrastructure reorganization and some changes to the build.

We want to have at least these packages:
@syma/cli
@syma/core
@syma/notebook
@syma/vite-plugin
@syma/vscode-extension

Since we want to be able to `npm install -g syma` and get access to both the CLI and the notebook, we will also need an umbrella package that depends on both.

We will also probably need additional packages — investigate the structure and dependencies to ensure everything works smoothly.

We want maintain the easiness of development, so the setup should allow for easy local development and testing of interdependent packages.

Please, set up the monorepo structure, the necessary package.json files, and any required build scripts or configuration changes to make this work seamlessly.