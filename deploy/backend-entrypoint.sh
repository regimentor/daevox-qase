#!/bin/sh
set -eu

npm run db:migrate:deploy
exec npm run start -w @app/api
