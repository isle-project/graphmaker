#!/usr/bin/env bash

echo '' >> ./run.log
echo '-------------------' >> ./run.log
date >> ./run.log

DEBUG_DEPTH=10000 DEBUG=graphmaker* node lib/repl.js 2>> ./run.log
