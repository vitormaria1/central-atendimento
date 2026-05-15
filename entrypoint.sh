#!/bin/sh
set -eu

node ./scripts/migrate.mjs
exec node ./node_modules/next/dist/bin/next start -p 3000

