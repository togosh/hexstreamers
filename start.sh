#!/bin/bash
forever list
forever stop 0
sudo killall firefox
forever start index.js
forever logs
forever logs 0 -f