#!/usr/bin/env bash
# Wrapper script for the institutions-stats feature test (feature 17).
# Compiles the test file to /tmp and runs it with node --test, using NODE_PATH
# to find node_modules in the project root.
set -e
cd "$(dirname "$0")/.."
rm -rf /tmp/test-build-inst
mkdir -p /tmp/test-build-inst
./node_modules/.bin/tsc \
  --module commonjs \
  --target ES2022 \
  --experimentalDecorators \
  --emitDecoratorMetadata \
  --esModuleInterop \
  --strict \
  --skipLibCheck \
  --rootDir . \
  --outDir /tmp/test-build-inst \
  tests/institutions-stats.test.ts
NODE_PATH="$(pwd)/node_modules" exec node --test /tmp/test-build-inst/tests/institutions-stats.test.js
