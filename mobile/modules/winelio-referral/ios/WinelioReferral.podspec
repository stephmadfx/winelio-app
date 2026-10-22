Pod::Spec.new do |s|
  s.name = 'WinelioReferral'
  s.version = '1.0.0'
  s.summary = 'Transmission des invitations Winelio'
  s.description = s.summary
  s.license = { :type => 'MIT' }
  s.author = 'Winelio'
  s.homepage = 'https://winelio.app'
  s.source = { :git => 'https://github.com/stephmadfx/winelio-app.git' }
  s.platform = :ios, '15.1'
  s.swift_version = '5.9'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.swift'
  s.resource_bundles = { 'WinelioReferralPrivacy' => ['PrivacyInfo.xcprivacy'] }
end
