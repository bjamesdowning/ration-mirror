import Foundation
import os

/// DEBUG-only OSSignposts for Instruments profiling of launch and snapshot paths.
enum PerformanceSignposts {
    private static let log = OSLog(subsystem: "app.ration.ios", category: "Performance")

    static func begin(_ name: StaticString) -> OSSignpostID {
        #if DEBUG
        let id = OSSignpostID(log: log)
        os_signpost(.begin, log: log, name: name, signpostID: id)
        return id
        #else
        return OSSignpostID.invalid
        #endif
    }

    static func end(_ name: StaticString, id: OSSignpostID) {
        #if DEBUG
        guard id != .invalid else { return }
        os_signpost(.end, log: log, name: name, signpostID: id)
        #endif
    }
}
