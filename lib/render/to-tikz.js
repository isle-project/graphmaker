const objectKeys = require( '@stdlib/utils-keys' );
const debug = require( 'debug' )( 'graphmaker:tikz' );
const roundn = require( '@stdlib/math-base-special-roundn' );
const isString = require( '@stdlib/assert-is-string' ).isPrimitive;
const { DEGREES_TO_RADIANS, CoordinateSystem } = require( './../constants.js' );
const { directionalHistogram, selfLoopDirections } = require( './../node-positions.js' );
const { polarVector, calculateOffsetVector } = require( './../geometry.js' );


// Constants

const TIKZ_PREAMBLE = '\\documentclass{article}\n\n\\usepackage{tikz}\n\\usetikzlibrary{arrows.meta}\n\\usetikzlibrary{patterns.meta}\n\n\\begin{document}';
const TIKZ_POSTAMBLE = '\n\\end{document}\n';
const TIKZ_LOOP_LOOSENESS = 16;

const LABEL_HANDLERS = {
    'latex': s => s,
    'tex': s => s,
    'math': s => { throw new Error( 'mathlingo conversion not yet included for ' + s); }
};
const HANDLER_REGEXP = new RegExp( `^(${Object.keys(LABEL_HANDLERS).join('|')}):\\s*(.*)$` );


// Style Defaults

const defaultNodeStyle = {
    lineColor: 'black',
    lineWidth: 'medium',
    lineStyle: 'solid',
    arrowStyle: 'Latex',
    fillColor: 'white',
    fillStyle: 'solid',
    text: 'black',
};


// Main Entry Point

/**
 * Returns a tikz representation of the graph.
 *
 * @param {Object} graph - graph to be rendered
 * @param {Object} positions - initial positions of the nodes in the graph
 * @param {Object} [config={}] - configuration options
 * @returns {Promise<string>} - tikz representation of the graph
 */
function toTikZ( graph, positions, config = {} ) {
    const nodes = graph.nodes;
    const edges = graph.edges;
    const adjacency = graph._adjacency;
    const tikzNodes = [];
    const tikzEdges = [];

    debug( 'Converting graph to TiKZ/LaTeX' );
    const keys = objectKeys( nodes );
    for ( let i = 0; i < keys.length; i++ ) {
        const name = keys[i];
        const node = nodes[name];
        node.x = positions[i][0];
        node.y = positions[i][1];
        tikzNodes.push(defineNode( name, node ));
    }

    const adjacencyKeys = Object.keys( adjacency );
    const useArrow = graph.directed;
    for ( let i = 0; i < adjacencyKeys.length; ++i ) {
        const source = adjacencyKeys[ i ];
        const nSelfLoops = adjacency[source].filter( edgeName => edges[ edgeName ].target === source ).length;
        let selfLoopAngles = [];
        let selfLoop = 0;
        if ( nSelfLoops > 0 ) {
            const DIRECTIONAL_BINWIDTH = 10;  // Ensure that this divides 360 for edge case below
            const hist = directionalHistogram( i, positions, 1, DIRECTIONAL_BINWIDTH );
            selfLoopAngles = selfLoopDirections( hist, nSelfLoops );
            if ( selfLoopAngles === null ) {  // Edge case: no clear directions  ATTN
                // Choose the nSelfLoops directions with minimal histogram values
                throw new Error( 'Dense angular case heuristic not yet implemented' );
            }
        }
        for ( const edgeName of adjacency[source] ) {
            const edgeObj = edges[ edgeName ];
            if ( source === edgeObj.target ) {
                tikzEdges.push( selfLoopToTikZ( edgeObj, source, selfLoopAngles[selfLoop++], useArrow, graph ) );
            } else {
                tikzEdges.push( edgeToTikZ( edgeObj, source, edgeObj.target, useArrow, graph ) );
            }
        }
    }
    return `${TIKZ_PREAMBLE}\\begin{tikzpicture}[${describeStyles(graph)}]\n${tikzNodes.join('\n')}\n${tikzEdges.join('\n')}\n\\end{tikzpicture}${TIKZ_POSTAMBLE}`;
}


// Helpers

/**
 * Returns string with TeX special characters backslash-escaped.
 *
 * @param {string} str - string to be escaped
 * @returns {string} escaped string
 */
function escapeTeX( str ) {
    const RE_SPECIAL = /([$&%#_{}~^\\])/g;
    const SPECIAL_MAP = {
        '\\': '\\textbackslash{}',
        '%': '\\%',
        '$': '\\$',
        '&': '\\&',
        '#': '\\#',
        '_': '\\_',
        '^': '\\^',
        '{': '\\{',
        '}': '\\}',
        '`': '\\textasciigrave{}',
        '~': '\\textasciitilde{}'
    };
    return str.replace( RE_SPECIAL, (match) => SPECIAL_MAP[match] );
}

/**
 * Converts a hex color such as `ff0000` to a color specification in the range [0, 1] such as `1,0,0`.
 *
 * @param {string} hexcolor - hex color specification without leading `#`
 * @returns {string} color specification in the range [0, 1] for LaTeX
 */
function hexToRGB01( hexcolor ) {
    let r = parseInt(hexcolor.substring(0, 2), 16);
    let g = parseInt(hexcolor.substring(2, 4), 16);
    let b = parseInt(hexcolor.substring(4, 6), 16);
    return `${roundn(r/255, -4)},${roundn(g/255, -4)},${roundn(b/255, -4)}`;
}

/**
 * Converts an RGB color such as `rgb(255, 0, 0)` to a color specification in the range [0, 1] such as `1,0,0`.
 *
 * @param {string} rgb - RGB color specification (CSS style)
 * @returns {string} color specification in the range [0, 1] for LaTeX
 */
function rgbToRGB01( rgb ) {
    rgb = rgb
        .replace( /rgb\(/, '' )
        .replace( /\)/, '' );
    return rgb
        .split( ',' )
        .map( s => roundn( parseFloat( s ) / 255, -3 ) )
        .join( ',' );
}


// Style Translators

/**
 *
function tikzEdgeStyle(style) {
    const options = [];
    if (style.lineColor) options.push(`draw=${style.lineColor}`);
    if (style.lineWidth) options.push(`line width=${style.lineWidth}`);
    if (style.lineStyle) options.push(`dash pattern=${style.lineStyle}`);
    return options.join(', ');
}
 */

/**
 * Translates graphmaker font styles into math mode/text mode LaTeX specifications.
 *
 * @param { Object } styles - graphmaker config styles for this label's fonts  (ATTN)
 *
 * @returns {{mathFonts: Function,textFonts: Function}} font specifications for math or text mode
 *     corresponding to the given style
 */
function fontSpecs( styles ) {
    let mathFonts = [];
    let textFonts = [];

    if (
        styles.fontWeight &&
        (
            styles.fontWeight === 'bold' ||
            styles.fontWeight === 'bolder' ||
            styles.fontWeight === '600' ||
            styles.fontWeight === '700' ||
            styles.fontWeight === '800' ||
            styles.fontWeight === '900'
        )
    ) {
        textFonts.push( s => `\\textbf{${s}}` );
        mathFonts.push( s => `\\mathbf{${s}}` );
    }
    switch ( styles.fontStyle ) {
        case 'italic':
            textFonts.push( s => `\\textit{${s}}` );
            break;
        case 'oblique':
            textFonts.push( s => `\\textsl{${s}}` );
            break;
        case 'normal':
        default:
            break;
    }
    switch ( styles.fontVariant ) {
        case 'small-caps':
            mathFonts.push( s => `\\textsc{${s}}` );
            textFonts.push( s => `\\textsc{${s}}` );
            break;
        case 'titling-caps':
            // ATTN
            break;
        case 'normal':
        default:
            break;
    }
    if ( styles.fontColor ) {
        let scheme = '';
        let color = styles.fontColor;
        if ( styles.fontColor.startsWith( '#' ) ) {
            scheme = '[rgb]';
            color = hexToRGB01( styles.fontColor.slice(1) );
        } else if ( styles.fontColor.startsWith( 'rgb' ) ) {
            scheme = '[rgb]';
            color = rgbToRGB01( styles.fontColor );
        }
        mathFonts.push( s => `\\textcolor${scheme}{${color}}{${s}}` );
        textFonts.push( s => `\\textcolor${scheme}{${color}}{${s}}` );
    }
    return {
        mathFonts: mathFonts.reduce( (facc, fi) => s => fi(facc(s)), s => s ),
        textFonts: textFonts.reduce( (facc, fi) => s => fi(facc(s)), s => s ),
    };
}

/**
 * Returns a tikz style specification string for the given style.
 *
 * @param {(string|null)} name - name of the style
 * @param {string} style - style specification
 * @returns {string} tikz style specification
 */
const styleString = (name, style) => {
    const nameStr = name ? `${name}=` : '';
    return style ? `${nameStr}${style}, ` : '';
};

/**
 * Removes trailing separator from a tikz style options string.
 *
 * @param {string} styleStr -
 *
 * @returns {string} the `styleStr` with a trailing ', ' removed.
 */
function cleanStyle( styleStr ) {
    if ( styleStr.endsWith( ', ' ) ) {
        return styleStr.slice(0, -2);
    }
    return styleStr;
}

/**
 * Converts lineWidth to a tikz width specification.
 *
 * @param {string} lineWidth - 'thin', 'medium', or 'thick'
 * @returns {string} tikz width specification
 */
function tikzLineWidth( lineWidth ) {
    if ( !lineWidth ) {
        return null;
    }
    if ( lineWidth === 'medium' ) {
        return 'semithick';  // ATTN
    }
    return lineWidth.replaceAll('-', '');
}

/**
 * Converts fill style parameters (e.g., dot sizes) from SVG friendly to tikZ friendly values
 *
 * @param {Number} fillStyle.thickness - line thickness
 * @param {Number} fillStyle.tileSize - pixels per dot in both horizontal and vertical directions
 * @param {Number} fillStyle.dotSize - size of the dots in pixels
 *
 * @returns {Object} a (new) and updated fillStyle object
 */
function convertFillParams( fillStyle ) {
    const newFillStyle = { ...fillStyle };
    if ( newFillStyle.dotSize ) {
        newFillStyle.dotSize /= 2.5;
    }
    if ( newFillStyle.tileSize ) {
        newFillStyle.tileSize /= 2.5;
    }
    return newFillStyle;
}

/**
 * Converts fillStyle to a tikz fill pattern specification
 *
 * @param {string} fillStyle -
 * @returns {string} a pattern specification as an option for nodes etc
 */
function tikzFillStyle( fillStyle, fillColor ) {
    if ( !fillStyle ) {
        if ( fillColor ) {
            return `fill=${fillColor}`;
        }
        return '';
    }
    if ( isString(fillStyle) ) {
        switch ( fillStyle ) {
            case 'solid':
                return fillColor ? `fill=${fillColor}` : '';
            case 'hashed':
                fillStyle = convertFillParams( { type: fillStyle, hashDirection: 'increasing', thickness: 0.5 } );
                break;
            case 'crosshatched':
                fillStyle = convertFillParams( { type: fillStyle, hatchingDirection: 'vertical', thickness: 0.5 } );
                break;
            case 'dotted':
                fillStyle = convertFillParams( { type: fillStyle, tileSize: 10, dotSize: 2.5 } );
                break;
            default:
                throw new Error( `Unrecognized fill style string ${fillStyle}.` );
        }
    } else {
        fillStyle = convertFillParams( fillStyle );
    }
    const color = fillColor ? `, pattern color=${fillColor}` : '';
    switch ( fillStyle.type ) {
        case 'hashed': {
            const ANGLES = { 'increasing': 45, 'decreasing': -45, 'horizontal': 0, 'vertical': 90 };
            return `pattern={Lines[angle=${ANGLES[fillStyle.hashDirection]}]}` + color;
        }
        case 'crosshatched': {
            const ANGLES = { 'diagonal': 45, 'vertical': 0 };
            return `pattern={Hatch[angle=${ANGLES[fillStyle.hatchingDirection]}]}` + color;
        }
        case 'dotted':
            return `pattern={Dots[distance=${fillStyle.tileSize},radius=${fillStyle.dotSize}]}` + color;
        default:
            throw new Error( `Unrecognized fill style string ${fillStyle.type}.` );
    }
}

/**
 * Returns a tikz style definition for the given style attributes.
 *
 * @param {string} name - name of the style
 * @param {Object} attributes - style attributes
 * @returns {string} tikz style definition
 */
function tikzStyleDef( name, attributes ) {
    const styles = [];

     /*
    'lineColor',
    'lineWidth',
    'lineStyle',
    'arrowStyle',
    'fillColor',
    'fillStyle',
    'fontFamily',
    'fontSize',
    'fontColor',
    'fontStyle',
    'fontWeight',
    'fontVariant',
    'z'
    */
    if ( attributes.lineColor ) styles.push( styleString('draw', attributes.lineColor) );
    if ( attributes.lineWidth ) styles.push( styleString(null, tikzLineWidth(attributes.lineWidth)) );
    if ( attributes.lineStyle ) styles.push( styleString(null, attributes.lineStyle) );
    if ( attributes.fontColor ) styles.push( styleString('text', attributes.fontColor) );
    if ( attributes.fillStyle || attributes.fillColor) {
        styles.push( tikzFillStyle(attributes.fillStyle, attributes.fillColor) );
    }
    return `${name}/.style={${cleanStyle(styles.join(''))}}`;
}

/**
 * Returns tikz style specification string for the parameters of a tikzpicture.
 *
 * @param {Object} graph - graph to be rendered
 * @return {string}
 */
function describeStyles( graph ) {
    const styles = [
        '>={Latex}',
        tikzStyleDef( 'default', defaultNodeStyle ),
        `every loop/.style={looseness=${TIKZ_LOOP_LOOSENESS}}`
    ];
    return styles.join(',\n  ');  //    !
}


// Label Formatters

/**
 * Converts a label specification into LaTeX/TikZ format
 *
 * @param
 * @param
 * @param
 *
 * @returns
 *
 */
function texifyLabel( label, styles, { tangent, unit, drawAbove, extraOffset = [0, 0] } = {} ) {
    if ( label === '' || !label ) {
        return { label: '', specs: {} };
    }
    label = String( label );
    // Determine positioning and color specification for the label
    // from labelOffset, textAnchor, fontSize, fontColor, fontStyle, fontWeight, fontVariant, fontFamily(?)
    // Issues:  ATTN:HANDLE THIS
    // 1. fontWeight/Style etc are different in math mode and text mode
    // 2. font loading probably should be done in advance, giving us a map of font families
    // 3. offset positions need to be mapped based on edge direction (yes?)
    const specs = {};
    const { mathFonts, textFonts } = fontSpecs( styles );
    let angle = tangent ? Math.atan2( tangent[1], tangent[0] ) / DEGREES_TO_RADIANS : 0;
    const offsetVector = calculateOffsetVector( extraOffset, CoordinateSystem.RIGHT_HANDED );
    if ( tangent && tangent[0] < 0 ) {
        angle = ( angle + 180 ) % 360;
    }
    specs.direction = (Math.atan2( offsetVector[1], offsetVector[0] ) / DEGREES_TO_RADIANS + angle) % 360;
    specs.position = offsetVector[0];
    specs.rotate = angle;

    if ( styles.fontColor ) {
        specs.color = styles.fontColor;
    }

    // Convert label to appropriate TiKZ/LaTeX string
    let text;
    const match = HANDLER_REGEXP.exec( label );
    if ( match ) {
        const [ _, handlerName, trueLabel ] = match;
        const handler = LABEL_HANDLERS[handlerName.toLowerCase()];
        if ( handler ) {
            text = '$' + mathFonts( handler( trueLabel ) ) + '$';
        } else {
            throw new Error( `Tikz label handler ${handlerName} is not recognized.` );
        }
    } else {
        text = textFonts( escapeTeX( label ) );
    }
    return { label: text, specs };
}

/**
 *
 */
function edgeLabel( label, edgeStyles, offset, options ) {
    if ( label === '' || !label ) {
        return '';
    }
    const { label: textOrMath, specs } = texifyLabel( label, { ...edgeStyles, labelOffset: offset }, options );
    const pos = specs.position ? `pos=${specs.position},` : 'midway,';
    const color = specs.color ? `${specs.color}` : '';
    const anchor = specs.direction ? `${Math.round(specs.direction)}:` : '';
    let opts = '';
    if ( specs.color || specs.rotate ) {
        opts = `[${specs.rotate ? `rotate=${Math.round(specs.rotate)},` : ''}${color}]`;
    }
    return `node [${pos}label={${opts}${anchor}${textOrMath}}] {}`;  // ATTN: semicolon was here but seems wrong, is it??
}

// Edge Handling
//  \draw [->] (A) -- (B) node [midway, label=above right:{Foo}] {};
//  \draw [->] (B) -- (C) node [pos=0.75, label=left:{Bar}] {} node [midway, label=above:{1}] {};
//  \draw [->] (C) -- (A) node [midway] {Zap};

/**
 * Returns a tikz edge specification (with label and offsets) for the given edge.
 *
 * @param {Object} edge - edge object
 * @param {string} source - name of source node
 * @param {string} target - name of target node
 * @param {boolean} useArrow - whether to draw an arrow
 * @param {Object} graph - specification for the entire graph
 * @returns {string} tikz edge specification
 */
function edgeToTikZ(edge, source, target, useArrow, graph ) {
    // ATTN: WTF? /* const options = [tikzEdgeStyle(edge)]; */  // ATTN: UPDATE THIS
    const nodePositions = graph._positions;
    const { direction, unit } = polarVector( nodePositions[source], nodePositions[target] );
    const tangent = [ Math.cos(direction * DEGREES_TO_RADIANS), Math.sin( direction * DEGREES_TO_RADIANS ) ];
    const edgeOptions = { tangent, unit, drawAbove: true /* ATTN */ };
    const label = edgeLabel( edge.label, edge, edge.labelOffset, edgeOptions );
    const weight = edgeLabel( edge.weight, edge, edge.weightOffset, edgeOptions );
    if ( Math.abs( edge.angleEntering ) < 2**-20 &&  Math.abs( edge.angleLeaving ) < 2**-20 )  {
        return `\\draw [${useArrow ? '->' : ''}] (${source}) -- (${target}) ${label}${weight};`;
    }
    return `\\draw [${useArrow ? '->' : ''}] (${source}) to [out=${edge.angleLeaving}, in=${edge.angleEntering}] (${target})${label}${weight};`;
}

/**
 * Returns a tikz edge specification (with label and offsets) for the given self-loop.
 *
 * @param {Object} edge - edge object
 * @param {string} source - name of source node
 * @param {string} angle - direction angle of self-loop (in degrees)
 * @param {boolean} useArrow - whether to draw an arrow
 * @param {Object} graph - specification for the entire graph
 * @returns {string} tikz edge specification
 */
function selfLoopToTikZ(edge, source, angle, useArrow, graph ) {
    let dir = null;
    switch ( angle ) {
        case 0:
            dir = 'right';
            break;
        case 90:
            dir = 'above';
            break;
        case 180:
            dir = 'left';
            break;
        case 270:
            dir = 'below';
            break;
        default:
            break;
    }
    const arrowOpt = useArrow ? ', ->' : '';
    const loopSpec = dir ? `[loop ${dir}${arrowOpt}]` : `[in=${angle-15},out=${angle+15},loop${arrowOpt}]`;
    const label = edgeLabel( edge.label, edge, edge.labelOffset );
    const weight = edgeLabel( edge.weight, edge, edge.weightOffset );

    return `\\path (${source}) edge ${loopSpec} ${label}${weight} (${source});`;
}

// Node Handling

/**
 * Maps a shape name to a tikz shape.
 *
 * @param {string} shapeStr - shape name
 * @returns {string} tikz shape
 */
const asTikzShape = ( shapeStr ) => {
    let tikzShape = shapeStr || 'circle';
    if ( tikzShape === 'triangle' ) {
        tikzShape = 'regular polygon, regular polygon sides=3';
    } else if ( tikzShape === 'square' ) {
        tikzShape = 'rectangle';
    }
    tikzShape += ', ';
    return tikzShape;
};

/**
 * Returns a tikz node specification (with label and offsets)
 *
 * @param {string} name - name of the node
 * @param {Object} node - node object
 * @returns {string} tikz node specification
 */
function defineNode( name, node ) {
    const x = roundn( node.x || 0, -6 );
    const y = roundn( node.y || 0, -6 );
    const fill = tikzFillStyle( node.fillStyle, node.fillColor );
    const lineColor = styleString( 'draw', node.lineColor );
    const lineWidth = styleString( 'line width', tikzLineWidth(node.lineWidth) );
    const lineStyle = styleString( null, node.lineStyle );
    const style = styleString( null, node.style || 'default' );
    const { label, _ } = texifyLabel( node.label || '', node );  // ATTN: Use the returned specs?
    const labelSpecs = '';  // ATTN!  Need to handle offset, color
    const shape = asTikzShape( node.nodeShape );
    const options = cleanStyle( `${style}${shape}${fill}${lineColor}${lineWidth}${lineStyle}${labelSpecs}` );
    return `\\node[${options}] (${name}) at (${x}, ${y}) {${label}};`;
}

module.exports = toTikZ;
