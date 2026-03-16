#!/usr/bin/env bash
set -e
# Build frontend and backend for production (e.g. Render).
# Run from repo root. Output: backend/dist + backend/public (frontend static).

echo "Building frontend..."
cd frontend && npm ci && npm run build && cd ..
echo "Copying frontend build to backend/public..."
rm -rf backend/public && cp -r frontend/dist backend/public
echo "Building backend..."
cd backend && npm ci && npm run build && cd ..
echo "Build complete."
