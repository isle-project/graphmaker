const objectKeys = require( '@stdlib/utils-keys' );
const debug = require( 'debug' )( 'graphmaker:tikz' );
const { nodePositions } = require( './../node-position.js' );

const TIKZ_PREAMBLE = '\\documentclass{article}\n\n\\usepackage{tikz}\n\\usetikzlibrary{arrows.meta}\n\n\\begin{document}';
const TIKZ_POSTAMBLE = '\n\\end{document}\n';

function toTikZ( graph, config = {} ) {
    const nodes = graph.nodes;
    const edges = graph.edges;
    const adjacency = graph.adjacency;
    const tikzNodes = [];
    const tikzEdges = [];

    const keys = objectKeys( nodes );
    let { positions, converged, maxForce } = nodePositions( graph, { ambient: 0.1, orientation: config.orientation } );
    debug( 'nodePositions:', positions );
    debug( 'converged:', converged );
    debug( 'maxForce:', maxForce );
    for ( let i = 0; i < keys.length; i++ ) {
        const name = keys[i];
        const node = nodes[name];
        node.x = positions[i][0];
        node.y = positions[i][1];
        tikzNodes.push(defineNode( name, node, node ));
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
            tikzEdges.push( edgeToTikZ( edgeObj, source, targetNode, edgeObj, useArrow ) );
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

function edgeToTikZ(edge, source, target, style, useArrow) {
    const options = [tikzEdgeStyle(style)];
    if ( Math.abs( edge.angleEntering ) < 2**-20 &&  Math.abs( edge.angleLeaving ) < 2**-20 )  {
        return `\\draw [${useArrow ? '->' : ''}] (${source}) -- (${target});`;
    }
    return `\\draw [${useArrow ? '->' : ''}] (${source}) to [out=${edge.angleLeaving}, in=${edge.angleEntering}] (${target});`;
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

const styleString = (name, style) => {
    const nameStr = name ? `${name}=` : '';
    return style ? `${nameStr}${style}, ` : '';
};

/** Converts lineWidth to a tikz width specification. */

function tikzLineWidth( linewidth ) {
    if ( !linewidth ) {
        return null;
    }
    if ( linewidth === 'medium' ) {
        return 'semithick';  // ATTN
    }
    return linewidth.replaceAll('-', '');
}

/**
 *
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
 * @return {string}
 */
function describeStyles( graph ) {
    const styles = ['>={Latex}', tikzStyleDef( 'default', defaultNodeStyle )];
    return styles.join(',\n  ');  // ATTN!
}

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
 */
function defineNode( name, node, nodeStyles ) {
    const x = node.x || 0;
    const y = node.y || 0;
    const fillColor = styleString( 'fill', nodeStyles.fillColor );
    const lineColor = styleString( 'draw', nodeStyles.lineColor );
    const lineWidth = styleString( 'line width', tikzLineWidth(nodeStyles.lineWidth) );
    const lineStyle = styleString( null, nodeStyles.lineStyle );
    const style = styleString( null, node.style || 'default' );
    const label = node.label || '';
    const shape = asTikzShape( node.nodeShape );

    return `\\node[${style}${shape}${fillColor}${lineColor}${lineWidth}${lineStyle}] (${name}) at (${x}, ${y}) {${label}};`;
}

module.exports = toTikZ;
