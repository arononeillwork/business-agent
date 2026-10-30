#!/bin/sh
# FTPS: a certificate of its own, made when the machine starts. Cameras don't check who signed it;
# it's there so what they send is encrypted on the way. A real one can be given instead
# (TLS_CERT_FILE and TLS_KEY_FILE).
set -e
if [ -z "$TLS_CERT_FILE" ]; then
  mkdir -p /tmp/tls
  openssl req -x509 -newkey rsa:2048 -nodes -days 825 -subj "/CN=${PUBLIC_HOST:-camera-uploads}" \
    -keyout /tmp/tls/key.pem -out /tmp/tls/cert.pem 2>/dev/null
  export TLS_KEY_FILE=/tmp/tls/key.pem TLS_CERT_FILE=/tmp/tls/cert.pem
fi
exec node server.ts
