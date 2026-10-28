#!/usr/bin/env bash
# bin/launch.js checks the Node version and dependencies before starting the program.
cd "$(dirname "$0")" || exit 1
node bin/launch.js
status=$?
if [[ "$status" -ne 0 ]]; then
    echo >&2
    echo 'The program stopped with an error; the message above says why.' >&2
    read -r -p 'Press enter to close'
fi
exit "$status"
