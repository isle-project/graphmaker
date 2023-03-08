const { Circle, Line, Marker, Rect, Ellipse, Text, Path, PathArray } = require( '@svgdotjs/svg.js' );
const debug = require( 'debug' )( 'graphmaker:svg' );
const deepMerge = require( '@stdlib/utils-merge' );
const deg2rad = require( '@stdlib/math-base-special-deg2rad' );


// TODO: Define styles structure
// { color, lineWidth, lineStyle, fill, fillStyle, arrowStyle, fontSize, fontFamily}

const svgDefaults = {
    line: {
        stroke: { color: 'black', width: 2 },
        fill: null
    },
    arrowhead: {
        stroke: null,
        fill: 'black'
    },
    circle: {
        stroke: { color: 'black', width: 1 },
        fill: 'white'
    },
    rectangle: {
        stroke: { color: 'steelblue', width: 1 },
        fill: 'white'
    },
    ellipse: {
        stroke: { color: 'black', width: 1 },
        fill: 'white'
    }
};

const projectStyle = (style, shape ) => {
    const svgStyle = {};

    if ( style.lineColor ) {
        svgStyle.stroke = { color: style.lineColor };
    }
    switch ( style.lineWidth ) {
        case 'very thin':
            svgStyle.stroke = { ...svgStyle.stroke, width: 0.5 };
            break;
        case 'thin':
            svgStyle.stroke = { ...svgStyle.stroke, width: 1 };
            break;
        case 'medium':
            svgStyle.stroke = { ...svgStyle.stroke, width: 2 };
            break;
        case 'thick':
            svgStyle.stroke = { ...svgStyle.stroke, width: 3 };
            break;
        case 'very-thick':
            svgStyle.stroke = { ...svgStyle.stroke, width: 5 };
            break;
        default:
            break;
    }
    if ( style.fill ) {
        svgStyle.fill = style.fill;
    }
    // TODO: deal with fillStyle

    if ( style.fontSize !== void 0 ) {
        svgStyle.font = { size: style.fontSize };
    }
    if ( style.arrowStyle ) {
        svgStyle.arrowStyle = style.arrowStyle;
    }

    debug( 'svgStyle:', svgStyle );
    return deepMerge( {}, svgDefaults[shape] || {}, svgStyle );
};

// TODO: Define approach to projecting styles objects to those needed by an element
// TODO: Define ArrowHead class that extends element and allows reading sizing

const circle = (cx, cy, r, styles = {}) => {
    const myStyles = projectStyle(styles, 'circle');
    debug( 'circleStyles:', myStyles );
    const elem = new Circle({
        cx, cy, r
    });
    if ( myStyles.fill ) {
        elem.fill( myStyles.fill );
    }
    return myStyles.stroke ? elem.stroke(myStyles.stroke) : elem;
};

const rectangle = (x, y, width, height, styles = {}) => {
    const myStyles = projectStyle(styles, 'rectangle');
    const elem = new Rect({
        x: x - width/2, y: y - height/2, width, height
    });
    if ( myStyles.fill ) {
        elem.fill( myStyles.fill );
    }
    return myStyles.stroke ? elem.stroke(myStyles.stroke) : elem;
};

const square = (x, y, side, styles = {}) => {
    return rectangle( x, y, side, side, styles );
};

const ellipse = (cx, cy, rx, ry, styles = {}) => {
    const myStyles = projectStyle(styles, 'ellipse');
    const elem = new Ellipse({
        cx, cy, rx, ry
    });
    if ( myStyles.fill ) {
        elem.fill( myStyles.fill );
    }
    return myStyles.stroke ? elem.stroke(myStyles.stroke) : elem;
};

const line = (x1, y1, x2, y2, styles = {}) => {
    const myStyles = projectStyle( styles, 'line' );
    const elem = new Line({
        x1, y1, x2, y2
    });
    return myStyles.stroke ? elem.stroke(myStyles.stroke) : elem;
};

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

const bezier = (x1, y1, c1x, c1y, c2x, c2y, x2, y2, styles = {}) => {
    const myStyles = projectStyle( styles, 'line' );
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

const bezierWithAngles = (x1, y1, x2, y2, angleLeaving, softnessLeaving, angleEntering, softnessEntering, styles = {} ) => {
    const c1 = bezierControl( x1, y1, angleLeaving, softnessLeaving, x2, y2 );
    const c2 = bezierControl( x2, y2, angleEntering, softnessEntering, x1, y1 );
    return bezier( x1, y1, c1[0], c1[1], c2[0], c2[1], x2, y2, styles );
};

const arrowStylePaths = {
    normal: (w, h) => `M 0 0 L ${w} ${h/2} L 0 ${h} z`,
};

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
                elt.stroke( myStyles.stroke );
            }
            if ( myStyles.fill ) {
                elt.fill( myStyles.fill );
            }
        });
    return elem;
};

const text = (x, y, dx, dy, text, styles = {}) => {
    const elem = new Text({
        x,
        y,
        dx,
        dy,
        'text-anchor': 'middle',
        'dominant-baseline': 'middle'
    });
    elem.text( text );
    return styles.stroke ? elem.stroke(styles) : elem;
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
    text
};
