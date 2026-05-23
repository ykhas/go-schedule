# Agent Notes

## Xcode In Sandvault

Full Xcode is installed at:

```sh
/Applications/Xcode.app
```

The system `xcode-select` may still point at Command Line Tools, so scripts should set:

```sh
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
```

When running inside Sandvault, disable nested Swift/Xcode sandboxing:

```sh
if [[ -n "${SV_SESSION_ID:-}" ]]; then
    export SWIFTPM_DISABLE_SANDBOX=1
    export SWIFT_BUILD_USE_SANDBOX=0
    ARGS+=("-IDEPackageSupportDisableManifestSandbox=1")
    ARGS+=("-IDEPackageSupportDisablePackageSandbox=1")
    ARGS+=('OTHER_SWIFT_FLAGS=$(inherited) -disable-sandbox')
fi
```

The checked-in build entry point already handles this:

```sh
./scripts/build-xcode.sh
```

It picks the first available iOS simulator from `simctl`. To override:

```sh
DESTINATION='platform=iOS Simulator,OS=18.6,name=iPhone 16' ./scripts/build-xcode.sh
```

## Schedule Data

Schedule data is generated from the official Metrolinx GO Transit GTFS feed into `GoSchedule/Schedules.json`:

```sh
./scripts/update-schedules.py
```

The app intentionally avoids rendering the GO Transit website. It reads the compact bundled JSON and shows only direct Union Station GO <-> Maple GO trips.
