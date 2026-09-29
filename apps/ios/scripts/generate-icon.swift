import AppKit

let size = 1024
let image = NSImage(size: NSSize(width: size, height: size))
image.lockFocus()
NSColor(calibratedRed: 0.06, green: 0.09, blue: 0.15, alpha: 1).setFill()
NSRect(x: 0, y: 0, width: size, height: size).fill()
NSColor.white.setFill()
NSRect(x: 222, y: 270, width: 100, height: 484).fill()
NSRect(x: 662, y: 270, width: 100, height: 484).fill()
NSRect(x: 322, y: 468, width: 340, height: 100).fill()
NSColor(calibratedRed: 1, green: 0.7, blue: 0.25, alpha: 1).setFill()
NSRect(x: 480, y: 210, width: 280, height: 64).fill() // terminal cursor
image.unlockFocus()
let data = NSBitmapImageRep(data: image.tiffRepresentation!)!.representation(using: .png, properties: [:])!
let target = URL(fileURLWithPath: "apps/ios/HerdrWeb/Resources/Assets.xcassets/AppIcon.appiconset/AppIcon.png")
try data.write(to: target)

// Flatten to an opaque RGB PNG; App Store icons cannot include an alpha channel.
let temporary = FileManager.default.temporaryDirectory.appendingPathComponent("herdr-icon-\(UUID().uuidString).jpg")
defer { try? FileManager.default.removeItem(at: temporary) }
for args in [["-s", "format", "jpeg", target.path, "--out", temporary.path],
             ["-s", "format", "png", temporary.path, "--out", target.path]] {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/sips")
    process.arguments = args
    try process.run()
    process.waitUntilExit()
    guard process.terminationStatus == 0 else { fatalError("Icon conversion failed") }
}
