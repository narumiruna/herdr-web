import SwiftUI

struct ConnectionView: View {
    @EnvironmentObject private var store: WorkbenchStore
    @Binding var isPresented: Bool
    @State private var address = ""
    @State private var token = ""
    @State private var localHTTP = false
    @State private var connecting = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Your herdr-web bridge") {
                    TextField("https://bridge.example.com", text: $address)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                        .accessibilityIdentifier("bridgeURL")
                    SecureField("Access token", text: $token)
                        .textContentType(.password)
                        .accessibilityIdentifier("bridgeToken")
                }
                Section {
                    Toggle("Allow local HTTP for development", isOn: $localHTTP)
                    Text("Only localhost and .local hosts are allowed over HTTP. On a real iPhone, localhost is the phone, not your computer. Use trusted HTTPS for other addresses.")
                        .font(.footnote)
                }
                if let notice = store.notice {
                    Section { Text(notice).foregroundStyle(.red) }
                }
                Section {
                    Button(connecting ? "Connecting…" : "Connect") {
                        connecting = true
                        Task {
                            await store.connect(url: address, token: token, allowLocalHTTP: localHTTP)
                            connecting = false
                            if store.connected { token = ""; isPresented = false }
                        }
                    }
                    .disabled(connecting || store.isSending)
                    .accessibilityIdentifier("connectButton")
                }
            }
            .navigationTitle("Connection")
            .toolbar { if store.connected { Button("Cancel") { isPresented = false } } }
            .onAppear { address = store.savedURL; localHTTP = store.localHTTP }
        }
    }
}
