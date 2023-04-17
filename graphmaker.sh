#!/bin/bash

# Check if curl or wget is installed:
if ! command -v curl >/dev/null && ! command -v wget >/dev/null; then
  echo "We cannot find curl or wget. Please install curl or wget and try again."
  exit 1
fi

# Check if Node.js / npm is installed:
if ! command -v node >/dev/null; then
  echo "Installing Node.js via nvm"
  if command -v curl >/dev/null; then
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.3/install.sh | bash
  else
    wget -qO- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.3/install.sh | bash
  fi
  source ~/.bashrc
  nvm install node
fi

if ! (npm list -g graphmaker > /dev/null) then
  npm install -g graphmaker
  echo "Use the :config command to set your API key from within the session."
  echo "You can set up a configuration file in ~/.graphmaker.config that sets this persistently."
fi

exec graphmaker $*
