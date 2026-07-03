#!/bin/bash
# GRQ Go Metro dev server — run on Ubuntu. Port 8082 (sbca-metro owns 8081).
# The Mac reaches it via: ssh -N -L 8081:localhost:8082 camerontora@192.168.2.34 &
# Optional alias:  alias grq-metro='~/grq/scripts/grq-metro.sh'
set -e
source ~/.nvm/nvm.sh
cd ~/grq/mobile
REACT_NATIVE_PACKAGER_HOSTNAME=$(hostname -I | awk '{print $1}') \
  exec npx expo start --lan --port 8082
