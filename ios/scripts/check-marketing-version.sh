#!/bin/sh
# Fails when MARKETING_VERSION is not above the last App Store-approved version.
# App Store Connect closes a version's train once Apple approves it, so a reused
# version is rejected (ITMS-90186 / ITMS-90062). Update LAST_APPROVED_VERSION
# after every approval, then bump MARKETING_VERSION.
set -eu
ios_dir="$(cd "$(dirname "$0")/.." && pwd)"
current="$(sed -n 's/^[[:space:]]*MARKETING_VERSION:[[:space:]]*"\{0,1\}\([0-9.]*\)"\{0,1\}.*/\1/p' "$ios_dir/project.yml" | head -n 1)"
approved="$(tr -d '[:space:]' < "$ios_dir/LAST_APPROVED_VERSION")"
if [ -z "$current" ] || [ -z "$approved" ]; then
	echo "error: could not read MARKETING_VERSION or LAST_APPROVED_VERSION" >&2
	exit 1
fi
highest="$(printf '%s\n%s\n' "$current" "$approved" | sort -t. -k1,1n -k2,2n -k3,3n | tail -n 1)"
if [ "$current" = "$approved" ] || [ "$highest" != "$current" ]; then
	echo "error: MARKETING_VERSION $current must be above the last App Store-approved version $approved. Bump it in ios/project.yml." >&2
	exit 1
fi
echo "MARKETING_VERSION $current is above last approved $approved"
