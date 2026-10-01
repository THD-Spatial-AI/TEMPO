#!/usr/bin/env bash
# Landing page deploy
#   deploy.sh <dist-dir> [release-id]
#   deploy.sh --renew
set -euo pipefail

DOMAIN="${DOMAIN:-tempo.th-deg.de}"
WEB_ROOT="${WEB_ROOT:-/var/www/tempo}"
SITES_DIR="${SITES_DIR:-/opt/nginx-sites}"
NGINX_CONTAINER="${NGINX_CONTAINER:-opentech-nginx}"
CERTBOT_WEBROOT="${CERTBOT_WEBROOT:-/var/www/certbot}"
KEEP_RELEASES="${KEEP_RELEASES:-5}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

log() { echo "▶ $*"; }

reload_nginx() {
    docker exec "$NGINX_CONTAINER" nginx -t && docker exec "$NGINX_CONTAINER" nginx -s reload
}

# Issue/renew certificate
ensure_cert() {
    local account_args=(--register-unsafely-without-email)
    [[ -n "${LETSENCRYPT_EMAIL:-}" ]] && account_args=(--email "$LETSENCRYPT_EMAIL")

    log "Ensuring TLS certificate for $DOMAIN"
    docker run --rm \
        -v /etc/letsencrypt:/etc/letsencrypt \
        -v /var/lib/letsencrypt:/var/lib/letsencrypt \
        -v "$CERTBOT_WEBROOT:$CERTBOT_WEBROOT" \
        certbot/certbot certonly \
            --webroot -w "$CERTBOT_WEBROOT" \
            -d "$DOMAIN" \
            --keep-until-expiring --non-interactive --agree-tos \
            "${account_args[@]}"
}

publish_release() {
    local dist="$1" id="$2"
    local release="$WEB_ROOT/releases/$id"

    [[ -f "$dist/index.html" ]] || { echo "✖ $dist/index.html not found" >&2; exit 1; }

    log "Publishing release $id"
    mkdir -p "$release"
    cp -a "$dist"/. "$release"/
    chmod -R a+rX "$release"

    # Atomic switch
    ln -sfn "$release" "$WEB_ROOT/current.tmp"
    mv -Tf "$WEB_ROOT/current.tmp" "$WEB_ROOT/current"

    log "Pruning old releases (keeping $KEEP_RELEASES)"
    ls -1dt "$WEB_ROOT"/releases/*/ | tail -n +"$((KEEP_RELEASES + 1))" | xargs -r rm -rf
}

# Install vhost, rollback on failure
install_vhost() {
    local target="$SITES_DIR/tempo.conf"

    log "Installing nginx vhost"
    [[ -f "$target" ]] && cp "$target" "$target.bak"
    install -m 644 "$SCRIPT_DIR/nginx/tempo.conf" "$target"

    if ! reload_nginx; then
        echo "✖ nginx rejected the new config, rolling back" >&2
        if [[ -f "$target.bak" ]]; then mv "$target.bak" "$target"; else rm -f "$target"; fi
        reload_nginx
        exit 1
    fi
    rm -f "$target.bak"
}

if [[ "${1:-}" == "--renew" ]]; then
    ensure_cert
    reload_nginx
    exit 0
fi

DIST="${1:?usage: deploy.sh <dist-dir> [release-id] | --renew}"
RELEASE_ID="${2:-$(date +%Y%m%d%H%M%S)}"

ensure_cert
publish_release "$DIST" "$RELEASE_ID"
install_vhost
log "Deployed https://$DOMAIN (release $RELEASE_ID)"
