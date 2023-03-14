const { createSVGWindow } = require( 'svgdom' );
const { SVG, registerWindow } = require( '@svgdotjs/svg.js' );
const debug = require( 'debug' )( 'graphmaker:svg' );
const pick = require( '@stdlib/utils-pick' );
const deepMerge = require( '@stdlib/utils-merge' );
const deg2rad = require( '@stdlib/math-base-special-deg2rad' );
const { nodePositions } = require( './../node-position.js' );
const { circle, line, ellipse, rectangle, square, arrowhead, text, bezier } = require( './svg-elements.js' );

const DEGREES_TO_RADIANS = Math.PI/180;

function svgCoords( positions, width, height, margin=0 ) {
    const rangeX = positions.reduce( ([minX, maxX], [x, _]) => [Math.min(minX, x), Math.max(maxX, x)], [1e10, -1e10]);
    const rangeY = positions.reduce( ([minY, maxY], [_, y]) => [Math.min(minY, y), Math.max(maxY, y)], [1e10, -1e10]);
    return ([x, y]) => [(margin + (1 - 2*margin)*(x - rangeX[0])/(rangeX[1] - rangeX[0])) * width,
                        (margin + (1 - 2*margin)*(y - rangeY[0])/(rangeY[1] - rangeY[0])) * height];
}

function baseNodeSize( n, width, height ) {
    const extent = Math.min( width, height );
    return Math.min( 0.1, 0.25/n ) * extent;
}

function edgeExtent( [sourceX, sourceY], [targetX, targetY], arrow, excludeSize ) {
    const totalLength = Math.sqrt((targetX - sourceX)**2 + (targetY - sourceY)**2 );
    const excludeProp = excludeSize/totalLength;
    const endProp = arrow ? (excludeProp + arrow.attr('markerHeight')/totalLength) : excludeProp;
    const deltaX = targetX - sourceX;
    const deltaY = targetY - sourceY;
    const out = [ sourceX + excludeProp * deltaX, sourceY + excludeProp * deltaY, targetX - endProp * deltaX, targetY - endProp * deltaY ];
    return out;
}

function perturbByAngle( x, y, unitDx, unitDy, angle ) {
    const horizL = Math.cos( angle * DEGREES_TO_RADIANS );
    const vertL= Math.sin( angle * DEGREES_TO_RADIANS );
    return [ horizL * unitDx - vertL * unitDy, vertL * unitDx + horizL * unitDy ];
}

function edgeCurveExtent( [sourceX, sourceY], [targetX, targetY], arrow, excludeSize, { angleLeaving, angleEntering, softnessEntering = 0.5, softnessLeaving = 0.5 }) {
    let dx = targetX - sourceX;
    let dy = targetY - sourceY;
    const norm = Math.sqrt( dx*dx + dy*dy );
    dx = dx/norm;
    dy = dy/norm;

    const [ux, uy] = perturbByAngle( sourceX, sourceY, dx, dy, angleLeaving );
    const [vx, vy] = perturbByAngle( targetX, targetY, -dx, -dy, -angleEntering );

    const radiusL = excludeSize;
    const radiusE = excludeSize + (arrow ? arrow.attr('markerHeight') : 0);
    const endpoints = [sourceX + radiusL * ux, sourceY + radiusL * uy, targetX + radiusE * vx, targetY + radiusE * vy ];

    return endpoints.concat( [
        sourceX + softnessEntering * norm * ux,
        sourceY + softnessEntering * norm * uy,
        targetX + softnessLeaving * norm * vx,
        targetY + softnessLeaving * norm * vy
    ] );
}

const STYLE_ATTRIBUTES = [
    'lineColor',
    'lineWidth',
    'lineStyle',
    'arrowStyle',
    'fill',
    'fillStyle',
    'fontFamily',
    'fontSize',
    'fontColor',
    'fontStyle',
    'fontWeight',
    'fontVariant'
];

function extractStyles( elem, styles = {} ) {
    const elemStyles = pick( elem, STYLE_ATTRIBUTES );
    if ( elem.style ) {
        return deepMerge( {}, styles[ elem.style ] || {}, elemStyles );
    }
    return elemStyles;
}

const defaultNodeStyle = {
    lineColor: 'black',
    lineWidth: 'medium',
    lineStyle: 'solid',
    arrowStyle: 'normal',
    fill: 'white',
    fillStyle: 'solid',
    fontFamily: 'sans-serif',
    fontSize: 18,
    fontColor: 'black',
    fontStyle: 'normal',
    fontWeight: 'normal',
    fontVariant: 'normal'
};

const draftNodeStyle = {
    fontColor: 'grey',
    fontSize: 18,
    opacity: 0.75
};

function drawNodeLabel({ node, position, canvas, key, nodeStyle, isDraft }) {
    if ( node.label ) {
        text( position[0], position[1], 0, 0, node.label, {
            ...defaultNodeStyle,
            ...nodeStyle,
        }).addTo( canvas );
    } else if ( isDraft ) {
        text( position[0], position[1], 0, 0, key, draftNodeStyle ).addTo( canvas );
    }
}

function drawNode({ node, position, canvas, size, styles, key, isDraft }) {
    const nodeStyle = extractStyles( node, styles );
    console.log( 'nodeStyle:', nodeStyle );
    switch ( node.shape ) {
        case 'circle':
            circle( position[0], position[1], size/2 * node.size, nodeStyle ).addTo( canvas );
            break;
        case 'square':
            square( position[0], position[1], size * node.size, nodeStyle ).addTo( canvas );
            break;
        case 'rectangle':
            rectangle( position[0], position[1], size * node.size * node.widthToHeight, size * node.size, nodeStyle ).addTo( canvas );
            break;
        case 'ellipse':
            ellipse( position[0], position[1], size * node.size * node.widthToHeight, size * node.size, nodeStyle ).addTo( canvas );
            break;
        default:
            throw new Error( `Unrecognized node shape: ${node.shape}` );
    }
    drawNodeLabel({ node, position, canvas, key, nodeStyle, isDraft });
}

function drawLinearEdge( sourcePos, targetPos, edge, edgeStyle, size, arrow, canvas ) {
    const [x0, y0, x1, y1] = edgeExtent( sourcePos, targetPos, arrow, size );
    const lineElem = line( x0, y0, x1, y1, edgeStyle );
    lineElem.addTo( canvas );
    if ( arrow ) {
        arrow.addTo( canvas );
        lineElem.marker( 'end', arrow );
    }
}

function drawBezierEdge( sourcePos, targetPos, edge, edgeStyle, size, arrow, canvas ) {
    const [ x0, y0, x1, y1, cx0, cy0, cx1, cy1 ] = edgeCurveExtent( sourcePos, targetPos, arrow, size, edge );
    const curveElem = bezier( x0, y0, cx0, cy0, cx1, cy1, x1, y1, edgeStyle );
    curveElem.addTo( canvas );
    if ( arrow ) {
        arrow.addTo( canvas );
        curveElem.marker( 'end', arrow );
    }
}

function toSVG( graph, config = {} ) {
    const window = createSVGWindow();
    const document = window.document;
    registerWindow(window, document);
    const width = graph?.canvas?.width || 500;
    const height = graph?.canvas?.height || 500;
    const canvas = SVG( document.documentElement )
        .size( width, height )
        .viewbox( 0, 0, width, height );

    const nodes = graph.nodes;
    const edges = graph.edges;

    const nodeKeys = Object.keys( nodes );
    let { positions, converged, maxForce } = nodePositions( nodeKeys.length, [], 0.1 );
    debug( 'nodePositions:', positions );
    debug( 'converged:', converged );
    debug( 'maxForce:', maxForce );
    positions = positions.map( svgCoords(positions, width, height, 0.25) );
    const size = baseNodeSize( nodeKeys.length, width, height );
    for ( let i = 0; i < nodeKeys.length; i++ ) {
        const node = nodes[ nodeKeys[ i ] ];
        drawNode({
            node,
            position: positions[ i ],
            canvas,
            size,
            styles: graph.styles,
            key: nodeKeys[ i ],
            isDraft: config.draft === void 0 ? true : config.draft
        });
    }

    const decorations = graph.decorations || [];
    for ( let i = 0; i < decorations.length; ++i ) {
        const decoration = decorations[ i ];
        const decorationStyle = extractStyles( decoration, graph.styles );
        switch ( decoration.type ) {
            case 'text':
                text( decoration.x, decoration.y, 0, 0, decoration.text, decorationStyle ).addTo( canvas );
                break;
            case 'region':
                rectangle( decoration.x, decoration.y, decoration.region[0], decoration.region[1], decorationStyle ).addTo( canvas );
                break;
            default:
                throw new Error( `Unrecognized decoration type: ${decoration.type}` );
        }
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
            const edgeStyle = extractStyles( edges[ edge ], graph.styles );
            if ( !edgeStyle.fill && edgeStyle?.lineColor ) {
                edgeStyle.fill = edgeStyle.lineColor;
            }
            let arrow = null;
            if ( useArrow ) {
                arrow = arrowhead( 8, 8, edgeStyle );
            }
            if (
                Math.abs( edges[ edge ].angleEntering ) < 2**-20 &&
                Math.abs( edges[ edge ].angleLeaving ) < 2**-20
            ) {
                drawLinearEdge( sourcePos, targetPos, edges[ edge ], edgeStyle, size/2, arrow, canvas );
            } else {
                drawBezierEdge( sourcePos, targetPos, edges[ edge ], edgeStyle, size/2, arrow, canvas );
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
    if ( config.justSVG ) {
        const out = canvas.svg();
        return out;
    }
    const out = `<?xml version="1.0" encoding="UTF-8"?>
    <!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN"
      "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
      ${canvas.svg()}`;
    return out;
}


module.exports = toSVG;
