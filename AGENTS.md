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

The app intentionally avoids rendering the GO Transit website. It calls the GO API Journey endpoint when a route screen opens:

```text
https://api.openmetrolinx.com/OpenDataAPI/api/V1/Schedule/Journey/{Date}/{FromStopCode}/{ToStopCode}/{StartTime}/{MaxJourney}?key={GO_TRANSIT_API_KEY}
```

Current stop codes are `UN` for Union Station GO and `MP` for Maple GO. `Date` is `yyyyMMdd`; `StartTime` is `HHmm` from now minus 30 minutes.

## Secrets

Never commit a real GO Transit API key. The checked-in file is `Config/Secrets.xcconfig.example`; the local file `Config/Secrets.xcconfig` is ignored by Git.

Create the local file with:

```sh
cp Config/Secrets.xcconfig.example Config/Secrets.xcconfig
```

Then set:

```xcconfig
GO_TRANSIT_API_KEY = actual-key-here
```
