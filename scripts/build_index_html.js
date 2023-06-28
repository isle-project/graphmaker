const { readFileSync, writeFileSync } = require('fs');
const { join } = require('path');
const MarkdownIt = require('markdown-it');
const { version } = require('./../package.json');

const md = new MarkdownIt({
    html: true,
}).use(require('markdown-it-anchor'), {});

const readme = readFileSync( join( __dirname, '..', 'README.md' ), 'utf-8' );

const indexTemplate = readFileSync( join( __dirname, 'templates', 'index.html' ), 'utf-8' );
const html = md.render( readme );

const index = indexTemplate.replace( '{{content}}', html );

writeFileSync( join( __dirname, '..', 'docs', 'index.html' ), index );
