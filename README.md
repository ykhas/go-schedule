# GO Schedule

A minimal iOS SwiftUI app with two buttons and simple bundled GO Transit schedules:

- `Union to Maple`
- `Maple to Union`

The app shows direct trips for today starting from 30 minutes before the current time.

## Build

This repository expects full Xcode to be installed at `/Applications/Xcode.app`.

```sh
./scripts/build-xcode.sh
```

The script sets `DEVELOPER_DIR` and applies Sandvault-compatible `xcodebuild` flags when `SV_SESSION_ID` is present.
It also selects the first available iOS simulator reported by `simctl`. Override it when needed:

```sh
DESTINATION='platform=iOS Simulator,OS=18.6,name=iPhone 16' ./scripts/build-xcode.sh
```

## Open In Xcode

```sh
open GoSchedule.xcodeproj
```

Select the `GoSchedule` scheme, choose an iPhone simulator, and run.
