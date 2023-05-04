const {mathjax} = require('mathjax-full/js/mathjax.js');
const { TeX } = require('mathjax-full/js/input/tex.js');
const { SVG } = require('mathjax-full/js/output/svg.js');
const { liteAdaptor } = require('mathjax-full/js/adaptors/liteAdaptor.js');
const { RegisterHTMLHandler } = require('mathjax-full/js/handlers/html.js');
const { AllPackages } = require('mathjax-full/js/input/tex/AllPackages.js');

const JAX_METRICS = { em: 10, ex: 10, cwidth: 500, lwidth: 500, scale: 100 };

function latexToSvg(latex /*, { x, y, scale }*/) {
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
  //svgElement.kind = 'g';
  delete svgElement.attributes.xmlns;
  delete svgElement.attributes.viewBox;
  delete svgElement.attributes.role;
  delete svgElement.attributes.focusable;
  //svgElement.attributes.transform = `translate(${x}, ${y}) scale(${scale || 0.05})`;

  const markup = adaptor.innerHTML(svgElement);   // was outerHTML
  //return markup;
  return { children: markup, attributes: svgElement.attributes, metrics: JAX_METRICS };
}

const METRIC_RE = /^\s*(\d+(?:\.\d+)?)\s*(em|ex)\s*$/;
const JAX_BASE_SCALE = 0.025;

function extractSize( attr, metrics ) {
    const match = METRIC_RE.exec(attr);
    console.log( attr, match );
    if (match) {
        const scale = metrics[match[2]];
        return parseFloat(match[1]) * scale;
    }
    throw new Error(`Invalid size: ${attr}`);
}

function latexSvgScaled( latex, x, y, xExtent, yExtent, center = true ) {
    const { children, attributes, metrics } = latexToSvg(latex);
    // Read width and height in PIXELS from attributes
    const width = extractSize( attributes.width, metrics );
    const height = extractSize( attributes.height, metrics);
    console.log( 'width', width, 'height', height );

    // Compute scaling factor
    console.log( 'xExtent', xExtent, 'yExtent', yExtent );
    const scale = JAX_BASE_SCALE * Math.min( xExtent/width, yExtent/height );

    // Shift by half width if we are centering
    const xshift = center ? -width : 0;
    const yshift = center ? height : 0;

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
