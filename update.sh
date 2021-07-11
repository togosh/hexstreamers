#!/bin/bash
forever list
forever stop 0
sudo killall firefox
git pull
npm install
forever start index.js
forever logs
forever logs 0 -f