import Foundation

struct ScheduledTrip: Identifiable, Equatable {
    let id: String
    let departureDisplay: String
    let arrivalDisplay: String
    let durationMinutes: Int
    let route: String
    let routeName: String
    let mode: String
    let headsign: String
    let transferCount: Int
}

enum ScheduleDirection: String, CaseIterable, Identifiable {
    case unionToMaple = "union-to-maple"
    case mapleToUnion = "maple-to-union"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .unionToMaple:
            "Union to Maple"
        case .mapleToUnion:
            "Maple to Union"
        }
    }

    var origin: String {
        switch self {
        case .unionToMaple:
            "Union Station GO"
        case .mapleToUnion:
            "Maple GO"
        }
    }

    var destination: String {
        switch self {
        case .unionToMaple:
            "Maple GO"
        case .mapleToUnion:
            "Union Station GO"
        }
    }

    var systemImage: String {
        switch self {
        case .unionToMaple:
            "arrow.up.right"
        case .mapleToUnion:
            "arrow.down.left"
        }
    }

    var fromStopCode: String {
        switch self {
        case .unionToMaple:
            "UN"
        case .mapleToUnion:
            "MP"
        }
    }

    var toStopCode: String {
        switch self {
        case .unionToMaple:
            "MP"
        case .mapleToUnion:
            "UN"
        }
    }
}

@MainActor
final class ScheduleStore: ObservableObject {
    @Published private(set) var tripsByDirection: [ScheduleDirection: [ScheduledTrip]] = [:]
    @Published private(set) var loadingDirections: Set<ScheduleDirection> = []
    @Published private(set) var errorMessages: [ScheduleDirection: String] = [:]

    private let calendar = Calendar(identifier: .gregorian)
    private let maxJourneyCount = 12

    func trips(for direction: ScheduleDirection) -> [ScheduledTrip] {
        tripsByDirection[direction, default: []]
    }

    func errorMessage(for direction: ScheduleDirection) -> String? {
        errorMessages[direction]
    }

    func isLoading(_ direction: ScheduleDirection) -> Bool {
        loadingDirections.contains(direction)
    }

    func loadTrips(for direction: ScheduleDirection, relativeTo now: Date = Date()) async {
        guard !loadingDirections.contains(direction) else { return }

        guard let apiKey = AppConfiguration.goTransitAPIKey else {
            tripsByDirection[direction] = []
            errorMessages[direction] = "GO Transit API key is missing."
            return
        }

        do {
            loadingDirections.insert(direction)
            errorMessages[direction] = nil

            let response = try await fetchJourney(direction: direction, apiKey: apiKey, now: now)
            guard response.metadata.errorCode == "200" else {
                tripsByDirection[direction] = []
                errorMessages[direction] = response.metadata.errorMessage
                loadingDirections.remove(direction)
                return
            }

            tripsByDirection[direction] = response.scheduledTrips()
            loadingDirections.remove(direction)
        } catch {
            tripsByDirection[direction] = []
            errorMessages[direction] = "Could not load today's schedule."
            loadingDirections.remove(direction)
        }
    }

    private func fetchJourney(direction: ScheduleDirection, apiKey: String, now: Date) async throws -> JourneyResponse {
        guard let url = JourneyRequest(
            direction: direction,
            selectedDate: now,
            maxJourneyCount: maxJourneyCount,
            apiKey: apiKey
        ).url else {
            throw URLError(.badURL)
        }

        let (data, response) = try await URLSession.shared.data(from: url)
        if let httpResponse = response as? HTTPURLResponse, !(200..<300).contains(httpResponse.statusCode) {
            throw URLError(.badServerResponse)
        }

        return try JSONDecoder().decode(JourneyResponse.self, from: data)
    }
}

struct JourneyRequest: Equatable {
    let direction: ScheduleDirection
    let selectedDate: Date
    let maxJourneyCount: Int
    let apiKey: String

    var requestStart: Date {
        selectedDate.addingTimeInterval(-30 * 60)
    }

    var apiDate: String {
        journeyDateFormatter.string(from: requestStart)
    }

    var apiStartTime: String {
        journeyTimeFormatter.string(from: requestStart)
    }

    var path: String {
        "/OpenDataAPI/api/V1/Schedule/Journey/\(apiDate)/\(direction.fromStopCode)/\(direction.toStopCode)/\(apiStartTime)/\(maxJourneyCount)"
    }

    var url: URL? {
        var components = URLComponents()
        components.scheme = "https"
        components.host = "api.openmetrolinx.com"
        components.path = path
        components.queryItems = [URLQueryItem(name: "key", value: apiKey)]
        return components.url
    }
}

private let journeyDateFormatter: DateFormatter = {
    let formatter = DateFormatter()
    formatter.calendar = Calendar(identifier: .gregorian)
    formatter.locale = Locale(identifier: "en_CA")
    formatter.timeZone = .current
    formatter.dateFormat = "yyyyMMdd"
    return formatter
}()

private let journeyTimeFormatter: DateFormatter = {
    let formatter = DateFormatter()
    formatter.calendar = Calendar(identifier: .gregorian)
    formatter.locale = Locale(identifier: "en_CA")
    formatter.timeZone = .current
    formatter.dateFormat = "HHmm"
    return formatter
}()

private struct JourneyResponse: Decodable {
    let metadata: APIMetadata
    let journeys: [APIJourney]

    enum CodingKeys: String, CodingKey {
        case metadata = "Metadata"
        case journeys = "SchJourneys"
    }

    func scheduledTrips() -> [ScheduledTrip] {
        journeys
            .flatMap { $0.services ?? [] }
            .enumerated()
            .map { index, service in
                ScheduledTrip(
                    id: service.tripHash ?? "\(service.startSortTime ?? "")-\(service.endSortTime ?? "")-\(index)",
                    departureDisplay: displayTime(service.startTime),
                    arrivalDisplay: displayTime(service.endTime),
                    durationMinutes: durationMinutes(service.duration),
                    route: service.code,
                    routeName: service.primaryTrip?.line ?? service.code,
                    mode: service.primaryTrip?.type == "T" ? "Train" : "Bus",
                    headsign: service.primaryTrip?.display ?? service.direction,
                    transferCount: service.transferCount ?? 0
                )
            }
    }

    private func displayTime(_ value: String) -> String {
        let rawTime = value.split(separator: " ").last.map(String.init) ?? value
        let parts = rawTime.split(separator: ":").compactMap { Int($0) }
        guard parts.count >= 2 else { return value }

        let hour = parts[0]
        let minute = parts[1]
        let suffix = hour < 12 ? "AM" : "PM"
        let displayHour = hour % 12 == 0 ? 12 : hour % 12
        return "\(displayHour):\(String(format: "%02d", minute)) \(suffix)"
    }

    private func durationMinutes(_ value: String) -> Int {
        let parts = value.split(separator: ":").compactMap { Int($0) }
        guard parts.count == 3 else { return 0 }
        return parts[0] * 60 + parts[1] + (parts[2] > 0 ? 1 : 0)
    }
}

private struct APIMetadata: Decodable {
    let errorCode: String
    let errorMessage: String

    enum CodingKeys: String, CodingKey {
        case errorCode = "ErrorCode"
        case errorMessage = "ErrorMessage"
    }
}

private struct APIJourney: Decodable {
    let services: [APIService]?

    enum CodingKeys: String, CodingKey {
        case services = "Services"
    }
}

private struct APIService: Decodable {
    let code: String
    let direction: String
    let startTime: String
    let endTime: String
    let duration: String
    let startSortTime: String?
    let endSortTime: String?
    let tripHash: String?
    let transferCount: Int?
    let trips: APITrips?

    var primaryTrip: APITrip? {
        trips?.trip.first
    }

    enum CodingKeys: String, CodingKey {
        case code = "Code"
        case direction = "Direction"
        case startTime = "StartTime"
        case endTime = "EndTime"
        case duration = "Duration"
        case startSortTime = "StartSortTime"
        case endSortTime = "EndSortTime"
        case tripHash
        case transferCount
        case trips = "Trips"
    }
}

private struct APITrips: Decodable {
    let trip: [APITrip]

    enum CodingKeys: String, CodingKey {
        case trip = "Trip"
    }
}

private struct APITrip: Decodable {
    let display: String
    let line: String
    let type: String

    enum CodingKeys: String, CodingKey {
        case display = "Display"
        case line = "Line"
        case type = "Type"
    }
}
