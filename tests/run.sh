#!/bin/bash
set -uo pipefail
cd "$(dirname "$0")/.."
node tests/test.mjs
