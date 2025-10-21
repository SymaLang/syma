#!/bin/bash

# Build script for Syma VS Code Extension

echo "Building Syma VS Code Extension..."

# Install dependencies
echo "Installing dependencies..."
npm install

# Install VS Code Extension CLI if not present
if ! command -v vsce &> /dev/null; then
    echo "Installing vsce..."
    npm install -g vsce
fi

# Compile TypeScript
echo "Compiling TypeScript..."
npm run compile

# Package the extension
echo "Packaging extension..."
vsce package

echo "Build complete! Extension packaged as syma-language-*.vsix"
echo ""
echo "To install the extension:"
echo "  1. Open VS Code"
echo "  2. Go to Extensions view (Ctrl+Shift+X)"
echo "  3. Click on ... menu → Install from VSIX"
echo "  4. Select the generated .vsix file"