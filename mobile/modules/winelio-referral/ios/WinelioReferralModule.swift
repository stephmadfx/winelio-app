import ExpoModulesCore
import UIKit

public class WinelioReferralModule: Module {
  public func definition() -> ModuleDefinition {
    Name("WinelioReferral")

    Function("getItem") { (key: String) -> String? in
      UserDefaults.standard.string(forKey: "winelio.referral." + key)
    }
    Function("setItem") { (key: String, value: String?) in
      UserDefaults.standard.set(value, forKey: "winelio.referral." + key)
    }

    AsyncFunction("hasClipboardLink") { (promise: Promise) in
      UIPasteboard.general.detectPatterns(for: [.probableWebURL]) { result in
        switch result {
        case .success(let patterns): promise.resolve(patterns.contains(.probableWebURL))
        case .failure: promise.resolve(false)
        }
      }
    }.runOnQueue(.main)

    AsyncFunction("readClipboardLink") { () -> String? in
      // Lecture uniquement après le geste explicite de collage ; iOS gère son autorisation.
      guard UIApplication.shared.applicationState == .active,
            let text = UIPasteboard.general.string,
            text.utf8.count <= 2048,
            let url = URLComponents(string: text.trimmingCharacters(in: .whitespacesAndNewlines)),
            url.scheme == "https", url.host == "winelio.app",
            url.user == nil, url.password == nil, url.port == nil,
            ["/", "/auth/login"].contains(url.path) else { return nil }
      return text
    }.runOnQueue(.main)
  }
}
