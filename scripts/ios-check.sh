#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/ios-env.sh"

generate_ios_project
require_full_xcode

# Reset DerivedData once up front so both the build and the (fresh) test bundle
# are compiled from current sources — guards against stale incremental test
# bundles silently skipping newly added test cases.
rm -rf "$IOS_DERIVED_DATA"

echo "Building $IOS_SCHEME for destination: $IOS_DESTINATION"
xcodebuild build \
	-project "$IOS_PROJECT" \
	-scheme "$IOS_SCHEME" \
	-destination "$IOS_DESTINATION" \
	-derivedDataPath "$IOS_DERIVED_DATA" \
	"${IOS_SIM_SIGNING_FLAGS[@]}"

TEST_DESTINATION="$(resolve_test_destination)" || exit 1
if [ -z "$TEST_DESTINATION" ]; then
	echo "Could not resolve a simulator destination. Boot an iPhone simulator or set IOS_DESTINATION." >&2
	exit 1
fi
echo "Testing $IOS_TEST_SCHEME for destination: $TEST_DESTINATION"
xcodebuild test \
	-project "$IOS_PROJECT" \
	-scheme "$IOS_TEST_SCHEME" \
	-destination "$TEST_DESTINATION" \
	-derivedDataPath "$IOS_DERIVED_DATA" \
	"${IOS_SIM_SIGNING_FLAGS[@]}"
