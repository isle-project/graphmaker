const objectKeys = require( '@stdlib/utils-keys' );
const debug = require( 'debug' )( 'graphmaker:tikz' );
const isArray = require( '@stdlib/assert-is-array' );
const { RADIANS_TO_DEGREES, DEGREES_TO_RADIANS, SQRT_2 } = require( './../constants.js' );

const TIKZ_PREAMBLE = '\\documentclass{article}\n\n\\usepackage{tikz}\n\\usetikzlibrary{arrows.meta}\n\n\\begin{document}';
const TIKZ_POSTAMBLE = '\n\\end{document}\n';

const EDGE_BASE_VERTICAL_OFFSET = 12;

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
    const adjacency = graph.adjacency;
    const tikzNodes = [];
    const tikzEdges = [];

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
    const edgesSeen = new Set();
    for ( let i = 0; i < adjacencyKeys.length; ++i ) {
        const source = adjacencyKeys[ i ];
        for ( const { targetNode, edge } of adjacency[source] ) {
            if ( edgesSeen.has( edge ) ) {
                continue;
            }
            const edgeObj = edges[ edge ] || {};
            tikzEdges.push( edgeToTikZ( edgeObj, source, targetNode, useArrow, graph ) );
        }
    }
    return `${TIKZ_PREAMBLE}\\begin{tikzpicture}[${describeStyles(graph)}]\n${tikzNodes.join('\n')}\n${tikzEdges.join('\n')}\n\\end{tikzpicture}${TIKZ_POSTAMBLE}`;
}


function tikzEdgeStyle(style) {
    const options = [];
    if (style.lineColor) options.push(`draw=${style.lineColor}`);
    if (style.lineWidth) options.push(`line width=${style.lineWidth}`);
    if (style.lineStyle) options.push(`dash pattern=${style.lineStyle}`);
    return options.join(', ');
}

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

const LABEL_HANDLERS = {
    'latex': s => s,
    'tex': s => s,
    'math': s => { throw new Error( 'mathlingo conversion not yet included for ' + s); }
};
const HANDLER_REGEXP = new RegExp( `^(${Object.keys(LABEL_HANDLERS).join('|')}):\\s*(.*)$` );

function texifyLabel( label, styles, { tangent, unit, drawAbove, extraOffset = [0, 0] } = {} ) {
    if ( label === '' || !label ) {
        return { label: '', specs: {} };
    }
    // Determine positioning and color specification for the label
    // from labelOffset, textAnchor, fontSize, fontColor, fontStyle, fontWeight, fontVariant, fontFamily(?)
    // Issues:
    // 1. fontWeight/Style etc are different in math mode and text mode
    // 2. font loading probably should be done in advance, giving us a map of font families
    // 3. offset positions need to be mapped based on edge direction (yes?)
    const specs = {};
    let mathFonts = '';
    let textFonts = '';
    let angle = tangent ? Math.atan2( tangent[1], tangent[0] ) / DEGREES_TO_RADIANS : 0;
    const offsetVector = calculateOffsetVector( extraOffset );
    let flip = 1;
    if ( tangent && tangent[0] < 0 ) {
        angle = ( angle + 180 ) % 360;
        flip = -1;
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
            text = '$' + mathFonts + handler( trueLabel ) + '$';
        } else {
            throw new Error( `Tikz label handler ${handlerName} is not recognized.` );
        }
    } else {
        text = textFonts + escapeTeX( label );
    }
    return { label: text, specs };
}

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
    return `node [${pos}label={${opts}${anchor}${textOrMath}}] {};`;
}
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
    /* const options = [tikzEdgeStyle(edge)]; */  // ATTN: UPDATE THIS
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
 * Returns a polar vector from source to target.
 *
 * @param {Array} sourcePos - [x, y] coordinates of source node
 * @param {Array} targetPos - [x, y] coordinates of target node
 * @returns { Object }  { direction, unit } where direction is the angle (in degrees from positive-x) from
 *     from source to target and unit is *half* the distance between source and target.
 */
function polarVector( sourcePos, targetPos ) {
    const unit = 0.5 * Math.sqrt( (targetPos[0] - sourcePos[0])**2 + (targetPos[1] - sourcePos[1])**2 );
    const direction = Math.atan2( targetPos[1] - sourcePos[1], targetPos[0] - sourcePos[0] ) * RADIANS_TO_DEGREES;
    return { direction, unit };
}

const defaultNodeStyle = {
    lineColor: 'black',
    lineWidth: 'medium',
    lineStyle: 'solid',
    arrowStyle: 'Latex',
    fillColor: 'white',
    fillStyle: 'solid',
    text: 'black',
};


function calculateOffsetVector( offsetSpec = [ 0, 0 ] ) {
    const isOffsetArray = isArray( offsetSpec );
    if ( !offsetSpec || offsetSpec === 'none' ) {
        return [0, 0];
    }

    if ( isOffsetArray && offsetSpec.length === 2 && typeof offsetSpec[0] === 'number' ) {
        // Case: absolute offset vector
        return [ offsetSpec[0], -offsetSpec[1] ];  // Negative for left-handed graphics coord system
    }

    if ( isOffsetArray && offsetSpec.length === 3 ) {
        // Case: polar offset
        const angle = offsetSpec[1] * DEGREES_TO_RADIANS;
        return [ offsetSpec[2] * Math.cos( angle ), -offsetSpec[2] * Math.sin( angle ) ]; // Left-handed coords
    }

    const dir = isOffsetArray ? offsetSpec[0] : offsetSpec;
    const r = isOffsetArray ? offsetSpec[1] : 1.0;
    switch ( dir ) {
        case 'north':
        case 'up':
            return [0, -r];
        case 'south':
        case 'down':
            return [0, r];
        case 'east':
        case 'right':
            return [r, 0];
        case 'west':
        case 'left':
            return [-r, 0];
        case 'northeast':
        case 'upper-right':
            return [ r * SQRT_2, -r * SQRT_2 ];
        case 'southeast':
        case 'lower-right':
            return [ r * SQRT_2, r * SQRT_2 ];
        case 'northwest':
        case 'upper-left':
            return [ -r * SQRT_2, -r * SQRT_2 ];
        case 'southwest':
        case 'lower-left':
            return [ -r * SQRT_2, r * SQRT_2 ];
        default:
            throw new Error( `Invalid label offset direction: ${dir}` );
    }
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
    if ( attributes.fillColor ) styles.push( styleString('fill', attributes.fillColor) );
    if ( attributes.fillStyle ) styles.push( styleString(null, attributes.fillStyle) );
    if ( attributes.fontColor ) styles.push( styleString('text', attributes.fontColor) );

    return `${name}/.style={${styles.join('')}}`;
}

/**
 * Returns tikz style specification string for the parameters of a tikzpicture.
 *
 * @param {Object} graph - graph to be rendered
 * @return {string}
 */
function describeStyles( graph ) {
    const styles = ['>={Latex}', tikzStyleDef( 'default', defaultNodeStyle )];
    return styles.join(',\n  ');  // ATTN!
}

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
    const x = node.x || 0;
    const y = node.y || 0;
    const fillColor = styleString( 'fill', node.fillColor );
    const lineColor = styleString( 'draw', node.lineColor );
    const lineWidth = styleString( 'line width', tikzLineWidth(node.lineWidth) );
    const lineStyle = styleString( null, node.lineStyle );
    const style = styleString( null, node.style || 'default' );
    const { label, specs } = texifyLabel( node.label || '', node );
    const labelSpecs = '';  // ATTN!  Need to handle offset, color
    const shape = asTikzShape( node.nodeShape );
    return `\\node[${style}${shape}${fillColor}${lineColor}${lineWidth}${lineStyle}${labelSpecs}] (${name}) at (${x}, ${y}) {${label}};`;
}

module.exports = toTikZ;
