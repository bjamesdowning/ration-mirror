import Foundation

extension AskViewModel {
    // MARK: - Socket lifecycle

    func ensureSocket(auth: AuthManager) -> any AskSocketClient {
        if let socket {
            return socket
        }
        let created = makeSocket(auth, conversationId)
        socket = created
        return created
    }

    /// Cancel (optional), disconnect, nil the client, and bump generation so a
    /// later observe loop ignores events from this connection.
    func tearDownSocket(cancelActive: Bool) async {
        let previousSocket = socket
        // Drop the retained client immediately so a concurrent resume/send cannot
        // re-observe a poisoned AsyncStream while cancel is in flight.
        socket = nil
        isConnected = false
        connectionGeneration += 1
        streamTask?.cancel()
        streamTask = nil
        if cancelActive {
            try? await previousSocket?.cancelActiveRequest()
        }
        previousSocket?.disconnect()
    }

    func dropLiveSocket() {
        streamTask?.cancel()
        streamTask = nil
        socket?.disconnect()
        socket = nil
        isConnected = false
        connectionGeneration += 1
    }

    func observe(_ socket: any AskSocketClient) {
        let generation = connectionGeneration
        streamTask?.cancel()
        streamTask = Task { [weak self] in
            for await event in socket.events() {
                guard let self, self.connectionGeneration == generation else { continue }
                guard self.shouldAcceptObservedEvent(event) else { continue }
                self.apply(event)
            }
        }
    }
}
