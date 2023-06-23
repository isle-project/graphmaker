const { createSVGWindow } = require( 'svgdom' );
const { SVG, registerWindow, G } = require( '@svgdotjs/svg.js' );
const debug = require( 'debug' )( 'graphmaker:svg' );
const { circle, diamond, line, ellipse, rectangle, square, triangle, arrowhead, text, rotatedText, bezier } = require( './svg-elements.js' );
const svgProjectStyle = require( './project-style.js' );
const DEFAULT_CONFIG = require( './../spec/default-config.json' );
const latexSvgScaled = require( './latex-to-svg.js' );
const { DEGREES_TO_RADIANS, ZERO_TOLERANCE } = require( './../constants.js' );
const { directionalHistogram, selfLoopDirections } = require( './../node-positions.js' );
const { circleBoundary, rectangleBoundary, diamondBoundary, ellipseBoundary, triangleBoundary,
    lineSegmentMidpoint, positiveHalfSpace, rotate2d, bezierCurveMidpoint, calculateOffsetVector } = require( './../geometry.js' );


// Style Defaults

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


// Configuration Constants

const LABEL_OFFSET_FACTOR = 1.2;

const LABEL_HANDLERS = {
    'latex': drawLaTeXLabel,
    'tex': drawLaTeXLabel,
    'math': drawMathLingoLabel
};
const HANDLER_REGEXP = new RegExp( `^(${Object.keys(LABEL_HANDLERS).join('|')}):\\s*(.*)$` );

const DEFAULT_LOOP_ANGLE = 25;
const DEFAULT_LOOP_UNIT = [ 1, 0 ];

const EDGE_BASE_OFFSET = 12;


// SVG-focused Geometric Utilities

/**
 * Converts input positional coordinates to SVG canvas coordinates.
 *
 * @param {number[][]} positions - array of 2D positional arrays (x, y)
 * @param {number} width - width of the SVG canvas
 * @param {number} height - height of the SVG canvas
 * @param {number} [margin=0] - margin to be maintained from the edges of the SVG canvas
 * @returns {Function} function that takes a 2D position array (x, y) as input and returns the corresponding SVG canvas coordinates as a 2D array [x', y']
 */
function svgCoords( positions, width, height, margin=0 ) {
    const rangeX = positions.reduce( ([minX, maxX], [x, _]) => [Math.min(minX, x), Math.max(maxX, x)], [1e10, -1e10]);
    const rangeY = positions.reduce( ([minY, maxY], [_, y]) => [Math.min(minY, y), Math.max(maxY, y)], [1e10, -1e10]);
    const isXFlat = Math.abs(rangeX[1] - rangeX[0]) < ZERO_TOLERANCE;
    const isYFlat = Math.abs(rangeY[1] - rangeY[0]) < ZERO_TOLERANCE;
    if ( isXFlat && isYFlat ) {
        return ([x, y]) => [width/2, height/2];
    } else if ( isXFlat && !isYFlat ) {
        return ([x, y]) => [width/2, (margin + (1 - 2*margin)*(rangeY[1] - y)/(rangeY[1] - rangeY[0])) * height];
    } else if ( !isXFlat && isYFlat ) {
        return ([x, y]) => [(margin + (1 - 2*margin)*(x - rangeX[0])/(rangeX[1] - rangeX[0])) * width, height/2];
    }
    return ([x, y]) => [(margin + (1 - 2*margin)*(x - rangeX[0])/(rangeX[1] - rangeX[0])) * width,
                        (margin + (1 - 2*margin)*(rangeY[1] - y)/(rangeY[1] - rangeY[0])) * height];
}

/**
 * Returns the base size of a node in the graph.
 *
 * @param {number} n - number of nodes in the graph
 * @param {number} width - width of the graph
 * @param {number} height - height of the graph
 * @returns {number} base size of a node in the graph
 */
function baseNodeSize( n, width, height ) {
    const extent = Math.min( width, height );
    return Math.min( 0.1, 0.25/n ) * extent;
}

/**
 * Returns (x,y) coordinates of the point on the source node boundary along the line from the source to the target.
 *
 * @param {[number, number]} sourcePos - (x,y) coordinates of the source node
 * @param {[number, number]} targetPos - (x,y) coordinates of the target node
 * @param {Object} node - source node
 * @param {Object} arrow - arrowhead object for the edge
 * @param {number} baseSize - base size in the graph
 * @returns {[number,number]} (x,y) coordinates of the point on the source node boundary along the given line
 */
function shapeBoundaryOnLine( [sourceX, sourceY], [targetX, targetY], node, arrow, baseSize ) {
    const height = node.nodeSize * baseSize;
    const width = height * (node.nodeWidthToHeight || 1);
    const arrowSize = arrow ? arrow.attr('markerHeight') : 0;
    switch ( node.nodeShape ) {
        case 'circle':
        case 'invisible':
            return circleBoundary( [sourceX, sourceY], [targetX, targetY], width, arrowSize );
        case 'square':
            return rectangleBoundary( [sourceX, sourceY], [targetX, targetY], width, height, arrowSize );
        case 'rectangle':
            return rectangleBoundary( [sourceX, sourceY], [targetX, targetY], width, height, arrowSize );
        case 'ellipse':
            return ellipseBoundary( [sourceX, sourceY], [targetX, targetY], width, height, arrowSize );
        case 'diamond':
            return diamondBoundary( [sourceX, sourceY], [targetX, targetY], width, height, arrowSize );
        case 'triangle':
            return triangleBoundary( [sourceX, sourceY], [targetX, targetY], width, baseSize/2 * node.nodeSize, arrowSize );
        default:
            throw new Error( `Unrecognized node shape: ${node.nodeShape}` );
    }
}

/**
 * Computes starting point and first control point of a cubic Bezier curve with a given angle and softness.
 *
 * The Bezier curve goes from `sourcePos` to `targetPos`, leaving the source with a particular angle
 * and softness (corresponding to curvature). Because the parameters at the end point may differ, we
 * compute only the starting point and first control point here. Typically, two calls are required
 * to uniquely determine the full Bezier curve between the points.
 *
 * Note also that the computed curve effectively starts at the boundary of the true curve with the
 * given node's shape. Thus, we distinguish between the (unrendered) complete curve from source to
 * target, and the rendered curve which shows only a subset of the former.
 *
 * @param {[number, number]} sourcePos - 2D position of the curve's true (but unrendered) starting point
 * @param {[number, number]} targetPos - 2D position of the curve's true end point
 * @param {Object} node - specification for the source node, which determines for instance the node's
 *     shape and size for calculation of the boundary.
 * @param {Object|false} arrow - either falsy, or an SVG marker object specifying the arrow head on this end
 * @param {number} baseSize - the base size (in coordinate units) of a node, to be scaled by `node`'s
 *     particular properties (cf. size and widthToHeight)
 * @param {number} dir.angle - the angular direction by which the curve leaves the true source point
 * @param {[number=0.5]} dir.softness - an index from 0 to 1 determining the curvature of the curve
 *     at the first control point
 * @return { [number, number, number, number]} an array containing, contiguously, the coordinates of
 *     the rendered starting point and first control point of the Bezier curve.
 */
function bezierKeyPoints( sourcePos, targetPos, node, arrow, baseSize, { angle, softness = 0.5 }) {
    const [ sourceX, sourceY ] = sourcePos;
    const [ targetX, targetY ] = targetPos;
    let dx = targetX - sourceX;
    let dy = targetY - sourceY;
    const norm = Math.sqrt( dx*dx + dy*dy );
    dx = dx/norm;
    dy = dy/norm;
    const [ux, uy] = rotate2d( dx, dy, angle );
    const [x0, y0] = shapeBoundaryOnLine( sourcePos, [sourceX + norm*ux, sourceY + norm*uy], node, arrow, baseSize );
    return [  x0, y0, sourceX + softness * norm * ux, sourceY + softness * norm * uy ];
}

/**
 * Calculates an offset vector for (and relative to) a specified node
 *
 * @param {Object} o.node - the node object for the target node
 * @param {number} hSize - the horizontal size of the node in coordinate units
 * @returns {[number, number]} the offset vector in coordinate units
 */
function calculateOffsets({ node, hSize }) {
    const labelOffset = node.labelOffset;
    const offsetVector = calculateOffsetVector( labelOffset );

    // ATTN: Previously used canvas size to scale in case of an absolute numeric pair
    //       For now, scale by the node size only and we'll see how natural that is.
    return [
        LABEL_OFFSET_FACTOR * hSize * node.nodeSize * offsetVector[0],
        LABEL_OFFSET_FACTOR * hSize * node.nodeSize * offsetVector[1]
    ];
}


// Drawing Entities

/**
 * Draws a node LaTeX equation label at the given position.
 *
 * @param {string} label - LaTeX equation label to draw
 * @param {number} x - x-coordinate of the label's position
 * @param {number} y - y-coordinate of the label's position
 * @param {Object} style - style object for the label
 * @returns {Promise} promise resolving to a G element containing the label
 */
async function drawLaTeXLabel( label, x, y, style ) {
    const { children, attributes } = await latexSvgScaled( label, x, y, style.fontSize );
    // Create a G element to hold the children
    const g = new G({
        transform: attributes.transform,
        'color': style.fontColor || 'black'
    });
    // Add the children to the G element
    g.add( SVG(children) );
    return g;
}

/**
* Draws a MathLingo equation at the given position.
*
* @param {string} label - MathLingo equation to draw
* @param {number} x - x-coordinate of the label's position
* @param {number} y - y-coordinate of the label's position
* @param {Object} style - style object for the label
* @returns {Promise} promise resolving to a G element containing the label
*/
async function drawMathLingoLabel( label, x, y, style ) {
    // TODO: Add support for MathLingo
}

/**
 * Draws a node label at the given position.
 *
 * @param {Object} options - options object
 * @param {Object} options.node - node object
 * @param {[number,number]} options.position - (x,y) coordinates of the node
 * @param {Object} options.canvas - SVG canvas
 * @param {string} options.key - node key
 * @param {number} options.hSize - horizontal size of the node
 * @param {number} options.vSize - vertical size of the node
 * @param {boolean} options.isDraft - whether the node is a draft
 * @returns {void}
 */
async function drawNodeLabel({ node, position, canvas, key, hSize, vSize, isDraft }) {
    const [ offsetX, offsetY ] = calculateOffsets({ node, hSize, vSize, canvas });
    const posX = position[0] + offsetX;
    const posY = position[1] + offsetY;
    const labelStyle = {
        ...defaultNodeStyle,
        ...node,
    };
    const nameOffset = [ 0, 0 ];
    if ( node.label ) {
        const match = HANDLER_REGEXP.exec( node.label );
        if ( match ) {
            const [ _, handlerName, label ] = match;
            const handler = LABEL_HANDLERS[ handlerName.toLowerCase() ];
            if ( handler ) {
                labelStyle.xExtent = hSize;
                labelStyle.yExtent = vSize;
                const g = await handler( label, posX, posY, labelStyle );
                if ( g ) {
                    g.addTo( canvas );
                }
                return;
            }
        }
        text( posX, posY, 0, 0, node.label, labelStyle).addTo( canvas );
        nameOffset[1] = ( vSize * node.nodeSize ) + labelStyle.fontSize / 2;
    }
    if ( isDraft ) {
        text( posX, posY, nameOffset[0], nameOffset[1], key, { ...labelStyle, ...draftNodeStyle }).addTo( canvas );
    }
}

/**
 * Draws a node at the given position.
 *
 * @param {Object} options - options object
 * @param {Object} options.node - node object
 * @param {[number,number]} options.position - (x,y) coordinates of the node
 * @param {Object} options.canvas - SVG canvas
 * @param {number} options.baseSize - base size of the node
 * @param {string} options.key - node key
 * @param {boolean} options.isDraft - whether the node is a draft
 * @returns {Promise} promise resolving to the node's SVG element
 */
async function drawNode({ node, position, canvas, baseSize, key, isDraft }) {
    debug( 'About to Project Style' );
    const myStyles = svgProjectStyle( node, node.nodeShape );

    debug( 'fillStyle: ', node.fillStyle );
    if ( node.fillStyle && node.fillStyle !== 'solid' ) {
        debug( 'Adding fill pattern to canvas: ', node.fillStyle );
        // Ensure that any patterns used for fill are in the svg before their use
        debug( 'URL:'+ myStyles.fill.url() );
        myStyles.fill.addTo( canvas );
        debug( 'Added fill pattern to canvas...' );
        node.fillStyle = 'solid';  // ATTN! HACK ALERT -- so label is drawn without a fillStyle
    }
    const shape = node.nodeShape;
    const size = node.nodeSize;
    switch ( shape ) {
        case 'circle':
            circle( position[0], position[1], baseSize/2 * size, myStyles ).addTo( canvas );
            await drawNodeLabel({ node, position, canvas, key, hSize: baseSize/2, vSize: baseSize/2, isDraft });
            break;
        case 'square':
            square( position[0], position[1], baseSize * size, myStyles ).addTo( canvas );
            await drawNodeLabel({ node, position, canvas, key, hSize: baseSize/2, vSize: baseSize/2, isDraft });
            break;
        case 'rectangle':
            rectangle( position[0], position[1], baseSize * size * node.nodeWidthToHeight, baseSize * size, myStyles ).addTo( canvas );
            await drawNodeLabel({ node, position, canvas, key, hSize: node.nodeWidthToHeight * baseSize/2, vSize: baseSize/2, isDraft });
            break;
        case 'ellipse':
            ellipse( position[0], position[1], baseSize * size * node.nodeWidthToHeight/2, baseSize * size/2, myStyles ).addTo( canvas );
            await drawNodeLabel({ node, position, canvas, key, hSize: node.nodeWidthToHeight * baseSize/2, vSize: baseSize/2, isDraft });
            break;
        case 'diamond':
            diamond( position[0], position[1], baseSize * size * node.nodeWidthToHeight, baseSize * size, myStyles ).addTo( canvas );
            await drawNodeLabel({ node, position, canvas, key, hSize: node.nodeWidthToHeight * baseSize/2, vSize: baseSize/2, isDraft });
            break;
        case 'triangle':
            triangle( position[0], position[1], baseSize/2 * size, myStyles ).addTo( canvas );
            await drawNodeLabel({ node, position, canvas, key, hSize: node.nodeWidthToHeight * baseSize/2, vSize: baseSize/2, isDraft });
            break;
        case 'invisible':
            await drawNodeLabel({ node, position, canvas, key, hSize: baseSize/2, vSize: baseSize/2, isDraft });
            break;
        default:
            throw new Error( `Unrecognized node shape: ${shape}` );
    }
}

/**
 * Draws text at the midpoint of an edge on the given canvas.
 *
 * @param {Object} options - options object
 * @param {Object} options.edge - edge object containing edge data
 * @param {[number,number]} options.midpoint - midpoint of the edge (x,y)
 * @param {[number,number]} options.tangent - tangent to the curve at the midpoint
 * @param {string} options.text - text to be drawn
 * @param {boolean} options.drawAbove - whether to draw the text above the edge
 * @param {Object} options.canvas - SVG canvas
 * @param {number} options.nodeDistance - distance between the nodes of the edge
 * @param {[number,number]} [options.extraOffset=[0, 0]] - extra offset for the text position
 * @returns {void}
 */
function drawEdgeTextAtMidpoint({ edge, midpoint, tangent, text, drawAbove, canvas, nodeDistance, extraOffset = [0, 0] }) {
    let angle = Math.atan2( tangent[1], tangent[0] ) / DEGREES_TO_RADIANS;
    const offsetVector = calculateOffsetVector( extraOffset );
    let flip = 1;
    if ( tangent[0] < 0 ) {
        angle = ( angle + 180 ) % 360;
        flip = -1;
    }
    const [dx, dy] = positiveHalfSpace( tangent );
    const perp = (drawAbove ? -1 : 1) * EDGE_BASE_OFFSET;
    const offsetH = [ flip * 0.5 * nodeDistance * offsetVector[0] * dy, -flip * 0.5 * nodeDistance * offsetVector[0] * dx ];  // [-dy, dx] is normalized tangent
    const offsetV = [ flip * (perp + 0.5 * nodeDistance * offsetVector[1]) * dx, flip * (perp + 0.5 * nodeDistance * offsetVector[1]) * dy ];
    const textElem = rotatedText( midpoint[0] + offsetH[0] + offsetV[0], midpoint[1] + offsetH[1] + offsetV[1], text, angle, edge );
    textElem.addTo( canvas );
}

/**
 * Draws a linear edge between two nodes.
 *
 * @param {Object} options - options object
 * @param {[number, number]} options.sourcePos - position of the source node (x,y)
 * @param {[number, number]} options.targetPos - position of the target node (x,y)
 * @param {Object} options.edge - edge object containing edge data
 * @param {string} options.key - edge key
 * @param {number} options.baseSize - base size of the edge
 * @param {Object} options.source - source node object
 * @param {Object} options.target - target node object
 * @param {Object} options.arrow - arrow object
 * @param {Object} options.canvas - SVG canvas
 * @param {boolean} options.isDraft - whether the edge is a draft
 * @returns {void}
 */
function drawLinearEdge( { sourcePos, targetPos, edge, key, baseSize, source, target, arrow, canvas, isDraft } ) {
    const myStyles = svgProjectStyle( edge, 'line' );
    const [x0, y0] = shapeBoundaryOnLine( sourcePos, targetPos, source, null, baseSize );
    const [x1, y1] = shapeBoundaryOnLine( targetPos, sourcePos, target, arrow, baseSize );
    const lineElem = line( x0, y0, x1, y1, myStyles );
    lineElem.addTo( canvas );
    if ( arrow ) {
        arrow.addTo( canvas );
        lineElem.marker( 'end', arrow );
    }
    if ( isDraft || edge.label || edge.weight !== void 0 ) {
        const midpoint = lineSegmentMidpoint( sourcePos, targetPos );
        const tangent = [ x1 - x0, y1 - y0 ];
        let label = edge.label || (isDraft && key);
        if ( label ) {
            drawEdgeTextAtMidpoint({
                edge: isDraft ? { label: key, opacity: 0.75, fontColor: 'grey', ...edge } : { label: key, ...edge },
                midpoint,
                nodeDistance: Math.sqrt( (x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0) ),
                tangent,
                text: label,
                drawAbove: true,
                canvas,
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
                extraOffset: edge.weightOffset
            });
        }
    }
}

/**
 * Draws a Bezier edge between two nodes on the given canvas.
 *
 * @param {Object} options - options object
 * @param {[number,number]} options.sourcePos - source node position (x,y)
 * @param {[number,number]} options.targetPos - target node position (x,y)
 * @param {Object} options.edge - edge object containing edge data
 * @param {string} options.key - edge key
 * @param {number} options.baseSize - base size for the edge
 * @param {Object} options.source - source node object
 * @param {Object} options.target - target node object
 * @param {Object} options.arrow - arrow object (can be null if the edge has no arrow)
 * @param {Object} options.canvas - SVG canvas
 * @param {boolean} options.isDraft - whether the graph should be rendered in draft mode
 * @returns {void}
 */
function drawBezierEdge( { sourcePos, targetPos, edge, key, baseSize, source, target, arrow, canvas, isDraft } ) {
    const [ x0, y0, cx0, cy0 ] = bezierKeyPoints( sourcePos, targetPos, source, null, baseSize, { angle: edge.angleLeaving, softness: edge.softnessLeaving });
    const [ x1, y1, cx1, cy1 ] = bezierKeyPoints( targetPos, sourcePos, target, arrow, baseSize, { angle: -edge.angleEntering, softness: edge.softnessEntering } );
    const myStyles = svgProjectStyle( edge, 'line' );
    const curveElem = bezier( x0, y0, cx0, cy0, cx1, cy1, x1, y1, myStyles );
    curveElem.addTo( canvas );
    if ( arrow ) {
        arrow.addTo( canvas );
        curveElem.marker( 'end', arrow );
    }
    if ( isDraft || edge.label || edge.weight !== void 0 ) {
        const midpoint = bezierCurveMidpoint( x0, y0, x1, y1, cx0, cy0, cx1, cy1 );
        const tangent = [ (x1 + cx1 - cx0 - x0) / 4, (y1 + cy1 - cy0 - y0) / 4 ];  // Tangent to the curve at the midpoint (unnormalized)
        const label = isDraft ? (edge.label || key) : edge.label;
        if ( label ) {
            drawEdgeTextAtMidpoint({
                edge,
                midpoint,
                tangent,
                text: label,
                drawAbove: true,
                canvas,
                nodeDistance: Math.sqrt( (x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0) ),
                isDraft,
                extraOffset: edge.labelOffset
            });
        }
        if ( edge.weight !== void 0 ) {
            drawEdgeTextAtMidpoint({
                edge,
                midpoint,
                tangent,
                text: String(edge.weight),
                drawAbove: false,
                canvas,
                nodeDistance: Math.sqrt( (x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0) ),
                isDraft,
                extraOffset: edge.weightOffset
            });
        }
    }
}

/**
 * Draws a self-loop edge.
 *
 * @param {Object} options - options for drawing the self-loop edge
 * @param {number[]} options.pos - (x,y) coordinates of the center of the node
 * @param {Object} options.edge - edge object
 * @param {string} options.key - key of the edge
 * @param {number} options.baseSize - base node size
 * @param {Object} options.source - source node object
 * @param {Object} options.arrow - arrowhead object for the edge
 * @param {Object} options.canvas - SVG canvas
 * @param {boolean} options.isDraft - whether the graph is a draft
 * @param {number} options.angleLeaving - angle at which the edge leaves the node
 * @param {number} options.angleEntering - angle at which the edge enters the node
 * @param {number} [options.softnessEntering=0.95] - softness of the edge entering the node
 * @param {number} [options.softnessLeaving=0.95] - softness of the edge leaving the node
 * @param {number} [options.directionAngle=0] - angle by which the loop sticks out of the node (0 = east, 90 = north, etc.)
 */
function drawSelfLoopEdge( { pos, edge, key, baseSize, source, arrow, canvas, isDraft, angleLeaving, angleEntering, softnessEntering = 0.95, softnessLeaving = 0.95, directionAngle = 90 } ) {
    const size = baseSize/ 2;
    const [ x, y ] = pos;
    const offsetAngleUp = (directionAngle + 10) * DEGREES_TO_RADIANS;  // ATTN: Constants + the eastern offset position is hard coded here
    const offsetAngleDown = (directionAngle - 10) * DEGREES_TO_RADIANS;
    const [x0, y0] = shapeBoundaryOnLine( [x, y], [x + Math.cos(offsetAngleUp) * 10 * baseSize, y - Math.sin(offsetAngleUp) * 10 * baseSize], source, null, baseSize );
    const [x1, y1] = shapeBoundaryOnLine( [x, y], [x + Math.cos(offsetAngleDown) * 10 * baseSize, y - Math.sin(offsetAngleDown) * 10 * baseSize], source, arrow, baseSize );
    const [ ux, uy ] = rotate2d( DEFAULT_LOOP_UNIT[0], DEFAULT_LOOP_UNIT[1], -(angleLeaving || DEFAULT_LOOP_ANGLE ) - directionAngle );   // ATTN: 0 forbidden?
    const [ vx, vy ] = rotate2d( DEFAULT_LOOP_UNIT[0], DEFAULT_LOOP_UNIT[1], (angleEntering || DEFAULT_LOOP_ANGLE ) - directionAngle );
    const cx0 = x0 + softnessLeaving * 3 * size * ux;
    const cy0 = y0 + softnessLeaving * 3 * size * uy;
    const cx1 = x1 + softnessEntering * 3 * size * vx;
    const cy1 = y1 + softnessEntering * 3 * size* vy;
    const myStyles = svgProjectStyle( edge, 'line' );
    const curveElem = bezier( x0, y0, cx0, cy0, cx1, cy1, x1, y1, myStyles );
    curveElem.addTo( canvas );
    if ( arrow ) {
        arrow.addTo( canvas );
        curveElem.marker( 'end', arrow );
    }
    if ( isDraft || edge.label || edge.weight !== void 0 ) {
        const midpoint = bezierCurveMidpoint( x0, y0, x1, y1, cx0, cy0, cx1, cy1 );
        const tangent = [ (x1 + cx1 - cx0 - x0) / 4, (y1 + cy1 - cy0 - y0) / 4 ];  // Tangent to the curve at the midpoint (unnormalized)
        const label = isDraft ? (edge.label || key) : edge.label;
        if ( label ) {
            drawEdgeTextAtMidpoint({
                edge,
                midpoint,
                tangent,
                text: label,
                drawAbove: false,
                canvas,
                nodeDistance: 4 * size, // ATTN
                isDraft,
                extraOffset: edge.labelOffset
            });
        }
        if ( edge.weight !== void 0 ) {
            drawEdgeTextAtMidpoint({
                edge,
                midpoint,
                tangent,
                text: String(edge.weight),
                drawAbove: true,
                canvas,
                nodeDistance: 4 * size, // ATTN
                isDraft,
                extraOffset: edge.weightOffset
            });
        }
    }
}


// Main Entry Point

/**
 * Returns an SVG representation of the graph.
 *
 * @param {Object} graph - graph to be rendered
 * @param {Object} positions - initial positions of the nodes in the graph
 * @param {Object} [config={}] - configuration options
 * @returns {Promise<string>} - SVG representation of the graph
 */
async function toSVG( graph, positions, config = {} ) {
    debug( 'Creating SVG window...' );
    const window = createSVGWindow();
    const document = window.document;

    debug( 'Registering window...' );
    registerWindow(window, document);
    debug( 'config: ', config );
    const width = config.width || DEFAULT_CONFIG.width;
    const height = config.height || DEFAULT_CONFIG.height;

    debug( 'Creating SVG canvas...' );
    const canvas = SVG( document.documentElement )
        .size( width, height )
        .viewbox( 0, 0, width, height );

    const nodes = graph.nodes;
    const edges = graph.edges;
    const isDraft = config.draft === void 0 ? true : config.draft;

    debug( 'Adding decorations...' );
    const decorations = graph.decorations;
    if ( decorations ) {
        const decorationKeys = Object.keys( decorations );
        for ( let i = 0; i < decorationKeys.length; ++i ) {
            const decoration = decorations[decorationKeys[i]];
            const x = decoration.x * width;
            const y = ( 1.0 - decoration.y ) * height;
            switch ( decoration.type ) {
                case 'text':
                    text( x, y, 0, 0, decoration.text, decoration ).addTo( canvas );
                    break;
                case 'region': {
                    const decorationWidth = ( decoration.region.width || decoration.width || 0 ) * width;
                    const decorationHeight = ( decoration.region.height || decoration.height || 0 ) * height;
                    rectangle( x, y, decorationWidth, decorationHeight, decoration ).addTo( canvas );
                    break;
                }
                default:
                    throw new Error( `Unrecognized decoration type: ${decoration.type}` );
            }
        }
    }
    const nodeKeys = Object.keys( nodes );
    debug( 'nodeKeys:', nodeKeys );
    positions = positions.map( svgCoords(positions, width, height, 0.25) );
    debug( 'positions (svgCoords):', positions );
    const baseSize = baseNodeSize( nodeKeys.length, width, height );
    for ( let i = 0; i < nodeKeys.length; i++ ) {
        const node = nodes[ nodeKeys[ i ] ];
        await drawNode({
            node,
            position: positions[ i ],
            canvas,
            baseSize,
            key: nodeKeys[ i ],
            isDraft
        });
    }
    const adjacency = graph._adjacency;
    const adjacencyKeys = Object.keys( adjacency );
    const useArrow = graph.directed;
    const DIRECTIONAL_BINWIDTH = 10;  // Ensure that this divides 360 for edge case below
    for ( let i = 0; i < adjacencyKeys.length; ++i ) {
        const source = adjacencyKeys[ i ];
        const sourceIndex = nodeKeys.indexOf( source );
        const nSelfLoops = adjacency[source].filter( edgeName => edges[ edgeName ].target === source ).length;
        let selfLoopAngles = [];
        if ( nSelfLoops > 0 ) {
            const hist = directionalHistogram( sourceIndex, positions, -1, DIRECTIONAL_BINWIDTH );
            selfLoopAngles = selfLoopDirections( hist, nSelfLoops );
            if ( selfLoopAngles === null ) {  // Edge case: no clear directions
                // Choose the nSelfLoops directions with minimal histogram values
                throw new Error( 'Dense angular case heuristic not yet implemented' );
            }
        }
        let selfLoop = 0;
        for ( let edgeName of adjacency[source] ) {
            const edge = edges[ edgeName ];
            if ( edge === void 0 || edge === '' ) {
                edge = source + edge.target;
            }
            const edgeObject = edges[edgeName];
            const targetIndex = nodeKeys.indexOf( edge.target );
            const sourcePos = positions[ sourceIndex ];
            const targetPos = positions[ targetIndex ];
            if ( !edgeObject.fillColor && edgeObject?.lineColor ) {
                edgeObject.fillColor = edgeObject.lineColor;
            }
            let arrow = null;
            if ( useArrow ) {
                arrow = arrowhead( 8, 8, edgeObject );
            }
            if ( edge.target === source ) { // Case: Self Loop
                drawSelfLoopEdge({
                    pos: sourcePos,
                    edge: edgeObject,
                    key: edgeName,
                    baseSize: baseSize,
                    source: nodes[ source ],
                    arrow,
                    canvas,
                    isDraft,
                    directionAngle: selfLoopAngles[selfLoop++]
                });
            }
            else if (
                Math.abs( edgeObject.angleEntering ) < 2**-20 &&
                Math.abs( edgeObject.angleLeaving ) < 2**-20
            ) {
                drawLinearEdge({
                    sourcePos,
                    targetPos,
                    edge: edgeObject,
                    key: edgeName,
                    baseSize: baseSize,
                    source: nodes[ source ],
                    target: nodes[ edge.target ],
                    arrow,
                    canvas,
                    isDraft
                });
            } else {
                drawBezierEdge({
                    sourcePos,
                    targetPos,
                    edge: edgeObject,
                    key: edgeName,
                    baseSize: baseSize,
                    source: nodes[ source ],
                    target: nodes[ edge.target ],
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
