# GO Schedule

A minimal iOS SwiftUI app with two buttons and simple GO Transit schedules from the GO API:

- `Union to Maple`
- `Maple to Union`

The app loads trips for today from the GO API when a route button is opened, starting from 30 minutes before the current time.

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

## Local API Key

Do not commit your GO Transit API key. Create a local config file:

```sh
cp Config/Secrets.xcconfig.example Config/Secrets.xcconfig
```

Then edit `Config/Secrets.xcconfig`:

```xcconfig
GO_TRANSIT_API_KEY = your-real-key
```

The app reads it from `Info.plist` via `AppConfiguration.goTransitAPIKey` and sends it as the `key` query parameter.

## Open In Xcode

```sh
open GoSchedule.xcodeproj
```

Select the `GoSchedule` scheme, choose an iPhone simulator, and run.
