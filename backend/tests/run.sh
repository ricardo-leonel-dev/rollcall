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
  tests/message-template-catalog.test.ts \
  tests/user-modules.test.ts \
  tests/withdrawal-reasons.test.ts \
  tests/student-withdrawals.test.ts \
  tests/withdrawn-enrollment-hiding.test.ts \
  tests/withdrawn-students-support.test.ts \
  tests/domain-events.test.ts \
  tests/justification-update.test.ts \
  tests/drop-enrollment-is-enrolled.test.ts \
  tests/course-section.test.ts \
  tests/helpers/test-app.ts \
  tests/helpers/test-users.ts \
  tests/helpers/test-templates.ts \
  tests/helpers/test-template-actions.ts
NODE_PATH="$(pwd)/node_modules" exec node --test --test-concurrency=1 \
  /tmp/test-build/tests/notification-templates.test.js \
  /tmp/test-build/tests/message-template-catalog.test.js \
  /tmp/test-build/tests/user-modules.test.js \
  /tmp/test-build/tests/withdrawal-reasons.test.js \
  /tmp/test-build/tests/student-withdrawals.test.js \
  /tmp/test-build/tests/withdrawn-enrollment-hiding.test.js \
  /tmp/test-build/tests/withdrawn-students-support.test.js \
  /tmp/test-build/tests/domain-events.test.js \
  /tmp/test-build/tests/justification-update.test.js \
  /tmp/test-build/tests/drop-enrollment-is-enrolled.test.js \
  /tmp/test-build/tests/course-section.test.js