#!/usr/bin/env bash

echo '' >> ./run.log
echo '-------------------' >> ./run.log
date >> ./run.log

DEBUG_MAX_STRING_LENGTH=50000 DEBUG_DEPTH=10000 DEBUG=graphmaker* node lib/repl.js 2>> ./run.log
