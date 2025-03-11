#!/usr/bin/env sh
# Fetch a new dashboard image, make sure to output it to "$1".
# For example:
battery_percent=$(gasgauge-info -s)
# invoke https://YOUR_DOMAIN/battery/27
"$(dirname "$0")/../xh" -d -q get https://kindle.cheni.dev/battery/$battery_percent

# Fetch the dashboard image
"$(dirname "$0")/../xh" -d -q -o "$1" get https://kindle.cheni/dash.png
