import Foundation

enum AppConfiguration {
    static var goTransitAPIKey: String? {
        guard
            let value = Bundle.main.object(forInfoDictionaryKey: "GO_TRANSIT_API_KEY") as? String,
            !value.isEmpty,
            value != "$(GO_TRANSIT_API_KEY)",
            value != "replace-with-your-local-key"
        else {
            return nil
        }

        return value
    }
}
