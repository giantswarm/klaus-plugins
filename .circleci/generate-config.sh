#!/usr/bin/env bash
set -euo pipefail

# Emit a complete CircleCI continuation config to stdout.
# Called by the setup job in config.yml.
#
# Tag builds (base/v1.0.0):  single job pushing that plugin.
# Branch/other:              no-op (plugins are only released on tag).

emit_tag_config() {
  local plugin="$1"
  cat <<'GENEOF' | sed "s|@@PLUGIN@@|${plugin}|g"
version: 2.1

jobs:
  publish-@@PLUGIN@@:
    docker:
      - image: cimg/base:stable
    environment:
      REGISTRY: gsoci.azurecr.io
      REGISTRY_PATH: giantswarm/klaus-plugins
      KLAUSCTL_VERSION: "0.0.54"
    steps:
      - checkout
      - run:
          name: Install klausctl
          command: |
            set -euo pipefail
            curl -fsSL -o /tmp/klausctl.tar.gz \
              "https://github.com/giantswarm/klausctl/releases/download/v${KLAUSCTL_VERSION}/klausctl_Linux_x86_64.tar.gz"
            tar -xzf /tmp/klausctl.tar.gz -C /tmp --strip-components=1 klausctl_Linux_x86_64/klausctl
            mkdir -p "${HOME}/bin"
            install /tmp/klausctl "${HOME}/bin/klausctl"
            echo 'export PATH="${HOME}/bin:${PATH}"' >> "${BASH_ENV}"
            source "${BASH_ENV}"
            klausctl version
      - run:
          name: Configure registry credentials
          command: |
            set -euo pipefail
            username="${ACR_GSOCI_USERNAME:-${ACR_USERNAME:-}}"
            password="${ACR_GSOCI_PASSWORD:-${ACR_PASSWORD:-}}"
            if [ -z "${username}" ] || [ -z "${password}" ]; then
              echo "Missing OCI registry credentials."
              exit 1
            fi
            mkdir -p "${HOME}/.docker"
            auth=$(printf '%s:%s' "${username}" "${password}" | base64 -w0)
            printf '{"auths":{"%s":{"auth":"%s"}}}' "${REGISTRY}" "${auth}" > "${HOME}/.docker/config.json"
      - run:
          name: Push plugin @@PLUGIN@@
          command: |
            set -euo pipefail
            source "${BASH_ENV}"
            tag="${CIRCLE_TAG#@@PLUGIN@@/}"
            ref="${REGISTRY}/${REGISTRY_PATH}/@@PLUGIN@@:${tag}"
            echo "--- Pushing plugin: @@PLUGIN@@ -> ${ref} ---"
            klausctl plugin push "plugins/@@PLUGIN@@" "${ref}" --output json
            echo "Pushed ${ref}"

workflows:
  publish-plugin-on-tag:
    jobs:
      - publish-@@PLUGIN@@:
          context: architect
          filters:
            tags:
              only: /^@@PLUGIN@@\/v.*/
            branches:
              ignore: /.*/
GENEOF
}

emit_noop() {
  cat <<'EOF'
version: 2.1

jobs:
  no-op:
    docker:
      - image: cimg/base:stable
    steps:
      - run: echo "No plugin release needed"

workflows:
  noop:
    jobs:
      - no-op
EOF
}

# --- Main ---

if [[ -n "${CIRCLE_TAG:-}" ]]; then
  PREFIX="${CIRCLE_TAG%%/v*}"

  # Not a per-plugin tag (e.g. plain v1.2.3 from old format)
  if [[ "$PREFIX" == "$CIRCLE_TAG" ]]; then
    emit_noop
    exit 0
  fi

  if [[ ! -d "plugins/${PREFIX}" ]]; then
    echo "ERROR: Tag ${CIRCLE_TAG} does not match any plugins/ directory" >&2
    exit 1
  fi

  emit_tag_config "$PREFIX"
  exit 0
fi

emit_noop
