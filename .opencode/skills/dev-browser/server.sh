#!/bin/bash

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Change to the script directory
if ! cd "$SCRIPT_DIR"; then
    echo "Failed to cd to $SCRIPT_DIR"
    exit 1
fi

# Parse command line arguments
HEADLESS=false
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --headless) HEADLESS=true ;;
        *) echo "Unknown parameter: $1"; exit 1 ;;
    esac
    shift
done

echo "Installing dependencies..."
npm install

echo "Starting dev-browser server..."
export HEADLESS=$HEADLESS
npx tsx scripts/start-server.ts
