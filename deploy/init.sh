#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_root=$(dirname "$script_dir")
env_file="$repo_root/.env"

if [ -f "$env_file" ]; then
  printf '%s\n' "Already initialized: $env_file"
  exit 0
fi

public_origin=${PUBLIC_ORIGIN:-}
if [ -z "$public_origin" ]; then
  printf '%s\n' 'PUBLIC_ORIGIN is required on the first run, for example: PUBLIC_ORIGIN=http://server.example:8080 ./deploy/init.sh' >&2
  exit 1
fi
case "$public_origin" in
  http://*|https://*) ;;
  *)
    printf '%s\n' 'PUBLIC_ORIGIN must start with http:// or https://.' >&2
    exit 1
    ;;
esac
case "$public_origin" in
  *'|'*|*'&'*|*' '*|*'	'*)
    printf '%s\n' 'PUBLIC_ORIGIN contains unsupported whitespace or replacement characters.' >&2
    exit 1
    ;;
esac

if ! command -v openssl >/dev/null 2>&1; then
  printf '%s\n' 'OpenSSL is required to initialize production JWT keys and credentials.' >&2
  exit 1
fi

umask 077
temp_dir=$(mktemp -d "${TMPDIR:-/tmp}/daevox-init.XXXXXX")
cleanup() {
  rm -rf "$temp_dir"
}
trap cleanup EXIT INT TERM

openssl genpkey -algorithm Ed25519 -out "$temp_dir/access-private.pem" >/dev/null 2>&1
openssl pkey -in "$temp_dir/access-private.pem" -outform DER -out "$temp_dir/access-private.der" >/dev/null 2>&1
openssl pkey -in "$temp_dir/access-private.pem" -pubout -outform DER -out "$temp_dir/access-public.der" >/dev/null 2>&1

private_key=$(openssl base64 -A -in "$temp_dir/access-private.der")
public_key=$(openssl base64 -A -in "$temp_dir/access-public.der")
postgres_password=$(openssl rand -hex 24)
minio_root_user="minio-$(openssl rand -hex 8)"
minio_root_password=$(openssl rand -hex 24)
seed_demo_password=$(openssl rand -hex 16)

cp "$repo_root/.env.example" "$env_file"

replace_env() {
  key=$1
  value=$2
  sed -i "s|^${key}=.*|${key}=${value}|" "$env_file"
}

replace_env NODE_ENV production
replace_env PORT 3000
replace_env DATABASE_URL "postgresql://daevox:${postgres_password}@postgres:5432/daevox?schema=public"
replace_env ACCESS_TOKEN_PRIVATE_KEY "$private_key"
replace_env ACCESS_TOKEN_PUBLIC_KEY "$public_key"
replace_env CORS_ORIGINS "$public_origin"
replace_env S3_ENDPOINT http://minio:9000
replace_env S3_BUCKET daevox-attachments
replace_env S3_ACCESS_KEY_ID "$minio_root_user"
replace_env S3_SECRET_ACCESS_KEY "$minio_root_password"
replace_env S3_FORCE_PATH_STYLE true
replace_env SEED_DEMO_PASSWORD "$seed_demo_password"
replace_env ALLOW_PRODUCTION_SEED false
replace_env VITE_GRAPHQL_URL /graphql
replace_env NGINX_PORT "${NGINX_PORT:-8080}"
replace_env POSTGRES_USER daevox
replace_env POSTGRES_PASSWORD "$postgres_password"
replace_env POSTGRES_DB daevox
replace_env MINIO_ROOT_USER "$minio_root_user"
replace_env MINIO_ROOT_PASSWORD "$minio_root_password"

chmod 600 "$env_file"
printf '%s\n' "Initialized $env_file. Keep it private and reuse it for future deployments."
