#!/usr/bin/env bash

echo '' >> ./run.log
echo '-------------------' >> ./run.log
date >> ./run.log

DEBUG=graphmaker* node lib/repl.js 2>> ./run.log
