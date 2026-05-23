#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARGS=()

export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"

DESTINATION="${DESTINATION:-}"
if [[ -z "$DESTINATION" ]]; then
    DESTINATION="$(
        xcrun simctl list devices available | awk '
            /^-- iOS / {
                os = $3
                next
            }
            /^[[:space:]]+.+ \([0-9A-F-]+\) \((Shutdown|Booted)\)/ {
                line = $0
                sub(/^[[:space:]]+/, "", line)
                sub(/ \([0-9A-F-]+\).*/, "", line)
                print "platform=iOS Simulator,OS=" os ",name=" line
                exit
            }
        '
    )"
fi

if [[ -z "$DESTINATION" ]]; then
    DESTINATION="generic/platform=iOS Simulator"
fi

if [[ -n "${SV_SESSION_ID:-}" ]]; then
    export SWIFTPM_DISABLE_SANDBOX=1
    export SWIFT_BUILD_USE_SANDBOX=0
    ARGS+=("-IDEPackageSupportDisableManifestSandbox=1")
    ARGS+=("-IDEPackageSupportDisablePackageSandbox=1")
    ARGS+=('OTHER_SWIFT_FLAGS=$(inherited) -disable-sandbox')
fi

xcodebuild \
    -project "$ROOT_DIR/GoSchedule.xcodeproj" \
    -scheme GoSchedule \
    -destination "$DESTINATION" \
    CODE_SIGNING_ALLOWED=NO \
    build \
    "${ARGS[@]}" \
    "$@"
