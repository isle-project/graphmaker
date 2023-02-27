// returns a window with a document and an svg root node
const { createSVGWindow } = require('svgdom')
const window = createSVGWindow()
const document = window.document
const { SVG, registerWindow } = require('@svgdotjs/svg.js')

// register window and document
registerWindow(window, document)

// create canvas
const canvas = SVG(document.documentElement)

// use svg.js as normal
canvas.rect(100, 100).fill('yellow').move(50,50)

// get your svg as string
console.log(canvas.svg())
// or
console.log(canvas.node.outerHTML)

// create XML window with a document and a given xml root node
const { createWindow } = require('svgdom')
const window = createWindow(namespaceURI, rootNode)
// e.g. createWindow('http://www.w3.org/1998/Math/MathML', 'math')
