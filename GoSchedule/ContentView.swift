import SwiftUI

struct SchedulePage: Identifiable, Equatable {
    let id: String
    let title: String
    let systemImage: String
    let url: URL
}

private let schedulePages = [
    SchedulePage(
        id: "trip-planner",
        title: "Trip Planner",
        systemImage: "location.magnifyingglass",
        url: URL(string: "https://www.gotransit.com/en/plan-your-trip")!
    ),
    SchedulePage(
        id: "schedules",
        title: "Schedules",
        systemImage: "calendar",
        url: URL(string: "https://www.gotransit.com/en/see-schedules")!
    )
]

struct ContentView: View {
    @State private var selectedPage = schedulePages[0]

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                pagePicker
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                    .background(.regularMaterial)

                ScheduleWebView(url: selectedPage.url)
                    .id(selectedPage.id)
                    .ignoresSafeArea(edges: .bottom)
            }
            .navigationTitle("GO Schedule")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private var pagePicker: some View {
        HStack(spacing: 10) {
            ForEach(schedulePages) { page in
                Button {
                    selectedPage = page
                } label: {
                    Label(page.title, systemImage: page.systemImage)
                        .font(.system(size: 16, weight: .semibold))
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.borderedProminent)
                .tint(selectedPage == page ? Color(red: 0.0, green: 0.42, blue: 0.22) : Color(.systemGray5))
                .foregroundStyle(selectedPage == page ? .white : .primary)
                .accessibilityHint("Loads the GO Transit \(page.title.lowercased()) page")
            }
        }
    }
}

#Preview {
    ContentView()
}
