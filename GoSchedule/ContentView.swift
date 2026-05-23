import SwiftUI

struct ContentView: View {
    @StateObject private var scheduleStore = ScheduleStore()
    @State private var selectedDate = Date()

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                ForEach(ScheduleDirection.allCases) { direction in
                    NavigationLink {
                        ScheduleListView(direction: direction, selectedDate: selectedDate)
                            .environmentObject(scheduleStore)
                    } label: {
                        RouteButton(direction: direction)
                    }
                    .buttonStyle(.plain)
                }

                Spacer(minLength: 0)

                DatePicker("Schedule time", selection: $selectedDate, displayedComponents: [.date, .hourAndMinute])
                    .datePickerStyle(.compact)
                    .font(.system(size: 15, weight: .semibold))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .background(Color(.systemGray6))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
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
    let selectedDate: Date

    var body: some View {
        let trips = scheduleStore.trips(for: direction)
        let displayDate = selectedDate.addingTimeInterval(-30 * 60).formatted(date: .abbreviated, time: .shortened)

        List {
            Section {
                VStack(alignment: .leading, spacing: 6) {
                    Text(direction.origin)
                        .font(.system(size: 15, weight: .semibold))
                    Text(direction.destination)
                        .font(.system(size: 24, weight: .bold))
                    Text("Starting from \(displayDate)")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(.secondary)
                }
                .listRowInsets(EdgeInsets(top: 14, leading: 16, bottom: 14, trailing: 16))
            }

            if scheduleStore.isLoading(direction) {
                HStack(spacing: 10) {
                    ProgressView()
                    Text("Loading schedule...")
                        .foregroundStyle(.secondary)
                }
            } else if let errorMessage = scheduleStore.errorMessage(for: direction) {
                Text(errorMessage)
                    .foregroundStyle(.secondary)
            } else if trips.isEmpty {
                Text("No trips found for today.")
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
        .task(id: selectedDate) {
            await scheduleStore.loadTrips(for: direction, relativeTo: selectedDate)
        }
        .refreshable {
            await scheduleStore.loadTrips(for: direction, relativeTo: selectedDate)
        }
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
                if trip.transferCount > 0 {
                    Text("\(trip.transferCount) transfer\(trip.transferCount == 1 ? "" : "s")")
                }
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
