#!/bin/sh
set -eu

# Xcode Cloud runs this script with ios/ci_scripts as cwd.
cd ..

if ! command -v xcodegen >/dev/null 2>&1; then
	brew install xcodegen
fi

xcodegen generate

# Xcode Cloud disables automatic SPM resolution; pin versions via Package.resolved.
swiftpm_dir="Ration.xcodeproj/project.xcworkspace/xcshareddata/swiftpm"
mkdir -p "$swiftpm_dir"
cp swiftpm/Package.resolved "$swiftpm_dir/Package.resolved"
