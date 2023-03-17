const { createSVGWindow } = require( 'svgdom' );
const { SVG, registerWindow } = require( '@svgdotjs/svg.js' );
const debug = require( 'debug' )( 'graphmaker:svg' );
const pick = require( '@stdlib/utils-pick' );
const deepMerge = require( '@stdlib/utils-merge' );
const isString = require( '@stdlib/assert-is-string' ).isPrimitive;
const isArray = require( '@stdlib/assert-is-array' );
const { nodePositions } = require( './../node-position.js' );
const { circle, diamond, line, ellipse, rectangle, square, triangle, arrowhead, text, rotatedText, bezier } = require( './svg-elements.js' );

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
    'fontVariant',
    'z'
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

const LABEL_OFFSET_FACTOR = 1.2;
const SQRT_2 = Math.sqrt(2);

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

function calculateOffsets({ node, hSize, vSize, canvas }) {
    const labelOffset = node.labelOffset;
    const offsetVector = calculateOffsetVector( labelOffset );

    // ATTN: Previously used canvas size to scale in case of an absolute numeric pair
    //       For now, scale by the node size only and we'll see how natural that is.
    return [
        LABEL_OFFSET_FACTOR * hSize * node.size * offsetVector[0],
        LABEL_OFFSET_FACTOR * hSize * node.size * offsetVector[1]
    ];
}

function drawNodeLabel({ node, position, canvas, key, hSize, vSize, nodeStyle, isDraft }) {
    const [ offsetX, offsetY ] = calculateOffsets({ node, hSize, vSize, canvas });
    if ( node.label ) {
        text( position[0] + offsetX, position[1] + offsetY, 0, 0, node.label, {
            ...defaultNodeStyle,
            ...nodeStyle,
        }).addTo( canvas );
    } else if ( isDraft ) {
        text( position[0] + offsetX, position[1] + offsetY, 0, 0, key, {
            ...defaultNodeStyle,
            ...nodeStyle,
            ...draftNodeStyle
        }).addTo( canvas ); }
}

function drawNode({ node, position, canvas, size, styles, key, isDraft }) {
    const nodeStyle = extractStyles( node, styles );
    switch ( node.shape ) {
        case 'circle':
            circle( position[0], position[1], size/2 * node.size, nodeStyle ).addTo( canvas );
            drawNodeLabel({ node, position, canvas, key, nodeStyle, hSize: size/2, vSize: size/2, isDraft });
            break;
        case 'square':
            square( position[0], position[1], size * node.size, nodeStyle ).addTo( canvas );
            drawNodeLabel({ node, position, canvas, key, nodeStyle, hSize: size/2, vSize: size/2, isDraft });
            break;
        case 'rectangle':
            rectangle( position[0], position[1], size * node.size * node.widthToHeight, size * node.size, nodeStyle ).addTo( canvas );
            drawNodeLabel({ node, position, canvas, key, nodeStyle, hSize: node.widthToHeight * size/2, vSize: size/2, isDraft });
            break;
        case 'ellipse':
            ellipse( position[0], position[1], size * node.size * node.widthToHeight/2, size * node.size/2, nodeStyle ).addTo( canvas );
            drawNodeLabel({ node, position, canvas, key, nodeStyle, hSize: node.widthToHeight * size/2, vSize: size/2, isDraft });
            break;
        case 'diamond':
            diamond( position[0], position[1], size * node.size * node.widthToHeight, size * node.size, nodeStyle ).addTo( canvas );
            drawNodeLabel({ node, position, canvas, key, nodeStyle, hSize: node.widthToHeight * size/2, vSize: size/2, isDraft });
            break;
        case 'triangle':
            triangle( position[0], position[1], size/2 * node.size, nodeStyle ).addTo( canvas );
            drawNodeLabel({ node, position, canvas, key, nodeStyle, hSize: node.widthToHeight * size/2, vSize: size/2, isDraft });
            break;
        default:
            throw new Error( `Unrecognized node shape: ${node.shape}` );
    }
}

// Let c0, c1, c2, c3  be the control points of the cubic Bezier curve, with c0, c3 being the endpoints
// Let   m0 = (c0 + c1)/2
//       m1 = (c1 + c2)/2
//       m2 = (c2 + c3)/2
//       m3 = (m0 + m1)/2
//       m4 = (m1 + m2)/2
//       m5 = (m3 + m4)/2
// Then, m5 is the midpoint of the Bezier curve.
// Expanding
//   m5 = h ( h m0 + h m1 + h m1 + h m2) = q m0 + h m1 + q m2
//      = q h c0 + q h c1 + h h c1 + h h c2 + q h c2 + q h c3
//      = e c0 + e c1 + q c1 + q c2 + e c2 + e c3
//      = e c0 + 3 e c1 + 3 e c2 + e c3
//  We have midpoint = c0 / 8 + 3 c1 / 8 + 3 c2 / 8 + c3 /8
//
// Tangent direction at midpoint is  m4 - m3 suitably normalized
// m4 - m3 = h m1 + h m2 - h m0 - h m 1 = h (m2 - m0)
//         = q c3 + q c2 - q c1 - q c0


function findLinearEdgeMidpoint( [x0, y0], [x1, y1] ) {
    return [ (x0 + x1) / 2, (y0 + y1) / 2 ];
}

function findBezierEdgeMidpoint( sourcePos, targetPos, edge, size, arrow ) {
    const [ x0, y0, x1, y1, cx0, cy0, cx1, cy1 ] = edgeCurveExtent( sourcePos, targetPos, arrow, size, edge );
    return [ (x0 + 3 * cx0 + 3 * cx1 + x1) / 8, (y0 + 3 * cy0 + 3 * cy1 + y1) / 8 ];
}

const edgeBaseOffset = 12;

function drawEdgeTextAtMidpoint({ edge, midpoint, tangent, text, drawAbove, canvas, edgeStyle, nodeDistance, extraOffset = [0, 0] }) {
    let angle = Math.atan2( tangent[1], tangent[0] ) / DEGREES_TO_RADIANS;
    const offsetVector = calculateOffsetVector( extraOffset );
    let flip = 1;
    if ( tangent[0] < 0 ) {
        angle = ( angle + 180 ) % 360;
        flip = -1;
    }
    console.log( 'extraOffset:', extraOffset, offsetVector );
    console.log( 'nodeDistance:', nodeDistance );
    const [dx, dy] = positiveHalfSpace( tangent );
    const perp = (drawAbove ? -1 : 1) * edgeBaseOffset;
    const offsetH = [ flip * 0.5 * nodeDistance * offsetVector[0] * dy, -flip * 0.5 * nodeDistance * offsetVector[0] * dx ];  // [-dy, dx] is normalized tangent
    const offsetV = [ flip * (perp + 0.5 * nodeDistance * offsetVector[1]) * dx, flip * (perp + 0.5 * nodeDistance * offsetVector[1]) * dy ];
    const textElem = rotatedText( midpoint[0] + offsetH[0] + offsetV[0], midpoint[1] + offsetH[1] + offsetV[1], text, angle, edgeStyle );
    textElem.addTo( canvas );
}

function positiveHalfSpace( [a, b] ) {
    const norm = Math.sqrt( a * a + b * b );
    return [ -b/norm, a/norm ];
}

function drawLinearEdge( { sourcePos, targetPos, edge, key, edgeStyle, size, arrow, canvas, isDraft } ) {
    const [x0, y0, x1, y1] = edgeExtent( sourcePos, targetPos, arrow, size );
    const lineElem = line( x0, y0, x1, y1, edgeStyle );
    lineElem.addTo( canvas );
    if ( arrow ) {
        arrow.addTo( canvas );
        lineElem.marker( 'end', arrow );
    }
    if ( isDraft || edge.label || edge.weight !== void 0 ) {
        const midpoint = findLinearEdgeMidpoint( sourcePos, targetPos );
        const tangent = [ x1 - x0, y1 - y0 ];
        let label;
        const style = {...edgeStyle};
        if ( edge.label ) {
            label = edge.label;
        }
        else if ( isDraft ) {
            label = key;
            style.opacity = 0.75;
            style.fontColor = 'grey';
        }
        if ( label ) {
            drawEdgeTextAtMidpoint({
                edge,
                midpoint,
                nodeDistance: Math.sqrt( (x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0) ),
                tangent,
                text: label,
                drawAbove: true,
                canvas,
                edgeStyle: style,
                extraOffset: edge.labelOffset
            });
        }
        if ( edge.weight !== void 0 ) {
            drawEdgeTextAtMidpoint({
                edge,
                midpoint,
                nodeDistance: Math.sqrt( (x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0) ),
                tangent,
                text: String(edge.weight),
                drawAbove: false,
                canvas,
                edgeStyle,
                extraOffset: edge.weightOffset
            });
        }
    }
}

function drawBezierEdge( { sourcePos, targetPos, edge, key, edgeStyle, size, arrow, canvas, isDraft } ) {
    const [ x0, y0, x1, y1, cx0, cy0, cx1, cy1 ] = edgeCurveExtent( sourcePos, targetPos, arrow, size, edge );
    const curveElem = bezier( x0, y0, cx0, cy0, cx1, cy1, x1, y1, edgeStyle );
    curveElem.addTo( canvas );
    if ( arrow ) {
        arrow.addTo( canvas );
        curveElem.marker( 'end', arrow );
    }
    if ( isDraft || edge.label || edge.weight !== void 0 ) {
        const midpoint = findBezierEdgeMidpoint( sourcePos, targetPos, edge, size, arrow );
        const tangent = [ (x1 + cx1 - cx0 - x0) / 4, (y1 + cy1 - cy0 - y0) / 4 ];  // Tangent to the curve at the midpoint (unnormalized)
        const label = isDraft ? (edge.label || key) : edge.label;
        if ( label ) {
            drawEdgeTextAtMidpoint( { edge, midpoint, tangent, text: label, drawAbove: true, canvas, edgeStyle, isDraft, extraOffset: edge.labelOffset } );
        }
        if ( edge.weight !== void 0 ) {
            drawEdgeTextAtMidpoint( { edge, midpoint, tangent, text: String(edge.weight), drawAbove: false, canvas, edgeStyle, isDraft, extraOffset: edge.weightOffset } );
        }
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
    const isDraft = config.draft === void 0 ? true : config.draft;

    const decorations = graph.decorations || [];
    for ( let i = 0; i < decorations.length; ++i ) {
        const decoration = decorations[ i ];
        const decorationStyle = extractStyles( decoration, graph.styles );
        const x = decoration.x * width;
        const y = ( 1.0 - decoration.y ) * height;
        switch ( decoration.type ) {
            case 'text':
                text( x, y, 0, 0, decoration.text, decorationStyle ).addTo( canvas );
                break;
            case 'region':
                rectangle( x, y, decoration.region[0] * width, decoration.region[1] * height, decorationStyle ).addTo( canvas );
                break;
            default:
                throw new Error( `Unrecognized decoration type: ${decoration.type}` );
        }
    }


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
            isDraft
        });
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
                drawLinearEdge({
                    sourcePos,
                    targetPos,
                    edge: edges[ edge ],
                    key: edge,
                    edgeStyle,
                    size: size/2,
                    arrow,
                    canvas,
                    isDraft
                });
            } else {
                drawBezierEdge({
                    sourcePos,
                    targetPos,
                    edge: edges[ edge ],
                    key: edge,
                    edgeStyle,
                    size: size/2,
                    arrow,
                    canvas,
                    isDraft
                });
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
