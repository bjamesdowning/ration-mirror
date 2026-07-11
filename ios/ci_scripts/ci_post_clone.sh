#!/bin/sh
set -eu

# Xcode Cloud runs this script with ios/ci_scripts as cwd.
cd ..

if ! command -v xcodegen >/dev/null 2>&1; then
	brew install xcodegen
fi

xcodegen generate
