#!/usr/bin/env bash
# Wrapper script that compiles tests to /tmp and runs them with node --test,
# using NODE_PATH to find node_modules in the project root.
set -e
cd "$(dirname "$0")/.."
rm -rf /tmp/test-build
./node_modules/.bin/tsc \
  --module commonjs \
  --target ES2022 \
  --experimentalDecorators \
  --emitDecoratorMetadata \
  --esModuleInterop \
  --strict \
  --skipLibCheck \
  --rootDir . \
  --outDir /tmp/test-build \
  tests/notification-templates.test.ts \
  tests/helpers/test-app.ts \
  tests/helpers/test-users.ts \
  tests/helpers/test-templates.ts
NODE_PATH="$(pwd)/node_modules" exec node --test /tmp/test-build/tests/notification-templates.test.js