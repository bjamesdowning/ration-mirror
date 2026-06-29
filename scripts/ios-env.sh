#!/usr/bin/env bash
set -euo pipefail

IOS_PROJECT="ios/Ration.xcodeproj"
IOS_SCHEME="Ration"
IOS_TEST_SCHEME="RationTests"
IOS_DESTINATION="${IOS_DESTINATION:-generic/platform=iOS Simulator}"
# Project-local DerivedData so the gate is isolated from (and never wipes) the
# user's Xcode GUI cache. Resetting this path before a test run is how we avoid
# stale incremental test bundles — a combined `xcodebuild clean test` breaks
# simulator destination resolution, so we can't use it.
IOS_DERIVED_DATA="${IOS_DERIVED_DATA:-ios/.build/DerivedData}"

require_command() {
	local name="$1"
	if ! command -v "$name" >/dev/null 2>&1; then
		echo "Missing required command: $name" >&2
		return 1
	fi
}

require_full_xcode() {
	require_command xcodebuild
	if ! xcodebuild -version >/dev/null 2>&1; then
		echo "xcodebuild is not usable. Install/open full Xcode, then run:" >&2
		echo "  sudo xcode-select -s /Applications/Xcode.app/Contents/Developer" >&2
		return 1
	fi
}

generate_ios_project() {
	require_command xcodegen
	(cd ios && xcodegen generate)
}

# XCTest cannot run on the abstract "generic/platform=iOS Simulator" destination
# (xcodebuild: "Tests must be run on a concrete device"). When the caller hasn't
# pinned a concrete destination, resolve one: prefer a Booted simulator, then the
# first available iPhone. Build steps can keep using the generic destination.
resolve_test_destination() {
	if [ -n "${IOS_DESTINATION:-}" ] && [ "$IOS_DESTINATION" != "generic/platform=iOS Simulator" ]; then
		echo "$IOS_DESTINATION"
		return 0
	fi

	# `grep -m1` (not `| head`) avoids SIGPIPE races that, under `set -o pipefail`,
	# can collapse the pipeline result to an empty string.
	local devices line udid
	local udid_re='[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}'
	devices="$(xcrun simctl list devices available)"
	line="$(printf '%s\n' "$devices" | grep "iPhone" | grep -m1 "(Booted)" || true)"
	if [ -z "$line" ]; then
		line="$(printf '%s\n' "$devices" | grep -m1 "iPhone" || true)"
	fi
	udid="$(printf '%s' "$line" | grep -oE "$udid_re" || true)"

	if [ -z "$udid" ]; then
		echo "No available iPhone simulator found. Create one in Xcode, then retry." >&2
		return 1
	fi

	echo "platform=iOS Simulator,id=$udid"
}
