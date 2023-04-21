const { Path, PathArray, Pattern } = require( '@svgdotjs/svg.js' );
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
        const styleParams = styleIsArray ? style.fillStyle.slice(1) : [];
        switch ( styleName ) {
            case 'solid':
                svgStyle.fill = style.fillColor || 'black';
                break;
            case 'hashed': {
                const [hashDirection = 'increasing', hashThickness = 0.5] = styleParams;
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
                        throw new Error( `Invalid hashing direction for fillstyle: ${hashDirection}` );
                }
                const path = new Path({
                    d: arr,
                    fill: 'none',
                    stroke: style.fillColor || 'black',
                    'stroke-width': hashThickness
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
                const [hashDirection = 'vertical', hashThickness = 0.5] = styleParams;
                const tileSize = 10;
                let arr;
                switch (hashDirection) {
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
                        throw new Error(`Invalid hashing direction for fillstyle: ${hashDirection}`);
                }
                const path = new Path({
                    d: arr,
                    fill: 'none',
                    stroke: style.fillColor || 'black',
                    'stroke-width': hashThickness
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
                const [dotSize = 2.5, tileSize = 10] = styleParams;
                pattern = new Pattern( {
                    width: tileSize,
                    height: tileSize
                } ).update( ( add ) => {
                    add.circle( dotSize ).fill( style.fillColor || 'black' );
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
