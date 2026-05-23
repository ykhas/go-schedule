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

## Test Command

Use this command for the current simulator runtime:

```sh
ARGS=()
if [[ -n "${SV_SESSION_ID:-}" ]]; then
    export SWIFTPM_DISABLE_SANDBOX=1
    export SWIFT_BUILD_USE_SANDBOX=0
    ARGS+=("-IDEPackageSupportDisableManifestSandbox=1")
    ARGS+=("-IDEPackageSupportDisablePackageSandbox=1")
    ARGS+=('OTHER_SWIFT_FLAGS=$(inherited) -disable-sandbox')
fi

DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
xcodebuild test \
    -project GoSchedule.xcodeproj \
    -scheme GoSchedule \
    -destination 'platform=iOS Simulator,OS=18.6,name=iPhone 16 Pro' \
    CODE_SIGNING_ALLOWED=NO \
    "${ARGS[@]}"
```

Current tests live in `GoScheduleTests/JourneyRequestTests.swift` and verify the API date/time request construction, including the 30-minute offset.

## App Behavior

The app is intentionally small:

- Home screen has only two route buttons: Union to Maple, Maple to Union.
- A compact date/time picker sits at the bottom of the home screen.
- The picker defaults to the current date/time.
- Opening a route screen calls the GO API for the selected date/time minus 30 minutes.
- Pull-to-refresh on the route screen repeats the API call for the same selected date/time.
- The route screen uses the standard navigation back button.

## Schedule Data

The app intentionally avoids rendering the GO Transit website. It calls the GO API Journey endpoint when a route screen opens:

```text
https://api.openmetrolinx.com/OpenDataAPI/api/V1/Schedule/Journey/{Date}/{FromStopCode}/{ToStopCode}/{StartTime}/{MaxJourney}?key={GO_TRANSIT_API_KEY}
```

Current stop codes are `UN` for Union Station GO and `MP` for Maple GO. `Date` is `yyyyMMdd`; `StartTime` is `HHmm` from the selected date/time minus 30 minutes.

The relevant code is in `GoSchedule/ScheduleStore.swift`:

- `ScheduleDirection` maps route buttons to stop codes.
- `JourneyRequest` builds the API path and query.
- `ScheduleStore.loadTrips(for:relativeTo:)` fetches and decodes the API response.

Do not reintroduce bundled GTFS/static schedule files unless the user asks for offline support. The prior `Schedules.json` and GTFS generator were removed in favor of live API calls.

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

The app reads the key through generated build settings in `GoSchedule/Info.plist` using `AppConfiguration.goTransitAPIKey`.

When auditing, do not print the key. Safe checks used previously:

```sh
KEY="$(awk -F= '/^[[:space:]]*GO_TRANSIT_API_KEY[[:space:]]*=/ {value=$0; sub(/^[^=]*=/, "", value); gsub(/^[[:space:]]+|[[:space:]]+$/, "", value); print value; exit}' Config/Secrets.xcconfig)"
git ls-files -z | xargs -0 grep -F -q -- "$KEY" && echo FOUND || echo not-found
git rev-list --all | while read -r commit; do git grep -F -q -- "$KEY" "$commit" && { echo FOUND; exit 0; }; done
```

`Config/Secrets.xcconfig` must remain ignored and untracked.
