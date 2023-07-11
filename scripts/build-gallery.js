const { readFileSync, writeFileSync } = require('fs');
const { join } = require('path');
const dedent = require('dedent');
const kebabcase = require('@stdlib/string-base-kebabcase');
const manifest = require( './../examples/manifest.json' );


const galleryTemplate = readFileSync( join( __dirname, 'templates', 'gallery.html' ), 'utf8' );
const itemTemplate = readFileSync( join( __dirname, 'templates', 'gallery_item.html' ), 'utf8' );

function generateGalleryItemPage({ name, svg, json, tasks }) {
    const modifiedSvg = svg
      .replace(/style="([^"]*)"/, '')
      .replace(/width="([^"]*)"/, '')
      .replace(/height="([^"]*)"/, '');

    const body = dedent`
      <div class="container mx-auto px-4 py-2 pt-16">
        <div class="flex flex-wrap py-8">
          <div class="w-full md:w-1/2 mb-16 pl-2 pr-2 relative max-h-screen">
            <div class="bg-white rounded-lg overflow-hidden shadow-md p-8">
              <div>
                <h3 class="text-lg font-semibold mb-2">${name}</h3>
              </div>
              <div class="mb-8">
                <div id="svg-container">${modifiedSvg}</div>
                <div class="mt-4 pl-2 absolute bottom-6 left-4">
                    <a href="/gallery.html" class="text-indigo-600 font-semibold">Back to Gallery</a>
                </div>
                <button class="bg-indigo-500 hover:bg-indigo-600 text-white font-semibold py-2 px-4 rounded absolute bottom-4 right-4" onclick="downloadSvg()">
                    Download SVG
                </button>
              </div>
            </div>
          </div>
          <div class="w-full md:w-1/2 pl-2 pr-2">
            <div class="bg-white rounded-lg overflow-hidden shadow-md h-128 relative">
              <h3 class="text-lg font-bold p-4">Tasks</h3>
              <div class="p-4 text-gray-700 whitespace-pre-line" id="tasks" >${tasks}</div>
              <button type="button" class="bg-indigo-500 hover:bg-indigo-600 text-white py-1 px-2 rounded absolute top-4 right-4 cursor-pointer" onclick="copyToClipboard('tasks')">Copy Tasks</button>
            </div>
            <div class="bg-white rounded-lg overflow-hidden shadow-md mt-4 relative">
              <h3 class="text-lg font-bold mb-2 p-4">JSON Representation</h3>
              <pre class="bg-gray-100 p-4 text-gray-800 max-h-96 overflow-y-auto" id="json">${json}</pre>
              <button type="button" class="bg-indigo-500 hover:bg-indigo-600 text-white py-1 px-2 rounded absolute top-4 right-4 cursor-pointer" onclick="copyToClipboard('json')">Copy JSON</button>
            </div>
          </div>
        </div>
      </div>`;

    return itemTemplate.replace('{{title}}', name).replace('{{body}}', body);
}

function generateGalleryPage(manifest) {
    const tiles = manifest.map(({ name, path }) => {
      const svg = readFileSync( join( __dirname, '..', 'examples', path, 'graph.svg' ), 'utf8' )
        .replace(/style="([^"]*)"/, '')
        .replace(/width="([^"]*)"/, '')
        .replace(/height="([^"]*)"/, '');
      return `<a href="/graphs/${kebabcase(name)}.html" class="bg-gray-100 hover:bg-gray-200 rounded-lg shadow-lg p-4 mb-4">
            <h3 class="font-semibold">${name}</h3>
            ${svg}
        </a>`;
    });

    const gallery = dedent`<div class="container mx-auto px-4 py-2 mt-2 max-w-3xl">
        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            ${tiles.join('\n')}
        </div>
    </div>`;
    return galleryTemplate.replace('{{gallery}}', gallery);
}

for ( let i = 0; i < manifest.length; i++ ) {
    const { name, path } = manifest[i];
    const svg = readFileSync( join( __dirname, '..', 'examples', path, 'graph.svg' ), 'utf8' );
    const json = readFileSync( join( __dirname, '..', 'examples', path, 'graph.json' ), 'utf8' );
    const tasks = readFileSync( join( __dirname, '..', 'examples', path, 'tasks.txt' ), 'utf8' );

    const html = generateGalleryItemPage({ name, svg, json, tasks });
    writeFileSync( join( __dirname, '..', 'docs', 'graphs', `${kebabcase(name)}.html` ), html, 'utf8' );
}

const galleryHTML = generateGalleryPage(manifest);
writeFileSync( join( __dirname, '..', 'docs', 'gallery.html' ), galleryHTML, 'utf8' );
