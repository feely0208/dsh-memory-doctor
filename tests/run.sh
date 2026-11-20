#!/bin/bash
set -uo pipefail
cd "$(dirname "$0")/.."
node tests/test.mjs && node tests/digest.test.mjs && node tests/audit.test.mjs
