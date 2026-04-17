#!/bin/bash

# Generate package directory with all necessary files for npm publishing
# This script creates a complete package directory from scratch

set -e

echo "📦 Generating package directory..."

# Create package directory structure
echo "📁 Creating directory structure..."
rm -rf package
mkdir -p package/api
mkdir -p package/dist

# Generate package.json
echo "📄 Generating package.json..."
MAIN_VERSION=$(node -p "require('./package.json').version")
cat > package/package.json << EOF
{
  "name": "@epoch-ai/deliver-cli",
  "version": "$MAIN_VERSION",
  "description": "Streamlined MCP server for managing spec workflow (requirements, design, implementation)",
  "type": "module",
  "main": "dist/index.js",
  "bin": {
    "deliver-cli": "dist/cli.js"
  },
  "files": [
    "dist/**/*",
    "api/**/*"
  ],
  "keywords": [
    "mcp",
    "workflow",
    "spec",
    "requirements",
    "design",
    "implementation",
    "openapi"
  ],
  "author": "benjamesmurray",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/benjamesmurray/deliver-cli.git"
  },
  "bugs": {
    "url": "https://github.com/benjamesmurray/deliver-cli/issues"
  },
  "homepage": "https://github.com/benjamesmurray/deliver-cli#readme",
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.16.0",
    "@types/js-yaml": "^4.0.9",
    "js-yaml": "^4.1.0",
    "marked": "^17.0.6",
    "zod": "^3.25.76"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
EOF

# Copy README.md
echo "📖 Copying README.md..."
cp README.md package/README.md

# Copy OpenAPI specification
echo "📋 Copying OpenAPI specification..."
cp api/spec-workflow.openapi.yaml package/api/spec-workflow.openapi.yaml

# Copy built files
echo "🏗️ Copying built files..."
if [ -d "dist" ]; then
    cp -r dist/* package/dist/
else
    echo "❌ Error: dist directory not found. Run 'npm run build' first."
    exit 1
fi

echo "✅ Package directory generated successfully!"
echo "📦 Version: $MAIN_VERSION"
echo "📁 Location: ./package/"
echo ""
echo "Contents:"
echo "  📄 package.json"
echo "  📖 README.md"
echo "  📋 api/spec-workflow.openapi.yaml"
echo "  🏗️ dist/ (compiled JavaScript)"
