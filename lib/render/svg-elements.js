const { Circle, Line, Marker, Rect, Ellipse, Text } = require( '@svgdotjs/svg.js' );
const deepMerge = require( '@stdlib/utils-merge' );

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

    console.log( 'svgStyle:', svgStyle );
    return deepMerge( {}, svgDefaults[shape] || {}, svgStyle );
};

// TODO: Define approach to projecting styles objects to those needed by an element
// TODO: Define ArrowHead class that extends element and allows reading sizing

const circle = (cx, cy, r, styles = {}) => {
    const myStyles = projectStyle(styles, 'circle');
    console.log( 'circleStyles:', myStyles );
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
    circle,
    rectangle,
    square,
    ellipse,
    line,
    arrowhead,
    text
};
