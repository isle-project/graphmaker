const { createSVGWindow } = require( 'svgdom' );
const { SVG, registerWindow } = require( '@svgdotjs/svg.js' );
const pick = require( '@stdlib/utils-pick' );
const deepMerge = require( '@stdlib/utils-merge' );
const { nodePositions } = require( './../node-position.js' );
const { circle, line, arrowhead, text } = require( './svg-elements.js' );

function svgCoords( positions, width, height, margin=0 ) {
    const rangeX = positions.reduce( ([minX, maxX], [x, _]) => [Math.min(minX, x), Math.max(maxX, x)], [1e10, -1e10]);
    const rangeY = positions.reduce( ([minY, maxY], [_, y]) => [Math.min(minY, y), Math.max(maxY, y)], [1e10, -1e10]);
    return ([x, y]) => [(margin + (1 - 2*margin)*(x - rangeX[0])/(rangeX[1] - rangeX[0])) * width,
                        (margin + (1 - 2*margin)*(y - rangeY[0])/(rangeY[1] - rangeY[0])) * height];
}

function nodeSize( n, width, height ) {
    const extent = Math.min( width, height );
    return Math.min( 0.1, 0.25/n ) * extent;
}

function edgeExtent( [sourceX, sourceY], [targetX, targetY], useArrow, excludeSize ) {
    const excludeProp = excludeSize/Math.sqrt((targetX - sourceX)**2 + (targetY - sourceY)**2 );
    const lambda = useArrow ? (1.2 * excludeProp) : excludeProp;
    const deltaX = targetX - sourceX;
    const deltaY = targetY - sourceY;
    return [ sourceX + excludeProp * deltaX, sourceY + excludeProp * deltaY, targetX - lambda * deltaX, targetY - lambda * deltaY ];
}

function extractStyles( elem, styles ) {
    const elemStyles = pick( elem, [ 'lineWidth', 'fill', 'lineColor', 'lineStyle' ] );
    if ( elem.style ) {
        return deepMerge( {}, styles[ elem.style ] || {}, elemStyles );
    }
    return elemStyles;
}

function toSVG( graph ) {
    const window = createSVGWindow();
    const document = window.document;
    registerWindow(window, document);
    const width = graph?.canvas?.width || 500;
    const height = graph?.canvas?.height || 500;
    const canvas = SVG( document.documentElement ).size( width, height );

    const nodes = graph.nodes;
    const edges = graph.edges;


    const nodeKeys = Object.keys( nodes );
    let [ positions, converged, maxForce ] = nodePositions( nodeKeys.length, [], 0.1 );
    console.log( 'positions:', positions );
    console.log( String(svgCoords(positions, width, height, 0.2)) );
    positions = positions.map( svgCoords(positions, width, height, 0.1) );
    console.log( 'positions-after:', positions );
    console.log( 'converged:', converged );
    console.log( 'maxForce:', maxForce );
    const size = nodeSize( nodeKeys.length, width, height );
    for ( let i = 0; i < nodeKeys.length; i++ ) {
        const node = nodes[ nodeKeys[ i ] ];
        const nodeStyle = extractStyles( node, graph.styles );
        console.log( 'nodeStyle:', nodeStyle );
        circle( positions[i][0], positions[i][1], size/2, nodeStyle ).addTo( canvas );
        text( positions[i][0] + size/2, positions[i][1] + size/2, 0, 0, node.label || nodeKeys[ i ], {
            fontSize: 22
        }).addTo( canvas );
    }

    const adjacency = graph.adjacency;
    const adjacencyKeys = Object.keys( adjacency );
    const useArrow = graph.directed;
    const edgesSeen = new Set();
    for ( let i = 0; i < adjacencyKeys.length; ++i ) {
        const source = adjacencyKeys[ i ];
        for ( const { targetNode, edge } of adjacency[source] ) {
            if ( edgesSeen.has( edge ) ) {
                continue;
            }
            edgesSeen.add( edge );
            const sourceIndex = nodeKeys.indexOf( source );
            const targetIndex = nodeKeys.indexOf( targetNode );
            const sourcePos = positions[ sourceIndex ];
            const targetPos = positions[ targetIndex ];
            const [x0, y0, x1, y1] = edgeExtent( sourcePos, targetPos, useArrow, size/2 );

            const edgeStyle = extractStyles( edges[ edge ], graph.styles );
            const lineElem = line( x0, y0, x1, y1, edgeStyle );
            lineElem.addTo( canvas );
            if ( useArrow ) {
                if ( !edgeStyle.fill && edgeStyle?.lineColor ) {
                    edgeStyle.fill = edgeStyle.lineColor;
                }
                const arrow = arrowhead( 8, 8, edgeStyle ).addTo( canvas );
                lineElem.marker( 'end', arrow );
            }
        }
    }
    if ( graph.directed ) {
        // Case: directed graph
    } else {
        // Case: undirected graph
    }
    canvas.css({
        position: 'absolute',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        'max-width': '100%',
        'max-height': '100%',
    });

    const out = `<?xml version="1.0" encoding="UTF-8"?>
    <!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN"
      "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
      ${canvas.svg()}`;
    return out;
}


module.exports = toSVG;