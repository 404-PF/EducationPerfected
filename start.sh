#!/usr/bin/env bash
cd "$(dirname "$0")" || exit 1

if [ ! -f node_modules/puppeteer/package.json ]; then
    echo 'Dependencies are not installed yet. Running "npm ci" once...'
    if ! npm ci; then
        echo
        echo '"npm ci" failed. Install Node.js 22.12 or newer and run "npm ci" in this folder.'
        read -r -p 'Press enter to close'
        exit 1
    fi
fi

node index.js
read -r -p 'Press enter to close'
