import SwiftUI

struct OutputView: View {
    @EnvironmentObject private var store: WorkbenchStore
    let paneID: String
    @State private var followingOutput = true

    var body: some View {
        Group {
            if let output = store.state?.output(for: paneID) {
                ScrollViewReader { proxy in
                    ScrollView {
                        Text(output)
                            .font(.custom("JetBrainsMonoNFM-Regular", size: 12))
                            .textSelection(.enabled)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding()
                        Color.clear.frame(height: 1).id("output-bottom")
                    }
                    .simultaneousGesture(DragGesture(minimumDistance: 12).onChanged { gesture in
                        if gesture.translation.height > 12 { followingOutput = false }
                    })
                    .overlay(alignment: .bottomTrailing) {
                        if !followingOutput {
                            Button("Latest", systemImage: "arrow.down") {
                                followingOutput = true
                                proxy.scrollTo("output-bottom", anchor: .bottom)
                            }
                            .buttonStyle(.borderedProminent)
                            .padding()
                        }
                    }
                    .onAppear { if followingOutput { proxy.scrollTo("output-bottom", anchor: .bottom) } }
                    .onChange(of: output) { _, _ in
                        guard followingOutput else { return }
                        Task { @MainActor in
                            await Task.yield() // Scroll after the updated content has been laid out.
                            if followingOutput { proxy.scrollTo("output-bottom", anchor: .bottom) }
                        }
                    }
                    .accessibilityIdentifier("outputPreview")
                }
            } else {
                ContentUnavailableView("No recent output", systemImage: "terminal", description:
                    Text(store.state?.readErrors[paneID] ?? "This is a bounded, read-only snapshot; interactive terminal output is not available."))
            }
        }
        .navigationTitle("Recent output")
        .refreshable { await store.refresh() }
    }
}
