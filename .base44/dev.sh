#!/bin/sh
# Base44 dev startup for VinClub.
# The user's Supabase credentials are stored (platform-managed) under their own
# names — SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY / SUPABASE_SECRET_KEY — while
# the app reads VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY (browser) and
# SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (server.ts). Remap at runtime with
# the POSIX `:-` idiom so a value later stored under the app's own name wins.
: "${VITE_SUPABASE_URL:=$SUPABASE_URL}"
export VITE_SUPABASE_URL
: "${VITE_SUPABASE_PUBLISHABLE_KEY:=$SUPABASE_PUBLISHABLE_KEY}"
export VITE_SUPABASE_PUBLISHABLE_KEY
: "${SUPABASE_SERVICE_ROLE_KEY:=$SUPABASE_SECRET_KEY}"
export SUPABASE_SERVICE_ROLE_KEY

cd /app
npm install --no-audit --no-fund
npm run dev
