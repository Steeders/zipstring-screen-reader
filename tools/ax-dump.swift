// Dumps the macOS accessibility tree of a running app (the tree VoiceOver reads) as JSON lines.
// Usage: swift tools/ax-dump.swift <app name> <out file>
import AppKit
import ApplicationServices

let args = CommandLine.arguments
let appName = args.count > 1 ? args[1] : "Playwright"
let outPath = args.count > 2 ? args[2] : "ax.jsonl"

print("AXIsProcessTrusted:", AXIsProcessTrusted())
guard let app = NSWorkspace.shared.runningApplications.first(where: { $0.localizedName == appName }) else {
  print("app not running:", appName); exit(2)
}
let root = AXUIElementCreateApplication(app.processIdentifier)

func attr(_ el: AXUIElement, _ name: String) -> AnyObject? {
  var v: AnyObject?
  return AXUIElementCopyAttributeValue(el, name as CFString, &v) == .success ? v : nil
}
func str(_ v: AnyObject?) -> String? {
  if let s = v as? String { return s }
  if let n = v as? NSNumber { return n.stringValue }
  if let a = v as? [String] { return a.joined(separator: " ") }
  return nil
}

var lines: [String] = []
var count = 0
func walk(_ el: AXUIElement, _ path: [Int], _ depth: Int) {
  if depth > 80 || count > 60000 { return }
  count += 1
  var rec: [String: Any] = ["path": path.map(String.init).joined(separator: ".")]
  for (k, a) in [("role", "AXRole"), ("subrole", "AXSubrole"), ("roleDesc", "AXRoleDescription"), ("title", "AXTitle"),
                 ("desc", "AXDescription"), ("value", "AXValue"), ("help", "AXHelp"), ("domId", "AXDOMIdentifier"),
                 ("domClass", "AXDOMClassList"), ("expanded", "AXExpanded"), ("hidden", "AXHidden")] {
    if let s = str(attr(el, a)), !s.isEmpty { rec[k] = String(s.prefix(160)) }
  }
  let kids = (attr(el, "AXChildren") as? [AXUIElement]) ?? []
  rec["kids"] = kids.count
  if let d = try? JSONSerialization.data(withJSONObject: rec), let s = String(data: d, encoding: .utf8) { lines.append(s) }
  for (i, k) in kids.enumerated() { walk(k, path + [i], depth + 1) }
}
walk(root, [], 0)
try! lines.joined(separator: "\n").write(toFile: outPath, atomically: true, encoding: .utf8)
print("nodes:", count, "->", outPath)
