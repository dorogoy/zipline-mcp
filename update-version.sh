#!/bin/bash

# Check if the version parameter is provided
if [ -z "$1" ]; then
    echo "Usage: $0 <version>"
    exit 1
fi

# Get the version from the first parameter
VERSION="${1#v}"

# Change the version
sed -i "s/\"version\": \".*\"/\"version\": \"$VERSION\"/" package.json

echo "Version $VERSION has been written to package.json"
