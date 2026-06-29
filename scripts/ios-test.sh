#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/ios-env.sh"

generate_ios_project
require_full_xcode

TEST_DESTINATION="$(resolve_test_destination)" || exit 1
if [ -z "$TEST_DESTINATION" ]; then
	echo "Could not resolve a simulator destination. Boot an iPhone simulator or set IOS_DESTINATION." >&2
	exit 1
fi
# Reset DerivedData so newly added test cases are never skipped by a stale bundle.
rm -rf "$IOS_DERIVED_DATA"
# Strip extended attributes that can break simulator CodeSign (resource fork detritus).
xattr -cr "$IOS_DIR" 2>/dev/null || true
echo "Testing $IOS_TEST_SCHEME for destination: $TEST_DESTINATION"
xcodebuild test \
	-project "$IOS_PROJECT" \
	-scheme "$IOS_TEST_SCHEME" \
	-destination "$TEST_DESTINATION" \
	-derivedDataPath "$IOS_DERIVED_DATA"
