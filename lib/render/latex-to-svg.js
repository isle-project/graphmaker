const {mathjax} = require('mathjax-full/js/mathjax.js');
const { TeX } = require('mathjax-full/js/input/tex.js');
const { SVG } = require('mathjax-full/js/output/svg.js');
const { liteAdaptor } = require('mathjax-full/js/adaptors/liteAdaptor.js');
const { RegisterHTMLHandler } = require('mathjax-full/js/handlers/html.js');
const { AllPackages } = require('mathjax-full/js/input/tex/AllPackages.js');
const extractCenterOfMass = require('./formula-position.js');

const JAX_METRICS = { em: 10, ex: 10, cwidth: 500, lwidth: 500, scale: 100 };

/**
 * Converts a LaTeX string to an SVG element.
 *
 * @param {string} latex - input LaTeX string
 * @returns {Object} an object with SVG children string, attributes, and metrics
 */
function latexToSvg(latex) {
  // Create a liteAdaptor for MathJax
  const adaptor = liteAdaptor();

  // Register the HTML handler with the adaptor
  RegisterHTMLHandler(adaptor);

  // Create a new MathJax document with the TeX input and SVG output processors
  const tex = new TeX({ loader: {load: ['[tex]/physics']}, packages: [...AllPackages, 'physics' ] });
  const svg = new SVG({ fontCache: 'none' });
  const html = mathjax.document('', { InputJax: tex, OutputJax: svg });

  // Convert the LaTeX string to a MathItem and render it
  const math = new html.options.MathItem(latex, tex, false);
  math.setMetrics( JAX_METRICS.em, JAX_METRICS.ex, JAX_METRICS.cwidth, JAX_METRICS.lwidth, JAX_METRICS.scale);
  math.display = false;

  // Compile and convert the MathItem to an SVG element
  math.compile(html);
  math.typeset(html);

  const svgElement = adaptor.firstChild(math.typesetRoot);
  delete svgElement.attributes.xmlns;
  delete svgElement.attributes.role;
  delete svgElement.attributes.focusable;

  const markup = adaptor.innerHTML(svgElement); // Note: was outerHTML
  return { children: markup, attributes: svgElement.attributes, metrics: JAX_METRICS };
}

/**
 * Extracts values from the viewBox attribute of an SVG element.
 *
 * @param {string} viewBox - viewBox attribute from an SVG element
 * @returns {Object} object with x, y, width, and height properties
 */
function extractViewBox( viewBox ) {
    const match = viewBox.split(/\s+/);
    return { x: parseFloat(match[0]), y: parseFloat(match[1]), width: parseFloat(match[2]), height: parseFloat(match[3]) };
}

/**
 * Wraps a string in SVG tags to create an SVG file.
 *
 * @param {string} str - string to be wrapped
 * @param {Object} viewBox - object with x, y, width, and height properties
 * @returns {string} SVG file
 */
function asSVGFile( str, viewBox ) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}" >${str}</svg>`;
}

/**
 * Converts a LaTeX string to an SVG element, adjusts its position and scales it.
 *
 * @param {string} latex - input LaTeX string
 * @param {number} x - x-coordinate for the center of the SVG element
 * @param {number} y - y-coordinate for the center of the SVG element
 * @param {number} fontSize - desired font size for the LaTeX string in the SVG element
 * @returns {Promise<Object>} promise resolving to an object with SVG children string, attributes, and metrics
 */
async function latexSvgScaled( latex, x, y, fontSize ) {
    const { children, attributes, metrics } = latexToSvg(latex);
    // Read width and height in PIXELS from attributes:
    const viewBox = extractViewBox( attributes.viewBox );

    // Compute scaling factor:
    const scale = 1.25 * fontSize/viewBox.height;

    // Match center position to image center of mass:
    const wrappedSvg = asSVGFile( children, viewBox );
    const [xCoM, yCoM ] = await extractCenterOfMass( wrappedSvg, viewBox.width, viewBox.height );

    const xshift = (viewBox.x + xCoM * viewBox.width);
    const yshift = (viewBox.y + yCoM * viewBox.height);

    // Add transform attribute reflecting center position and scale:
    attributes.transform = `translate(${x - xshift*scale}, ${y - yshift*scale}) scale(${scale})`;

    return { children, attributes, metrics };
}

module.exports = latexSvgScaled;
