const { Pattern } = require( '@svgdotjs/svg.js' );
const isArray = require( '@stdlib/assert-is-array' );
const deepMerge = require( '@stdlib/utils-merge' );
const debug = require( 'debug' )( 'graphmaker:svg' );

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
    diamond: {
        stroke: { color: 'black', width: 1 },
        fill: 'white'
    },
    ellipse: {
        stroke: { color: 'black', width: 1 },
        fill: 'white'
    },
    rectangle: {
        stroke: { color: 'black', width: 1 },
        fill: 'white'
    },
    triangle: {
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
    switch ( style.lineStyle ) {
        case 'dashed':
            svgStyle.stroke = { ...svgStyle.stroke, dasharray: [ 6, 3 ] };
            break;
        case 'dotted':
            svgStyle.stroke = { ...svgStyle.stroke, dasharray: [ 2, 2 ] };
            break;
        case 'solid':
        default:
            break;
    }
    let pattern;
    if ( style.fillStyle ) {
        const styleIsArray = isArray( style.fillStyle );
        const styleName = styleIsArray ? style.fillStyle[0] : style.fillStyle;
        const styleParam = styleIsArray ? style.fillStyle[1] : null;
        switch ( styleName ) {
            case 'solid':
                svgStyle.fill = style.fillColor || 'black';
                break;
            case 'hashed': {
                const hashAngle = (styleParam === null) ? 45 : styleParam;
                pattern = new Pattern({
                    width: 0.1,
                    height: 0.1,
                    patternUnits: 'objectBoundingBox',
                    patternContentUnits: 'objectBoundingBox',
                    patternTransform: `rotate(${hashAngle})`
                }).update( ( add ) => {
                    add.line( 0, 0, 1, 1 ).stroke( { color: style.fillColor || 'black' } );
                });
                break;
            }
            case 'dotted': {
                const dotDensity = (styleParam === null) ? 5 : styleParam;
                pattern = new Pattern( {
                    width: 1.0/dotDensity,
                    height: 1.0/dotDensity,
                    patternUnits: 'objectBoundingBox'
                } ).update( ( add ) => {
                    add.circle( 2 ).fill( style.fillColor || 'black' );   // ATTN:SIZING
                });
                break;
            }
        }
    } else if ( style.fillColor ) {
        svgStyle.fill = style.fillColor;
    }

    svgStyle.font = {};
    if ( style.fontSize !== void 0 ) {
        svgStyle.font.size = style.fontSize;
    }
    if ( style.fontFamily ) {
        svgStyle.font.family = style.fontFamily;
    }
    if ( style.fontStyle ) {
        svgStyle.font.style = style.fontStyle;
    }
    if ( style.fontWeight ) {
        svgStyle.font.weight = style.fontWeight;
    }
    if ( style.fontVariant ) {
        svgStyle.font.variant = style.fontVariant;
    }
    if ( shape === 'text' && style.fontColor ) {
        svgStyle.fill = style.fontColor;
    }
    if ( style.arrowStyle ) {
        svgStyle.arrowStyle = style.arrowStyle;
    }
    if ( style.z ) {
        svgStyle.zIndex = style.z;
    }

    debug( 'svgStyle:', svgStyle );
    debug( 'svgDefaults:', svgDefaults );
    debug( 'shape', shape );
    const out = deepMerge( {}, svgDefaults[shape] || {}, svgStyle );
    if ( pattern ) {
        out.fill = pattern;
    }
    return out;
};


module.exports = projectStyle;
