#!/bin/bash

export MONGO_URL="mongodb://127.0.0.1:27017/kvazar"
export ROOT_URL="http://kvazarjs.com"
export METEOR_SETTINGS="$(cat config/production/settings.json)"
export PORT="8087"

