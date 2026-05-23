import Foundation

struct ScheduleFeed: Decodable {
    let source: String
    let feedStartDate: String
    let feedEndDate: String
    let directions: [String: [ScheduledTrip]]
}

struct ScheduledTrip: Decodable, Identifiable {
    let serviceDate: String
    let departureTime: String
    let arrivalTime: String
    let departureDisplay: String
    let arrivalDisplay: String
    let durationMinutes: Int
    let route: String
    let routeName: String
    let mode: String
    let headsign: String

    var id: String {
        "\(serviceDate)-\(departureTime)-\(arrivalTime)-\(route)-\(headsign)"
    }
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
}

@MainActor
final class ScheduleStore: ObservableObject {
    @Published private(set) var feed: ScheduleFeed?
    @Published private(set) var errorMessage: String?

    private let calendar = Calendar(identifier: .gregorian)

    init() {
        load()
    }

    func upcomingTrips(for direction: ScheduleDirection, relativeTo now: Date = Date()) -> [ScheduledTrip] {
        guard let feed else { return [] }

        let threshold = now.addingTimeInterval(-30 * 60)
        let startOfToday = calendar.startOfDay(for: now)
        guard let startOfTomorrow = calendar.date(byAdding: .day, value: 1, to: startOfToday) else {
            return []
        }

        return feed.directions[direction.rawValue, default: []]
            .filter { trip in
                guard let departureDate = date(for: trip.serviceDate, gtfsTime: trip.departureTime) else {
                    return false
                }
                return departureDate >= threshold && departureDate < startOfTomorrow
            }
            .prefix(12)
            .map { $0 }
    }

    private func load() {
        guard let url = Bundle.main.url(forResource: "Schedules", withExtension: "json") else {
            errorMessage = "Schedule data is missing."
            return
        }

        do {
            let data = try Data(contentsOf: url)
            feed = try JSONDecoder().decode(ScheduleFeed.self, from: data)
        } catch {
            errorMessage = "Schedule data could not be loaded."
        }
    }

    private func date(for serviceDate: String, gtfsTime: String) -> Date? {
        guard serviceDate.count == 8 else { return nil }

        let year = Int(serviceDate.prefix(4))
        let month = Int(serviceDate.dropFirst(4).prefix(2))
        let day = Int(serviceDate.suffix(2))
        let timeParts = gtfsTime.split(separator: ":").compactMap { Int($0) }

        guard
            let year,
            let month,
            let day,
            timeParts.count == 3,
            let serviceStart = calendar.date(from: DateComponents(year: year, month: month, day: day))
        else {
            return nil
        }

        let seconds = TimeInterval(timeParts[0] * 3600 + timeParts[1] * 60 + timeParts[2])
        return serviceStart.addingTimeInterval(seconds)
    }
}
