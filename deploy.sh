#!/usr/bin/env bash
set -euo pipefail

echo "Starting deployment..."

# Force non-interactive pnpm and avoid permission issues with per-user configs
export CI=true
export NPM_CONFIG_USERCONFIG=/dev/null
export PNPM_CONFIG_GLOBALCONFIG=/dev/null
export PNPM_DISABLE_SELF_UPDATE_CHECK=1

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

SERVICE_NAME="beagle-challenge"
SYSTEMD_PATH="/etc/systemd/system/${SERVICE_NAME}.service"
DEPLOY_DIR="/opt/beagle-challenge"

has_prev_ref() {
  git rev-parse --quiet HEAD@{1} >/dev/null
}

require_tool() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Error: $1 is required but not found in PATH" >&2
    exit 1
  fi
}

require_tool pnpm
require_tool git

if [[ "$ROOT" != "$DEPLOY_DIR" ]]; then
  echo "Error: repository root ($ROOT) does not match expected deploy dir ($DEPLOY_DIR)."
  echo "The systemd service points to $DEPLOY_DIR. Run this script from that location."
  exit 1
fi

DEPS_BACKEND_CHANGED=false
DEPS_FRONTEND_CHANGED=false
BACKEND_CHANGED=false
FRONTEND_CHANGED=false

if has_prev_ref; then
  if git diff --quiet HEAD@{1} HEAD -- backend/pnpm-lock.yaml backend/package.json 2>/dev/null; then
    echo "Backend dependencies unchanged"
  else
    echo "Backend dependencies changed, will reinstall"
    DEPS_BACKEND_CHANGED=true
  fi

  if git diff --quiet HEAD@{1} HEAD -- frontend/pnpm-lock.yaml frontend/package.json 2>/dev/null; then
    echo "Frontend dependencies unchanged"
  else
    echo "Frontend dependencies changed, will reinstall"
    DEPS_FRONTEND_CHANGED=true
  fi

  if git diff --quiet HEAD@{1} HEAD -- backend/ 2>/dev/null; then
    echo "Backend sources unchanged"
  else
    echo "Backend changed"
    BACKEND_CHANGED=true
  fi

  if git diff --quiet HEAD@{1} HEAD -- frontend/ 2>/dev/null; then
    echo "Frontend sources unchanged"
  else
    echo "Frontend changed"
    FRONTEND_CHANGED=true
  fi
else
  echo "No previous git ref; treating everything as changed"
  DEPS_BACKEND_CHANGED=true
  DEPS_FRONTEND_CHANGED=true
  BACKEND_CHANGED=true
  FRONTEND_CHANGED=true
fi

install_backend_deps() {
  echo "Installing backend dependencies..."
  cd "$ROOT/backend"
  if [[ -f pnpm-lock.yaml ]]; then
    pnpm install --frozen-lockfile --prefer-offline
  else
    pnpm install --prefer-offline
  fi
  cd "$ROOT"
}

install_frontend_deps() {
  echo "Installing frontend dependencies..."
  cd "$ROOT/frontend"
  if [[ -f pnpm-lock.yaml ]]; then
    pnpm install --frozen-lockfile --prefer-offline
  else
    pnpm install --prefer-offline
  fi
  cd "$ROOT"
}

if [[ "$DEPS_BACKEND_CHANGED" == true ]]; then
  install_backend_deps
fi

if [[ "$DEPS_FRONTEND_CHANGED" == true ]]; then
  install_frontend_deps
fi

build_frontend=false
if [[ "$FRONTEND_CHANGED" == true ]] || [[ "$DEPS_FRONTEND_CHANGED" == true ]]; then
  build_frontend=true
fi

# Build if dist is missing even when git diff is quiet
if [[ ! -f "$ROOT/frontend/dist/index.html" ]]; then
  echo "Frontend dist missing; will build."
  build_frontend=true
fi

# Build if backend changed and we serve frontend from backend (to keep dist in sync)
if [[ "$BACKEND_CHANGED" == true ]]; then
  build_frontend=true
fi

if [[ "$build_frontend" == true ]]; then
  echo "Building frontend..."
  cd "$ROOT/frontend"
  pnpm build
  cd "$ROOT"
else
  echo "Skipping frontend build"
fi

# Backend is plain Node; no build step, but ensure deps present
if [[ "$BACKEND_CHANGED" == true ]] && [[ "$DEPS_BACKEND_CHANGED" == false ]]; then
  echo "Backend changed, ensuring dependencies are present..."
  install_backend_deps
fi

echo "Creating app launcher..."
cat > "$ROOT/app" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
cd /opt/beagle-challenge/backend
# ensure production uses built frontend served by backend on port 8082
exec env NODE_ENV=production PORT=${PORT:-8082} pnpm start
EOF
chmod +x "$ROOT/app"

echo "Copying systemd service file..."
sudo cp "$ROOT/app.service" "$SYSTEMD_PATH"

echo "Reloading systemd..."
sudo systemctl daemon-reload

echo "Restarting service ${SERVICE_NAME}..."
sudo systemctl restart "${SERVICE_NAME}"

echo "Checking service status..."
sudo systemctl status "${SERVICE_NAME}" --no-pager

echo "Deployment completed successfully!"

