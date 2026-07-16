#!/usr/bin/with-contenv bashio

export BOT_TOKEN
export GROUP_CHAT_ID
export FIREBASE_PROJECT_ID
export FIREBASE_SERVICE_ACCOUNT_JSON
export DEFAULT_TIMEZONE

BOT_TOKEN=$(bashio::config 'bot_token')
GROUP_CHAT_ID=$(bashio::config 'group_chat_id')
FIREBASE_PROJECT_ID=$(bashio::config 'firebase_project_id')
FIREBASE_SERVICE_ACCOUNT_JSON=$(bashio::config 'firebase_service_account_json')
DEFAULT_TIMEZONE=$(bashio::config 'default_timezone')

cd /app
exec node dist/index.js
