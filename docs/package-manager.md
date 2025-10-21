We want to enrich the syma cli with a package manager.

# Package Manager

`syma init` - Initialize a new Syma project with a package manager.
`syma add <package>` - Install a Syma package and add it to the project's dependencies.
`syma remove <package>` - Uninstall a Syma package and remove it from the project's dependencies.
`syma update <package>` - Update a Syma package to the latest version.
`syma list` - List all installed Syma packages in the project.

# Package Configuration

Package configuration is specified in a `package.syma` file located in the root of the Syma project. This file contains a list of dependencies and their versions.

Example `package.syma` file:

```
{Package
  {Name        "my-syma-app"}
  {Engine      "^0.9.0"}              ; expected @syma/core range

  {Entry       "src/index.syma"}      ; entry point of the application

  {Deps
    {Dep "@syma/stdlib" "gh:syma-lang/stdlib@v0.9.1"}
    {Dep "@syma/site"   "gh:syma-lang/site@v0.2.0"}
    {Dep "local-utils"  "fs:../packages/utils"}          ; local path
    {Dep "bf-demo"      "git+https://github.com/pavlo/bf.syma#f3a71c2"} ; pinned commit
  }
}
```

For the first version of the package manager, we will support GitHub, Git, and local filesystem as package sources. No central registry will be implemented initially.

Lockfile

When packages are installed or updated, a `package-lock.syma` file is generated to lock the exact versions of the installed packages. This ensures consistent installations across different environments.

{Lock
  {Engine "0.9.3"}

  {Package "@syma/stdlib@gh:syma-lang/stdlib@v0.9.1"
    {Resolved "https://codeload.github.com/syma-lang/stdlib/tar.gz/refs/tags/v0.9.1"}
    {Integrity "sha512-7y7…"}
    {Files
      {"core.syma"     "sha512-a1…"}
      {"ui/html.syma"  "sha512-b2…"}
      {"patterns.syma" "sha512-c3…"}}
  }

  {Package "bf-demo@git+https://github.com/pavlo/bf.syma#f3a71c2"
    {Resolved "git+https://github.com/pavlo/bf.syma#f3a71c2"}
    {Integrity "git-sha1-f3a71c2"}}

  {Package "local-utils@fs:../packages/utils"
    {Resolved "/absolute/path/to/packages/utils"}
    {Integrity "dir-sha512-…"}}
}

The lockfile contains the resolved URLs, integrity hashes, and file-level hashes for each package, ensuring that the exact same versions are used during installations.

1) Installation location
   •	Global, content-addressed cache: ~/.syma/store/<algo>/<hash>/…
   •	Per-project virtual view: .syma/virtual/ containing symlinks into the global store
   •	Why: fast dedupe, instant reuse across projects, deterministic builds. Keeps repo clean, and avoids node_modules entropy.

2) Module resolution (how imports get mapped)

Resolution is lockfile-driven. At runtime/compile:
1.	Read syma.lock.syma.
2.	Build a map: "<package>@<locator>" + optional subpath  → absolute path in ~/.syma/store.
3.	When the parser hits
{Import "@syma/stdlib/core" as Core} (or whatever import sugar you settle on), it:
•	Looks up @syma/stdlib in the lock,
•	Resolves the subpath core (e.g., core.syma),
•	Uses the cached absolute file path.
4.	If missing from the lock: fail with a helpful message telling the user to run sym install.

TL;DR: never scan syma_packages/; always trust the lockfile → store.

3) Entry point & CLI behavior
   •	Keep separate verbs:
   •	syma run <entry.syma>: runs a program (or --entry <Term> for a term).
   •	syma build: builds the entry from package.syma {Scripts {Script "build" …}} or {Exports {Module "main" …}}.
   •	syma repl: interactive.
   •	If no args and package.syma has {Scripts {Script "dev" …}}, allow syma dev for DX.
   •	Why not auto-compile on plain syma? Explicit beats magic; CI likes verbs.

4) Integrity verification
   •	Yes, verify now.
   •	Tarballs: sha512 of content → stored in lock.
   •	Git commits: pin to commit SHA; optional archive hash if you tar the tree.
   •	Fail install if integrity mismatches; users can pass --no-verify for local hacking.

5) Dependency resolution (transitives)
   •	Support full transitive graph. Every package can have its own package.syma.
   •	Lockfile contains the closed set of all packages (with exact locators + integrity).
   •	Deterministic by default, no floating Git branches unless the user asked for a branch.

6) GitHub authentication
   •	Support GITHUB_TOKEN / GH_TOKEN env vars for:
   •	Private repos
   •	Rate-limit relief
   •	Also read standard git credentials for git+ssh/git+https locators.

7) Git requirement
   •	If the locator is git+… → require git and check at startup.
   •	For github: locators:
   •	Tags/branches → prefer tarball download (no git required).
   •	Commits (#sha) → either shallow fetch via API or fallback to git if not available.
   •	Clear error: “git is required for locator X”.

8) Local filesystem packages (fs:)
   •	Default behavior:
   •	Inside a monorepo/workspace: symlink into .syma/virtual/ (fast edit loop).
   •	Outside the project: copy into the global store and link from there (for stability).
   •	Provide flags:
   •	sym add --link fs:../foo → force symlink
   •	sym add --copy fs:../foo → force copy
   •	The lockfile records the mode (link vs copy) so teammates get consistent behavior.