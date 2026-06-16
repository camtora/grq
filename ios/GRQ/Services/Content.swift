import Foundation

struct GlossaryEntry: Identifiable, Equatable {
    let slug: String
    let term: String
    let def: String
    var id: String { slug }
}

/// Reads the shared word layer (../shared/content/*.json), bundled as resources.
/// Same source of truth the web app uses — this is "no separation" for content.
/// The daily selection matches web/lib exactly (see shared/content/README.md).
final class Content {
    static let shared = Content()
    private let glossaryRaw: [String: [String: String]]
    private let daily: [String: Any]

    private init() {
        glossaryRaw = (Content.json("glossary") as? [String: [String: String]]) ?? [:]
        daily = (Content.json("daily") as? [String: Any]) ?? [:]
    }

    static func json(_ name: String) -> Any? {
        guard let url = Bundle.main.url(forResource: name, withExtension: "json"),
              let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONSerialization.jsonObject(with: data)
    }

    func glossary(_ slug: String) -> GlossaryEntry? {
        guard let e = glossaryRaw[slug], let t = e["term"], let d = e["def"] else { return nil }
        return GlossaryEntry(slug: slug, term: t, def: d)
    }

    var glossaryAll: [GlossaryEntry] {
        glossaryRaw.compactMap { k, v in
            guard let t = v["term"], let d = v["def"] else { return nil }
            return GlossaryEntry(slug: k, term: t, def: d)
        }
        .sorted { $0.term < $1.term }
    }

    // 32-bit wrapping hash — matches the JS `h = h*31 + charCode` (BMP inputs).
    private func hash(_ s: String) -> UInt32 {
        var h: UInt32 = 0
        for u in s.unicodeScalars { h = h &* 31 &+ UInt32(truncatingIfNeeded: u.value) }
        return h
    }

    private var dayKey: String {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_CA")
        f.timeZone = TimeZone(identifier: "America/Toronto")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: Date())
    }

    func dailyQuote() -> String {
        let q = (daily["quotes"] as? [String]) ?? []
        return q.isEmpty ? "" : q[Int(hash(dayKey)) % q.count]
    }

    func funFact() -> String {
        let f = (daily["funFacts"] as? [String]) ?? []
        guard !f.isEmpty else { return "" }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "America/Toronto") ?? .current
        let doy = cal.ordinality(of: .day, in: .year, for: Date()) ?? 1
        return f[doy % f.count]
    }

    func greeting(name: String, totalPnlCents: Int, contributionsCents: Int) -> String {
        let g = daily["greetings"] as? [String: Any]
        let bands = (g?["bands"] as? [String: [String]]) ?? [:]
        let pct = contributionsCents > 0 ? Double(totalPnlCents) / Double(contributionsCents) * 100 : 0
        let band = pct >= 5 ? "soaring" : pct >= 1 ? "up" : pct > -1 ? "flat" : pct > -5 ? "down" : "rough"
        let pool = bands[band] ?? bands["flat"] ?? ["Welcome back, {name}."]
        guard !pool.isEmpty else { return "Welcome back, \(name)." }
        return pool[Int(hash(dayKey + name)) % pool.count].replacingOccurrences(of: "{name}", with: name)
    }
}

/// UI strings (../shared/content/strings.json) by dotted keypath, with a fallback.
final class Strings {
    static let shared = Strings()
    private let root: [String: Any]
    private init() { root = (Content.json("strings") as? [String: Any]) ?? [:] }
    func s(_ path: String, _ fallback: String = "") -> String {
        var node: Any? = root
        for key in path.split(separator: ".") { node = (node as? [String: Any])?[String(key)] }
        return (node as? String) ?? fallback
    }
}
