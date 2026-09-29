import XCTest

final class SmokeTests: XCTestCase {
    private func setAvailability(_ available: Bool) async throws {
        var request = URLRequest(url: URL(string: "http://127.0.0.1:18997/smoke/\(available ? "online" : "offline")")!)
        request.httpMethod = "POST"
        let (_, response) = try await URLSession.shared.data(for: request)
        XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200)
    }

    private func setActiveTab(_ tabID: String) async throws {
        var request = URLRequest(url: URL(string: "http://127.0.0.1:18997/smoke/focus/\(tabID)")!)
        request.httpMethod = "POST"
        let (_, response) = try await URLSession.shared.data(for: request)
        XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200)
    }

    private func setOutput(_ mode: String) async throws {
        var request = URLRequest(url: URL(string: "http://127.0.0.1:18997/smoke/output/\(mode)")!)
        request.httpMethod = "POST"
        let (_, response) = try await URLSession.shared.data(for: request)
        XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200)
    }

    @MainActor
    func testBadTokenAndOfflineRecovery() async throws {
        try await setAvailability(true)
        let app = XCUIApplication()
        app.launch()
        if !app.textFields["bridgeURL"].waitForExistence(timeout: 5) {
            app.buttons["actionsMenu"].tap()
            app.buttons["Disconnect"].tap()
        }
        let address = app.textFields["bridgeURL"]
        XCTAssertTrue(address.waitForExistence(timeout: 15))
        address.tap()
        address.typeText("http://localhost:18997")
        let token = app.secureTextFields["bridgeToken"]
        token.tap()
        token.typeText("wrongpass")
        app.staticTexts["Connection"].tap()
        let localHTTP = app.switches["Allow local HTTP for development"]
        if (localHTTP.value as? String) != "1" {
            localHTTP.coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.5)).tap()
        }
        XCTAssertEqual(localHTTP.value as? String, "1")
        app.buttons["connectButton"].tap()
        XCTAssertTrue(app.staticTexts["Invalid or expired token. Check the connection settings."].waitForExistence(timeout: 10))
        XCTAssertFalse(app.staticTexts["Alpha"].exists)
        token.tap()
        token.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: 9) + "smoke-controller")
        app.staticTexts["Connection"].tap()
        app.buttons["connectButton"].tap()
        XCTAssertTrue(app.staticTexts["Alpha"].waitForExistence(timeout: 15))
        XCTAssertTrue(address.waitForNonExistence(timeout: 10))
        try await setAvailability(false)
        app.buttons["actionsMenu"].tap()
        app.buttons["Refresh"].tap()
        XCTAssertTrue(app.staticTexts["The bridge rejected the request (HTTP 503)."].waitForExistence(timeout: 10))
        try await setAvailability(true)
        let notice = app.staticTexts["The bridge rejected the request (HTTP 503)."]
        let gone = NSPredicate(format: "exists == false")
        let recovered = expectation(for: gone, evaluatedWith: notice)
        await fulfillment(of: [recovered], timeout: 20)
        XCTAssertTrue(app.staticTexts["Alpha"].exists)
        try await setAvailability(false)
        app.terminate()
        app.launch()
        XCTAssertTrue(app.staticTexts["The bridge rejected the request (HTTP 503)."].waitForExistence(timeout: 15))
        let retry = app.buttons["retrySavedConnection"]
        XCTAssertTrue(retry.waitForExistence(timeout: 10))
        try await setAvailability(true)
        retry.tap() // The stored Keychain token is reused; it is not exposed to the UI.
        XCTAssertTrue(app.staticTexts["Alpha"].waitForExistence(timeout: 15))
    }

    @MainActor
    func testControllerAndViewerNavigation() async throws {
        try await setAvailability(true)
        let app = XCUIApplication()
        app.launch()
        let address = app.textFields["bridgeURL"]
        if !address.waitForExistence(timeout: 5) {
            let menu = app.buttons["actionsMenu"]
            XCTAssertTrue(menu.waitForExistence(timeout: 15))
            menu.tap()
            app.buttons["Connection"].tap()
        }
        XCTAssertTrue(address.waitForExistence(timeout: 15))
        if (address.value as? String) != "http://localhost:18997" {
            address.tap()
            address.typeText("http://localhost:18997")
        }
        let token = app.secureTextFields["bridgeToken"]
        token.tap()
        token.typeText("smoke-controller")
        app.staticTexts["Connection"].tap() // dismiss the software keyboard
        let localHTTP = app.switches["Allow local HTTP for development"]
        if (localHTTP.value as? String) != "1" {
            localHTTP.coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.5)).tap()
        }
        XCTAssertEqual(localHTTP.value as? String, "1")
        app.buttons["connectButton"].tap()

        XCTAssertTrue(app.staticTexts["Alpha"].waitForExistence(timeout: 15))
        XCTAssertTrue(address.waitForNonExistence(timeout: 10))
        XCTAssertFalse(app.staticTexts["smoke-controller"].exists)
        app.staticTexts["Alpha"].tap()
        app.staticTexts["Code"].tap()
        XCTAssertFalse(app.staticTexts["Other panes · Read-only"].exists)
        app.staticTexts["Agent · working"].tap()
        XCTAssertTrue(app.staticTexts["\u{e0b0} agent output"].waitForExistence(timeout: 10))
        try await setActiveTab("t2") // Runtime focus moves elsewhere, but the supervised pane stays pinned.
        let focusedShell = app.buttons["tab-t2"]
        let focused = expectation(for: NSPredicate(format: "value == %@", "Focused in Herdr"), evaluatedWith: focusedShell)
        await fulfillment(of: [focused], timeout: 10)
        let draft = app.descendants(matching: .any)["agentDraft"]
        XCTAssertTrue(draft.exists)
        draft.tap()
        draft.typeText("hello from simulator")
        XCTAssertTrue(app.buttons["tab-t2"].exists) // Tabs remain available while supervising a pane.
        app.buttons["tab-t2"].tap()
        XCTAssertTrue(app.staticTexts["Terminal · Read-only"].waitForExistence(timeout: 10))
        app.buttons["tab-t1"].tap()
        app.staticTexts["Agent · working"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["agentDraft"].value as? String == "hello from simulator")
        try await setActiveTab("t1")
        app.buttons["sendPrompt"].tap()
        XCTAssertTrue(app.staticTexts["Prompt accepted."].waitForExistence(timeout: 10))
        app.terminate()
        app.launch()
        XCTAssertTrue(app.staticTexts["Alpha"].waitForExistence(timeout: 15)) // Keychain restoration
        let menu = app.buttons["actionsMenu"]
        menu.tap()
        app.buttons["Connection"].tap()
        XCTAssertTrue(app.textFields["bridgeURL"].waitForExistence(timeout: 15))
        let badSwitchToken = app.secureTextFields["bridgeToken"]
        badSwitchToken.tap()
        badSwitchToken.typeText("wrongpass")
        app.staticTexts["Connection"].tap()
        app.buttons["connectButton"].tap()
        XCTAssertTrue(app.staticTexts["Invalid or expired token. Check the connection settings."].waitForExistence(timeout: 10))
        XCTAssertTrue(app.textFields["bridgeURL"].exists) // A failed switch must not dismiss the sheet.
        let viewerToken = app.secureTextFields["bridgeToken"]
        viewerToken.tap()
        viewerToken.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: 9) + "smoke-viewer")
        app.staticTexts["Connection"].tap()
        let viewerHTTP = app.switches["Allow local HTTP for development"]
        if (viewerHTTP.value as? String) != "1" {
            viewerHTTP.coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.5)).tap()
        }
        app.buttons["connectButton"].tap()
        XCTAssertTrue(app.staticTexts["Viewer"].waitForExistence(timeout: 15))
        app.staticTexts["Alpha"].tap()
        app.staticTexts["Code"].tap()
        app.staticTexts["Agent · working"].tap()
        XCTAssertFalse(app.buttons["sendPrompt"].exists)
        XCTAssertTrue(app.staticTexts["\u{e0b0} agent output"].exists)
    }

    @MainActor
    func testOutputFollowsUntilIntentionalScrollback() async throws {
        try await setAvailability(true)
        try await setOutput("long")
        let app = XCUIApplication()
        app.launch()
        if !app.staticTexts["Alpha"].waitForExistence(timeout: 5) {
            let address = app.textFields["bridgeURL"]
            XCTAssertTrue(address.waitForExistence(timeout: 15))
            address.tap()
            address.typeText("http://localhost:18997")
            let token = app.secureTextFields["bridgeToken"]
            token.tap()
            token.typeText("smoke-viewer")
            app.staticTexts["Connection"].tap()
            let localHTTP = app.switches["Allow local HTTP for development"]
            if (localHTTP.value as? String) != "1" {
                localHTTP.coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.5)).tap()
            }
            app.buttons["connectButton"].tap()
            XCTAssertTrue(app.staticTexts["Alpha"].waitForExistence(timeout: 15))
        }
        let search = app.searchFields.firstMatch
        XCTAssertTrue(search.waitForExistence(timeout: 10))
        search.tap()
        search.typeText("Claude")
        XCTAssertTrue(app.staticTexts["Claude"].waitForExistence(timeout: 10))
        app.staticTexts["Claude"].tap() // Jump directly to the Agent from a workspace-wide search.
        let output = app.scrollViews["outputPreview"]
        XCTAssertTrue(output.waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["Latest"].exists)
        output.swipeDown() // Intentionally scroll back, rather than losing position on an update.
        XCTAssertTrue(app.buttons["Latest"].waitForExistence(timeout: 10))
        try await setOutput("updated")
        let updated = app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "new tail")).firstMatch
        XCTAssertTrue(updated.waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["Latest"].exists)
        app.buttons["Latest"].tap()
        XCTAssertFalse(app.buttons["Latest"].exists)
        try await setOutput("short")
    }
}
