import XCTest
@testable import GoSchedule

final class JourneyRequestTests: XCTestCase {
    func testNoKnownScheduleDateUsesSelectedDateMinusThirtyMinutes() throws {
        let selectedDate = try makeDate(year: 2026, month: 5, day: 23, hour: 10, minute: 0)
        let request = JourneyRequest(
            direction: .unionToMaple,
            selectedDate: selectedDate,
            maxJourneyCount: 12,
            apiKey: "test-key"
        )

        XCTAssertEqual(request.apiDate, "20260523")
        XCTAssertEqual(request.apiStartTime, "0930")
        XCTAssertEqual(request.path, "/OpenDataAPI/api/V1/Schedule/Journey/20260523/UN/MP/0930/12")
        XCTAssertEqual(request.url?.query, "key=test-key")
    }

    func testKnownScheduleDateUsesSelectedDateMinusThirtyMinutes() throws {
        let selectedDate = try makeDate(year: 2026, month: 5, day: 25, hour: 10, minute: 23)
        let request = JourneyRequest(
            direction: .mapleToUnion,
            selectedDate: selectedDate,
            maxJourneyCount: 12,
            apiKey: "test-key"
        )

        XCTAssertEqual(request.apiDate, "20260525")
        XCTAssertEqual(request.apiStartTime, "0953")
        XCTAssertEqual(request.path, "/OpenDataAPI/api/V1/Schedule/Journey/20260525/MP/UN/0953/12")
        XCTAssertEqual(request.url?.query, "key=test-key")
    }

    private func makeDate(year: Int, month: Int, day: Int, hour: Int, minute: Int) throws -> Date {
        let components = DateComponents(
            calendar: Calendar(identifier: .gregorian),
            timeZone: .current,
            year: year,
            month: month,
            day: day,
            hour: hour,
            minute: minute
        )

        return try XCTUnwrap(components.date)
    }
}
