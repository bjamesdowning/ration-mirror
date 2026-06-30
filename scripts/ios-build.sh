#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/ios-env.sh"

generate_ios_project
require_full_xcode

echo "Building $IOS_SCHEME for destination: $IOS_DESTINATION"
xcodebuild build \
	-project "$IOS_PROJECT" \
	-scheme "$IOS_SCHEME" \
	-destination "$IOS_DESTINATION" \
	-derivedDataPath "$IOS_DERIVED_DATA" \
	"${IOS_SIM_SIGNING_FLAGS[@]}"
