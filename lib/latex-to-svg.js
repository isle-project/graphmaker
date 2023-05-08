const {mathjax} = require('mathjax-full/js/mathjax.js');
const { TeX } = require('mathjax-full/js/input/tex.js');
const { SVG } = require('mathjax-full/js/output/svg.js');
const { liteAdaptor } = require('mathjax-full/js/adaptors/liteAdaptor.js');
const { RegisterHTMLHandler } = require('mathjax-full/js/handlers/html.js');
const { AllPackages } = require('mathjax-full/js/input/tex/AllPackages.js');

const JAX_METRICS = { em: 10, ex: 10, cwidth: 500, lwidth: 500, scale: 100 };

function latexToSvg(latex) {
  // Create a liteAdaptor for MathJax
  const adaptor = liteAdaptor();

  // Register the HTML handler with the adaptor
  RegisterHTMLHandler(adaptor);

  // Create a new MathJax document with the TeX input and SVG output processors
  const tex = new TeX({ packages: AllPackages });
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
  // delete svgElement.attributes.viewBox;
  delete svgElement.attributes.role;
  delete svgElement.attributes.focusable;

  const markup = adaptor.innerHTML(svgElement); // Note: was outerHTML
  return { children: markup, attributes: svgElement.attributes, metrics: JAX_METRICS };
}

const METRIC_RE = /^\s*(\d+(?:\.\d+)?)\s*(em|ex)\s*$/;
const VERTICAL_ALIGN_RE = /vertical-align:\s*(-?\d+(?:\.\d+)?)\s*(em|ex);/;
const JAX_BASE_SCALE = 0.025;

function extractSize( attr, metrics, regex = METRIC_RE, defaultValue ) {
    const match = regex.exec(attr);
    if (match) {
        const scale = metrics[match[2]];
        return parseFloat(match[1]) * scale;
    }
    if ( defaultValue !== void 0 ) {
      return defaultValue;
    }
    throw new Error(`Invalid size: ${attr}`);
}

function latexSvgScaled( latex, x, y, xExtent, yExtent, center = true ) {
    const { children, attributes, metrics } = latexToSvg(latex);
    // Read width and height in PIXELS from attributes
    const width = extractSize( attributes.width, metrics );
    const height = extractSize( attributes.height, metrics);
    const vAlign = extractSize( attributes.style, metrics, VERTICAL_ALIGN_RE, 0 );
    console.log( 'width', width, 'height', height, 'valign', vAlign );

    // Compute scaling factor
    console.log( 'xExtent', xExtent, 'yExtent', yExtent );
    const scale = JAX_BASE_SCALE * Math.min( xExtent/width, yExtent/height );

    // Shift by half width if we are centering
    const xshift = center ? -1.5 * width : 0;
    const yshift = ( center ? height : 0 ) + vAlign;

    console.log( 'scale', scale, 'shift', xshift );

    // Add transform attribute
    attributes.transform = `translate(${x + xshift}, ${y + yshift}) scale(${scale})`;

    return { children, attributes, metrics };
}

/*
// Example usage
const latex = '\\sqrt{a^2 + b^2 + c^2 + d^2}'; // Replace this with your LaTeX string
latexToSvg(latex, { x: 162, y: 760, scale: 0.05 })
  .then(svg => console.log(svg))
  .catch(error => console.error('Error:', error));
*/

module.exports = latexSvgScaled;
