import SwiftUI

struct ContentView: View {
    @StateObject private var scheduleStore = ScheduleStore()

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                ForEach(ScheduleDirection.allCases) { direction in
                    NavigationLink {
                        ScheduleListView(direction: direction)
                            .environmentObject(scheduleStore)
                    } label: {
                        RouteButton(direction: direction)
                    }
                    .buttonStyle(.plain)
                }

                Spacer(minLength: 0)
            }
            .padding(20)
            .navigationTitle("GO Schedule")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

private struct RouteButton: View {
    let direction: ScheduleDirection

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: direction.systemImage)
                .font(.system(size: 22, weight: .bold))
                .frame(width: 36, height: 36)
                .background(Color.white.opacity(0.16))
                .clipShape(RoundedRectangle(cornerRadius: 8))

            VStack(alignment: .leading, spacing: 4) {
                Text(direction.title)
                    .font(.system(size: 22, weight: .bold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)

                Text("\(direction.origin) -> \(direction.destination)")
                    .font(.system(size: 14, weight: .medium))
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
                    .foregroundStyle(.white.opacity(0.86))
            }

            Spacer()
        }
        .foregroundStyle(.white)
        .padding(18)
        .frame(maxWidth: .infinity, minHeight: 104)
        .background(Color(red: 0.0, green: 0.42, blue: 0.22))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}

private struct ScheduleListView: View {
    @EnvironmentObject private var scheduleStore: ScheduleStore

    let direction: ScheduleDirection

    var body: some View {
        let trips = scheduleStore.upcomingTrips(for: direction)

        List {
            Section {
                VStack(alignment: .leading, spacing: 6) {
                    Text(direction.origin)
                        .font(.system(size: 15, weight: .semibold))
                    Text(direction.destination)
                        .font(.system(size: 24, weight: .bold))
                    Text("Today, starting from 30 minutes ago")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(.secondary)
                }
                .listRowInsets(EdgeInsets(top: 14, leading: 16, bottom: 14, trailing: 16))
            }

            if let errorMessage = scheduleStore.errorMessage {
                Text(errorMessage)
                    .foregroundStyle(.secondary)
            } else if trips.isEmpty {
                Text("No direct trips found for today in the bundled schedule.")
                    .foregroundStyle(.secondary)
            } else {
                Section("Next trips") {
                    ForEach(trips) { trip in
                        TripRow(trip: trip)
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle(direction.title)
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct TripRow: View {
    let trip: ScheduledTrip

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text(trip.departureDisplay)
                    .font(.system(size: 28, weight: .bold, design: .rounded))
                    .monospacedDigit()

                Image(systemName: "arrow.right")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.secondary)

                Text(trip.arrivalDisplay)
                    .font(.system(size: 22, weight: .semibold, design: .rounded))
                    .monospacedDigit()

                Spacer()
            }

            HStack(spacing: 8) {
                Text(trip.mode)
                Text(trip.route)
                Text("\(trip.durationMinutes) min")
            }
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(.secondary)
        }
        .padding(.vertical, 8)
    }
}

#Preview {
    ContentView()
}
