const { Circle, Line, Marker, Rect, Ellipse, Text, Path, PathArray, Polygon } = require( '@svgdotjs/svg.js' );
const debug = require( 'debug' )( 'graphmaker:svg' );
const deg2rad = require( '@stdlib/math-base-special-deg2rad' );
const projectStyle = require( './project-style.js' );

// TODO: Define approach to projecting styles objects to those needed by an element
// TODO: Define ArrowHead class that extends element and allows reading sizing

/**
 * Returns a SVG circle object.
 *
 * @param {number} cx - x-coordinate of the center
 * @param {number} cy - y-coordinate of the center
 * @param {number} r - radius of the circle
 * @param {Object} [myStyles={}] - styles object
 * @returns {Object} circle object
 */
const circle = (cx, cy, r, myStyles = {}) => {
    debug( 'circleStyles:', myStyles );
    const elem = new Circle({
        cx, cy, r
    });
    if ( myStyles.fill ) {
        elem.fill( myStyles.fill );
    }
    return myStyles.stroke ? elem.stroke(myStyles.stroke) : elem;
};

/**
 * Returns a SVG rectangle object.
 *
 * @param {number} x - x-coordinate of the top left corner
 * @param {number} y - y-coordinate of the top left corner
 * @param {number} width - width of the rectangle
 * @param {number} height - height of the rectangle
 * @param {Object} [myStyles={}] - styles object
 * @returns {Object} rectangle object
 */
const rectangle = (x, y, width, height, myStyles = {}) => {
    const elem = new Rect({
        x: x - width/2, y: y - height/2, width, height
    });
    if ( myStyles.fill ) {
        elem.fill( myStyles.fill );
    }
    return myStyles.stroke ? elem.stroke(myStyles.stroke) : elem;
};

/**
 * Returns a SVG square object.
 *
 * @param {number} x - x-coordinate of the top left corner
 * @param {number} y - y-coordinate of the top left corner
 * @param {number} side - side length of the square
 * @param {Object} [myStyles={}] - styles object
 * @returns {Object} square object
 */
const square = (x, y, side, myStyles = {}) => {
    return rectangle( x, y, side, side, myStyles );
};

/**
 * Returns a SVG ellipse object.
 *
 * @param {number} cx - x-coordinate of the center
 * @param {number} cy - y-coordinate of the center
 * @param {number} rx - x-radius of the ellipse
 * @param {number} ry - y-radius of the ellipse
 * @param {Object} [myStyles={}] - styles object
 * @returns {Object} ellipse object
 */
const ellipse = (cx, cy, rx, ry, myStyles = {} ) => {
    const elem = new Ellipse({
        cx, cy, rx, ry
    });
    if ( myStyles.fill ) {
        elem.fill( myStyles.fill );
    }
    return myStyles.stroke ? elem.stroke(myStyles.stroke) : elem;
};

/**
 * Returns a SVG line object.
 *
 * @param {number} x1 - x-coordinate of the start point
 * @param {number} y1 - y-coordinate of the start point
 * @param {number} x2 - x-coordinate of the end point
 * @param {number} y2 - y-coordinate of the end point
 * @param {Object} [myStyles={}] - styles object
 * @returns {Object} line object
 */
const line = (x1, y1, x2, y2, myStyles = {}) => {
    const elem = new Line({
        x1, y1, x2, y2
    });
    return myStyles.stroke ? elem.stroke(myStyles.stroke) : elem;
};

/**
 * Computes the control point for a Bezier curve.
 *
 * @param {number} x - initial x-coordinate
 * @param {number} y - initial y-coordinate
 * @param {number} angle - angle for the control point
 * @param {number} softness - distance of control point from initial point
 * @param {number} xprime - final x-coordinate
 * @param {number} yprime - final y-coordinate
 * @returns {[number,number]} control point coordinates [x, y]
 */
const bezierControl = ( x, y, angle, softness, xprime, yprime ) => {
    // Compute unit vector from (x,y) to (xprime, yprime)
    let dx = xprime - x;
    let dy = yprime - y;
    const norm = Math.sqrt( dx*dx + dy*dy );
    dx = dx/norm;
    dy = dy/norm;

    // Rotate the unit vector towards xprime, yprime by angle
    const dangle = deg2rad( angle );
    const tangent = Math.cos( dangle );
    const perp = Math.sin( dangle );
    const ux = tangent * dx - perp * dy;
    const uy = perp * dx + tangent * dy;
    return [ x + softness * ux, y + softness * uy ];
};

/**
 * Returns a SVG Bezier curve object.
 *
 * @param {number} x1 - x-coordinate of the start point
 * @param {number} y1 - y-coordinate of the start point
 * @param {number} c1x - x-coordinate of the first control point
 * @param {number} c1y - y-coordinate of the first control point
 * @param {number} c2x - x-coordinate of the second control point
 * @param {number} c2y - y-coordinate of the second control point
 * @param {number} x2 - x-coordinate of the end point
 * @param {number} y2 - y-coordinate of the end point
 * @param {Object} [myStyles={}] - styles object
 * @returns {Object} Bezier curve object
 */
const bezier = (x1, y1, c1x, c1y, c2x, c2y, x2, y2, myStyles = {}) => {
    const arr = new PathArray([
        ['M', x1, y1],
        ['C', c1x, c1y, c2x, c2y, x2, y2]
    ]);
    const elem = new Path({
        d: arr,
        fill: 'none'
    });
    return myStyles.stroke ? elem.stroke(myStyles.stroke) : elem;
};

/**
 * Returns a SVG Bezier curve object with specified angles.
 *
 * @param {number} x1 - x-coordinate of the start point
 * @param {number} y1 - y-coordinate of the start point
 * @param {number} x2 - x-coordinate of the end point
 * @param {number} y2 - y-coordinate of the end point
 * @param {number} angleLeaving - angle at the start point
 * @param {number} softnessLeaving - softness at the start point
 * @param {number} angleEntering - angle at the end point
 * @param {number} softnessEntering - softness at the end point
 * @param {Object} [styles={}] - styles object
 * @returns {Object} Bezier curve object
 */
const bezierWithAngles = (x1, y1, x2, y2, angleLeaving, softnessLeaving, angleEntering, softnessEntering, styles = {} ) => {
    const c1 = bezierControl( x1, y1, angleLeaving, softnessLeaving, x2, y2 );
    const c2 = bezierControl( x2, y2, angleEntering, softnessEntering, x1, y1 );
    return bezier( x1, y1, c1[0], c1[1], c2[0], c2[1], x2, y2, styles );
};

/**
 * Map of SVG arrow styles to path generators.
 * @type {Object.<string, function(number, number): string>}
 */
const arrowStylePaths = {
    normal: (w, h) => `M 0 0 L ${w} ${h/2} L 0 ${h} z`,
};

/**
 * Returns a SVG arrowhead object.
 *
 * @param {number} width - width of the arrowhead
 * @param {number} height - height of the arrowhead
 * @param {Object} [styles={}] - styles object
 * @returns {Object} arrowhead object
 */
const arrowhead = (width, height, styles) => {
    const myStyles = projectStyle( styles, 'arrowhead' );
    const border = myStyles?.stroke?.width ? myStyles.stroke.width : 0;
    const elem = new Marker()
        .size(width, height)
        .ref( width/2, height/2 )
        .viewbox( -border, -border, width+2*border, height+2*border )
        .attr('orient', 'auto-start-reverse')
        .update( elt => {
            elt.path( arrowStylePaths[myStyles.arrowStyle || 'normal'](width, height) );
            if ( myStyles.stroke ) {
                elt.stroke( { ...myStyles.stroke, dasharray: void 0 } );  // ATTN: If want to support dashed arrow outlines, add style key for projectStyles
            }
            if ( myStyles.fill ) {
                elt.fill( myStyles.fill );
            }
        });
    return elem;
};

/**
 * Returns a SVG text object.
 *
 * @param {number} x - x-coordinate of the center
 * @param {number} y - y-coordinate of the center
 * @param {number} dx - x-offset
 * @param {number} dy - y-offset
 * @param {string} text - text content
 * @param {Object} [styles={}] - styles object
 * @returns {Object} text object
 */
const text = (x, y, dx, dy, text, styles = {}) => {
    const myStyles = projectStyle(styles, 'text');
    const elem = new Text({
        x,
        y,
        dx,
        dy,
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
    });
    elem.text( text );
    if ( myStyles.fill ) {
        elem.fill( myStyles.fill );
    }
    if ( myStyles.font ) {
        elem.font( myStyles.font );
    }
    if ( myStyles.opacity ) {
        elem.opacity( myStyles.opacity );
    }
    return elem;
};

/**
 * Returns a SVG text object rotated at a certain angle.
 *
 * @param {number} x - x-coordinate of the center of rotation
 * @param {number} y - y-coordinate of the center of rotation
 * @param {string} text - text content
 * @param {number} angle - angle of rotation (in degrees)
 * @param {Object} [styles={}] - styles object
 * @returns {Object} text object
 */
const rotatedText = (x, y, text, angle, styles = {}) => {
    const myStyles = projectStyle(styles, 'text');
    const elem = new Text({
        'transform': `translate(${x}, ${y}) rotate(${angle})`,
        'text-anchor': 'middle',
        'dominant-baseline': 'middle'
    });
    elem.text( text );
    if ( myStyles.fill ) {
        elem.fill( myStyles.fill );
    }
    if ( myStyles.font ) {
        elem.font( myStyles.font );
    }
    if ( myStyles.opacity ) {
        elem.opacity( myStyles.opacity );
    }
    return elem;
};

/**
 * Returns a SVG diamond object.
 *
 * @param {number} cx - x-coordinate of the center
 * @param {number} cy - y-coordinate of the center
 * @param {number} width - width of the diamond
 * @param {number} height - height of the diamond
 * @param {Object} [styles={}] - styles object
 * @returns {Object} diamond object
 */
const diamond = (cx, cy, width, height, myStyles = {}) => {
    const points = [
        [cx, cy - height / 2],
        [cx + width / 2, cy],
        [cx, cy + height / 2],
        [cx - width / 2, cy]
    ];
    const elem = new Polygon().plot(points);
    if (myStyles.fill) {
        elem.fill(myStyles.fill);
    }
    return myStyles.stroke ? elem.stroke(myStyles.stroke) : elem;
};

/**
 * Returns a SVG triangle object.
 *
 * @param {number} cx - x-coordinate of the center
 * @param {number} cy - y-coordinate of the center
 * @param {number} r - radius of the circle circumscribing the triangle
 * @param {Style} [styles={}] - styles object
 * @returns {Object} triangle object
 */
const triangle = (cx, cy, r, myStyles = {}) => {
    const halfSideLength = Math.sqrt(3) * r / 2;
    const points = [
        [cx, cy - r], // top vertex
        [cx + halfSideLength, cy + r / 2], // bottom right vertex
        [cx - halfSideLength, cy + r / 2] // bottom left vertex
    ];
    const elem = new Polygon().plot(points);
    if (myStyles.fill) {
        elem.fill(myStyles.fill);
    }
    return myStyles.stroke ? elem.stroke(myStyles.stroke) : elem;
};

module.exports = {
    bezier,
    bezierWithAngles,
    circle,
    rectangle,
    square,
    ellipse,
    line,
    arrowhead,
    text,
    rotatedText,
    diamond,
    triangle
};
