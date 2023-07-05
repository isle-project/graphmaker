const { Path, PathArray, Pattern } = require( '@svgdotjs/svg.js' );
const isString = require( '@stdlib/assert-is-string' );
const deepMerge = require( '@stdlib/utils-merge' );
const debug = require( 'debug' )( 'graphmaker:svg' );

const { svgColor } = require( './colors.js' );

// TODO: Define styles structure
// { color, lineWidth, lineStyle, fill, fillStyle, arrowStyle, fontSize, fontFamily}

/**
 * Default styles for different shapes
 */
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
    'double-circle': {
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
    square: {
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

/**
 * Style processing function for SVG elements.
 *
 * @param {Object} style - style specifications from the user
 * @param {string} shape - shape type
 * @returns {Object} processed style object
 * @throws will throw an error if fillStyle hashing direction is invalid
 */
const svgProjectStyle = (style, shape ) => {
    if ( style.projected ) {
        return style;
    }
    const svgStyle = {
        projected: true,
    };

    if ( style.lineColor ) {
        svgStyle.stroke = { color: svgColor(style.lineColor) };
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
        const styleObject = isString( style.fillStyle ) ? { type: style.fillStyle } : style.fillStyle;
        switch ( styleObject.type ) {
            case 'solid':
                svgStyle.fill = svgColor( style.fillColor || 'black' );
                break;
            case 'hashed': {
                const {hashDirection = 'increasing', thickness = 0.5} = styleObject;
                let tileSize;
                let arr;
                switch ( hashDirection ) {
                    case 'increasing': {
                        tileSize = 6;
                        arr = new PathArray([
                            ['M', -1, 1],
                            ['l', 2, -2],
                            ['M', 0, tileSize],
                            ['l', tileSize, -tileSize],
                            ['M', tileSize - 1, tileSize + 1],
                            ['l', 2, -2]
                        ]);
                        break;
                    }
                    case 'horizontal': {
                        tileSize = 10;
                        arr = new PathArray([
                            ['M', 0, 0],
                            ['l', tileSize, 0],
                            ['M', 0, tileSize / 2],
                            ['l', tileSize, 0],
                            ['M', 0, tileSize],
                            ['l', tileSize, 0]
                        ]);
                        break;
                    }
                    case 'vertical': {
                        tileSize = 10;
                        arr = new PathArray([
                            ['M', 0, 0],
                            ['l', 0, tileSize],
                            ['M', tileSize / 2, 0],
                            ['l', 0, tileSize],
                            ['M', tileSize, 0],
                            ['l', 0, tileSize]
                        ]);
                        break;
                    }
                    case 'decreasing': {
                        tileSize = 6;
                        arr = new PathArray([
                            ['M', tileSize - 1, -1],
                            ['l', 2, 2],
                            ['M', 0, 0],
                            ['l', tileSize, tileSize],
                            ['M', -1, tileSize - 1],
                            ['l', 2, 2]
                        ]);
                        break;
                    }
                    default:
                        throw new Error( `Invalid hashing direction for fillStyle: ${hashDirection}` );
                }
                const path = new Path({
                    d: arr,
                    fill: 'none',
                    stroke: svgColor( style.fillColor || 'black' ),
                    'stroke-width': thickness
                });
                pattern = new Pattern( {
                    width: tileSize,
                    height: tileSize,
                    patternUnits: 'userSpaceOnUse'
                }).update( p => {
                    path.addTo( p );
                });
                break;
            }
            case 'crosshatched': {
                const { hatchingDirection = 'vertical', thickness = 0.5 } = styleObject;
                const tileSize = 10;
                let arr;
                switch (hatchingDirection) {
                    case 'vertical':
                        arr = new PathArray([
                            ['M', 0, 0],
                            ['l', tileSize, 0],
                            ['M', 0, tileSize / 2],
                            ['l', tileSize, 0],
                            ['M', 0, tileSize],
                            ['l', tileSize, 0],
                            ['M', 0, 0],
                            ['l', 0, tileSize],
                            ['M', tileSize / 2, 0],
                            ['l', 0, tileSize],
                            ['M', tileSize, 0],
                            ['l', 0, tileSize]
                        ]);
                        break;
                    case 'diagonal':
                        arr = new PathArray([
                            ['M', -1, 1],
                            ['l', 2, -2],
                            ['M', 0, tileSize],
                            ['l', tileSize, -tileSize],
                            ['M', tileSize - 1, tileSize + 1],
                            ['l', 2, -2],
                            ['M', tileSize - 1, -1],
                            ['l', 2, 2],
                            ['M', 0, 0],
                            ['l', tileSize, tileSize],
                            ['M', -1, tileSize - 1],
                            ['l', 2, 2]
                        ]);
                        break;
                    default:
                        throw new Error(`Invalid hashing direction for fillstyle: ${hatchingDirection}`);
                }
                const path = new Path({
                    d: arr,
                    fill: 'none',
                    stroke: svgColor( style.fillColor || 'black' ),
                    'stroke-width': thickness
                });
                pattern = new Pattern({
                    width: tileSize,
                    height: tileSize,
                    patternUnits: 'userSpaceOnUse'
                }).update(p => {
                    path.addTo(p);
                });
                break;
            }
            case 'dotted': {
                const { dotSize = 2.5, tileSize = 10 } = styleObject;
                pattern = new Pattern( {
                    width: tileSize,
                    height: tileSize,
                    patternUnits: 'userSpaceOnUse'
                } ).update( ( add ) => {
                    add.circle( dotSize ).fill( svgColor( style.fillColor || 'black' ) );
                });
                break;
            }
        }
    } else if ( style.fillColor ) {
        svgStyle.fill = svgColor(style.fillColor);
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
        svgStyle.fill = svgColor(style.fontColor);
    }
    if ( style.arrowStyle ) {
        svgStyle.arrowStyle = style.arrowStyle;
    }
    if ( style.z ) {
        svgStyle.zIndex = style.z;
    }

    if ( style.nodeShape && (!shape || shape !== 'text') ) {
        shape = style.nodeShape;
    }

    if ( style.nodeSize ) {
        svgStyle.size = style.nodeSize;
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


module.exports = svgProjectStyle;
