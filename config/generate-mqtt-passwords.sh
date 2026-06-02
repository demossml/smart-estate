#!/bin/bash
# Generate MQTT passwords for Mosquitto
# Usage: bash generate-mqtt-passwords.sh
# Requires: mosquitto_passwd (from mosquitto-clients package)

PASSWD_FILE="$(dirname "$0")/passwd"

echo "🔐 Generating MQTT passwords..."

if ! command -v mosquitto_passwd &>/dev/null; then
  echo "⚠️ mosquitto_passwd not found. Install: sudo apt install mosquitto-clients"
  echo "Generating plain-text password file instead..."
  echo "zigbee2mqtt:\${MQTT_PASSWORD:-smartestate_zigbee}" > "$PASSWD_FILE"
  echo "smartestate:\${MQTT_PASSWORD:-smartestate_backend}" >> "$PASSWD_FILE"
  echo "homeassistant:\${MQTT_PASSWORD:-smartestate_ha}" >> "$PASSWD_FILE"
else
  # Create with hashed passwords
  > "$PASSWD_FILE"
  mosquitto_passwd -b "$PASSWD_FILE" zigbee2mqtt "${MQTT_PASSWORD:-smartestate_zigbee}"
  mosquitto_passwd -b "$PASSWD_FILE" smartestate "${MQTT_PASSWORD:-smartestate_backend}"
  mosquitto_passwd -b "$PASSWD_FILE" homeassistant "${MQTT_PASSWORD:-smartestate_ha}"
  echo "✅ 3 users created in $PASSWD_FILE"
fi

chmod 600 "$PASSWD_FILE"
echo "🔒 $PASSWD_FILE permissions: 600"
