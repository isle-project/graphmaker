const { createSVGWindow } = require( 'svgdom' );
const { SVG, registerWindow, G } = require( '@svgdotjs/svg.js' );
const debug = require( 'debug' )( 'graphmaker:svg' );
const isArray = require( '@stdlib/assert-is-array' );
const { circle, diamond, line, ellipse, rectangle, square, triangle, arrowhead, text, rotatedText, bezier } = require( './svg-elements.js' );
const projectStyle = require( './project-style.js' );
const DEFAULT_CONFIG = require( './../default-config.json' );
const latexSvgScaled = require( './../latex-to-svg.js' );
const { DEGREES_TO_RADIANS, ZERO_TOLERANCE, SQRT_2 } = require( './../constants.js' );
const { directionalHistogram, selfLoopDirections } = require( './../node-positions.js' );

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
function shapeBoundary( [sourceX, sourceY], [targetX, targetY], node, arrow, baseSize ) {
    const height = node.nodeSize * baseSize;
    const width = height * (node.nodeWidthToHeight || 1);
    switch ( node.nodeShape ) {
        case 'circle':
            return circleBoundary( [sourceX, sourceY], [targetX, targetY], width, arrow );
        case 'square':
            return rectangleBoundary( [sourceX, sourceY], [targetX, targetY], width, height, arrow );
        case 'rectangle':
            return rectangleBoundary( [sourceX, sourceY], [targetX, targetY], width, height, arrow );
        case 'ellipse':
            return ellipseBoundary( [sourceX, sourceY], [targetX, targetY], width, height, arrow );
        case 'diamond':
            return diamondBoundary( [sourceX, sourceY], [targetX, targetY], width, height, arrow );
        case 'triangle':
            return triangleBoundary( [sourceX, sourceY], [targetX, targetY], width, baseSize/2 * node.nodeSize, arrow );
        default:
            throw new Error( `Unrecognized node shape: ${node.nodeShape}` );
    }
}

/**
 * Returns (x,y) coordinates of the point on the source node / circle boundary intersecting with the line from the source to the target.
 *
 * @param {[number, number]} sourcePos - (x,y) coordinates of the source node
 * @param {[number, number]} targetPos - (x,y) coordinates of the target node
 * @param {number} diameter - diameter of the circle
 * @param {Object} arrow - arrowhead object for the edge
 * @returns {[number,number]} (x,y) coordinates of the point where the circle boundary intersects with the given line
 */
function circleBoundary( [sourceX, sourceY], [targetX, targetY], diameter, arrow ) {
    const totalLength = Math.sqrt((targetX - sourceX)**2 + (targetY - sourceY)**2 );
    const radius = diameter / 2;
    const arrowSize = arrow ? arrow.attr('markerHeight') : 0;
    const excludeProp = (radius + arrowSize)/totalLength;
    const deltaX = targetX - sourceX;
    const deltaY = targetY - sourceY;
    return [ sourceX + excludeProp * deltaX, sourceY + excludeProp * deltaY ];
}

/**
 * Returns (x,y) coordinates of the point on the source node / rectangle boundary intersecting with the line from the source to the target.
 *
 * @param {[number, number]} sourcePos - (x,y) coordinates of the source node
 * @param {[number, number]} targetPos - (x,y) coordinates of the target node
 * @param {number} width - width of the rectangle
 * @param {number} height - height of the rectangle
 * @param {Object} arrow - arrowhead object for the edge
 * @returns {[number, number]} (x,y) coordinates of the point where the rectangle boundary intersects with the given line
 */
function rectangleBoundary( [sourceX, sourceY], [targetX, targetY], width, height, arrow ) {
    const totalLength = Math.sqrt((targetX - sourceX) ** 2 + (targetY - sourceY) ** 2);
    const deltaX = targetX - sourceX;
    const deltaY = targetY - sourceY;
    const neX = width / 2;
    const neY = height / 2;
    const neHalf = (deltaX * -neY + deltaY * neX) > 0;
    const seHalf = (deltaX * neY + deltaY * neX) > 0;

    let arrowShift = 0;
    if ( arrow ) {
        const arrowHeight = arrow.attr('markerHeight');
        arrowShift = arrowHeight / totalLength;
    }
    let boundary;   // ATTN: sign of t in left and bottom cases
    if ( neHalf && seHalf ) {   // Top edge
        boundary = [ sourceX + neY * deltaX / deltaY, sourceY + neY];
    } else if ( neHalf )  {     // Left edge
        boundary = [ sourceX - neX, sourceY - neX * deltaY / deltaX ];
    } else if ( seHalf )  {     // Right edge
        boundary = [ sourceX + neX, sourceY + neX * deltaY / deltaX ];
    } else {                    // Bottom edge
        boundary = [ sourceX - neY * deltaX / deltaY, sourceY - neY ];
    }
    return arrow ? [ boundary[0] + arrowShift * deltaX, boundary[1] + arrowShift * deltaY ] : boundary;
}

/**
 * Returns (x,y) coordinates of the point on the source node / ellipse boundary intersecting with the line from the source to the target.
 *
 * ## Notes
 *
 * -   This implementation assumes that the source point is at the center of the ellipse
 *
 * @param {[number, number]} sourcePos - (x,y) coordinates of the source node
 * @param {[number, number]} targetPos - (x,y) coordinates of the target node
 * @param {number} width - width of the ellipse
 * @param {number} height - height of the ellipse
 * @param {Object} arrow - arrowhead object for the edge
 * @returns {[number, number]} (x,y) coordinates of the point where the ellipse boundary intersects with the given line
 */
function ellipseBoundary([sourceX, sourceY], [targetX, targetY], width, height, arrow) {
    // Calculate the angle between the source and the target
    const angle = Math.atan2(targetY - sourceY, targetX - sourceX);

    // Calculate the semi-major and semi-minor axes of the ellipse
    const a = width / 2;
    const b = height / 2;

    // Calculate the coordinates of the point on the ellipse boundary
    const boundaryX = sourceX + a * Math.cos(angle);
    const boundaryY = sourceY + b * Math.sin(angle);

    // Adjust for arrow
    if (arrow) {
        const arrowSize = arrow.attr('markerHeight');
        const totalLength = Math.sqrt((targetX - sourceX) ** 2 + (targetY - sourceY) ** 2);
        const arrowShift = arrowSize / totalLength;
        const deltaX = targetX - sourceX;
        const deltaY = targetY - sourceY;
        return [boundaryX + arrowShift * deltaX, boundaryY + arrowShift * deltaY];
    }
    return [boundaryX, boundaryY];
}

/**
 * Returns (x,y) coordinates of the point on the source node / diamond boundary intersecting with the line from the source to the target.
 *
 * ## Notes
 *
 * -   This implementation assumes that the source point is at the center of the diamond
 *
 * @param {[number, number]} sourcePos - (x,y) coordinates of the source node
 * @param {[number, number]} targetPos - (x,y) coordinates of the target node
 * @param {number} width - width of the diamond
 * @param {number} height - height of the diamond
 * @param {Object} arrow - arrowhead object for the edge
 * @returns {[number, number]} (x,y) coordinates of the point where the diamond boundary intersects with the given line
 */
function diamondBoundary( [sourceX, sourceY], [targetX, targetY], width, height, arrow ) {
    const lines = [
        {x1: sourceX, y1: sourceY - height / 2, x2: sourceX + width / 2, y2: sourceY},
        {x1: sourceX + width / 2, y1: sourceY, x2: sourceX, y2: sourceY + height / 2},
        {x1: sourceX, y1: sourceY + height / 2, x2: sourceX - width / 2, y2: sourceY},
        {x1: sourceX - width / 2, y1: sourceY, x2: sourceX, y2: sourceY - height / 2}
    ];

    // Define the line from the source to the target:
    const line = {x1: sourceX, y1: sourceY, x2: targetX, y2: targetY};

    // Compute intersection points and keep the valid ones:
    const intersections = lines.map(l => computeIntersection(l, line)).filter(p => isPointInSegment(p, line));

    // Choose the intersection point which is closest to the source:
    const boundary = intersections.reduce((p1, p2) =>
        distance(sourceX, sourceY, p1.x, p1.y) < distance(sourceX, sourceY, p2.x, p2.y) ? p1 : p2
    );

    // Adjust for arrow:
    if (arrow) {
        const arrowSize = arrow.attr('markerHeight');
        const arrowShift = arrowSize / Math.sqrt((targetX - sourceX)**2 + (targetY - sourceY)**2);
        const deltaX = targetX - sourceX;
        const deltaY = targetY - sourceY;
        return [boundary.x + arrowShift * deltaX, boundary.y + arrowShift * deltaY];
    }
    return [boundary.x, boundary.y];
}

/**
 * Computes the intersection point of two lines
 */
function computeIntersection(line1, line2) {
    const determinant = (line1.x1 - line1.x2) * (line2.y1 - line2.y2) - (line1.y1 - line1.y2) * (line2.x1 - line2.x2);
    return {
        x: ((line1.x1 * line1.y2 - line1.y1 * line1.x2) * (line2.x1 - line2.x2) - (line1.x1 - line1.x2) * (line2.x1 * line2.y2 - line2.y1 * line2.x2)) / determinant,
        y: ((line1.x1 * line1.y2 - line1.y1 * line1.x2) * (line2.y1 - line2.y2) - (line1.y1 - line1.y2) * (line2.x1 * line2.y2 - line2.y1 * line2.x2)) / determinant
    };
}

/**
 * Checks whether a point lies on a line segment.
 */
function isPointInSegment({x, y}, {x1, y1, x2, y2}) {
    const crossProduct = (y - y1) * (x2 - x1) - (x - x1) * (y2 - y1);
    if (Math.abs(crossProduct) > 0.0001) {
        return false;
    }
    const dotProduct = (x - x1) * (x2 - x1) + (y - y1)*(y2 - y1);
    if (dotProduct < 0) {
        return false;
    }
    const squaredLength = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
    return dotProduct <= squaredLength;
}

/**
 * Computes the Euclidean distance between two points.
 */
function distance(x1, y1, x2, y2) {
    return Math.sqrt((x2 - x1)**2 + (y2 - y1)**2);
}

/**
 * Returns (x,y) coordinates of the point on the source node / triangle boundary along the line from the source to the target.
 *
 * ## Notes
 *
 * -   This implementation assumes an isosceles triangle with the base at the bottom and the point at the top.
 * -   The source point is assumed to be at "center of mass" or "centroid" of the triangle
 *
 * @param {[number, number]} sourcePos - (x,y) coordinates of the source node
 * @param {[number, number]} targetPos - (x,y) coordinates of the target node
 * @param {number} width - width of the triangle
 * @param {number} r - radius of the circle circumscribing the triangle
 * @param {Object} arrow - arrowhead object for the edge
 * @returns {[number, number]} (x,y) coordinates of the point on the source node boundary along the given line
 */
function triangleBoundary( [sourceX, sourceY], [targetX, targetY], baseWidth, r, arrow ) {
    // Define the vertices of the triangle:
    const halfSideLength = baseWidth / 2;
    const trianglePoints = [
        {x: sourceX, y: sourceY - r}, // Top vertex
        {x: sourceX + halfSideLength, y: sourceY + r / 2}, // Bottom right vertex
        {x: sourceX - halfSideLength, y: sourceY + r / 2} // Bottom left vertex
    ];

    // Define the sides of the triangle:
    const triangleSides = [
        {x1: trianglePoints[0].x, y1: trianglePoints[0].y, x2: trianglePoints[1].x, y2: trianglePoints[1].y}, // Right
        {x1: trianglePoints[0].x, y1: trianglePoints[0].y, x2: trianglePoints[2].x, y2: trianglePoints[2].y}, // Left
        {x1: trianglePoints[1].x, y1: trianglePoints[1].y, x2: trianglePoints[2].x, y2: trianglePoints[2].y} // Bottom
    ];

    // Define the line from the source to the target:
    const line = {x1: sourceX, y1: sourceY, x2: targetX, y2: targetY};

    // Find the intersection point that is closest to the target:
    let minDistance = Infinity;
    let boundary = null;
    for (const side of triangleSides) {
        const intersection = computeIntersection(line, side);
        if (isPointInSegment(intersection, side)) {
            const dist = distance(targetX, targetY, intersection.x, intersection.y);
            if (dist < minDistance) {
                minDistance = dist;
                boundary = intersection;
            }
        }
    }

    // Adjust for arrow:
    if (arrow) {
        const arrowSize = arrow.attr('markerHeight');
        const totalLength = distance(sourceX, sourceY, targetX, targetY);
        const arrowShift = arrowSize / totalLength;
        const deltaX = targetX - sourceX;
        const deltaY = targetY - sourceY;
        return [boundary.x + arrowShift * deltaX, boundary.y + arrowShift * deltaY];
    }
    return [boundary.x, boundary.y];
}


function rotate2d( unitDx, unitDy, angle ) {
    const horizL = Math.cos( angle * DEGREES_TO_RADIANS );
    const vertL= Math.sin( angle * DEGREES_TO_RADIANS );
    return [ horizL * unitDx - vertL * unitDy, vertL * unitDx + horizL * unitDy ];
}

/* NOTE: source and target positions cannot be equal */
function edgeCurveExtent( [sourceX, sourceY], [targetX, targetY], arrow, excludeSize, { angleLeaving, angleEntering, softnessEntering = 0.5, softnessLeaving = 0.5 }) {
    let dx = targetX - sourceX;
    let dy = targetY - sourceY;
    const norm = Math.sqrt( dx*dx + dy*dy );
    dx = dx/norm;
    dy = dy/norm;

    const [ux, uy] = rotate2d( dx, dy, angleLeaving );
    const [vx, vy] = rotate2d( -dx, -dy, -angleEntering );

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
        LABEL_OFFSET_FACTOR * hSize * node.nodeSize * offsetVector[0],
        LABEL_OFFSET_FACTOR * hSize * node.nodeSize * offsetVector[1]
    ];
}

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

async function drawMathLingoLabel( label, x, y, style ) {
    // TODO: Add support for MathLingo
}

const LABEL_HANDLERS = {
    'latex': drawLaTeXLabel,
    'tex': drawLaTeXLabel,
    'math': drawMathLingoLabel
};
const HANDLER_REGEXP = new RegExp( `^(${Object.keys(LABEL_HANDLERS).join('|')}):\\s*(.*)$` );

/**
 * Draws a node label at the given position.
 *
 * @param {Object} node - node object
 * @param {[number,number]} position - (x,y) coordinates of the node
 * @param {Object} canvas - SVG canvas
 * @param {string} key - node key
 * @param {number} hSize - horizontal size of the node
 * @param {number} vSize - vertical size of the node
 * @param {boolean} isDraft - whether the node is a draft
 */
async function drawNodeLabel({ node, position, canvas, key, hSize, vSize, isDraft }) {
    const [ offsetX, offsetY ] = calculateOffsets({ node, hSize, vSize, canvas });
    const posX = position[0] + offsetX;
    const posY = position[1] + offsetY;
    const labelStyle = {
        ...defaultNodeStyle,
        ...node,
    };
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
    } else if ( isDraft ) {
        text( posX, posY, 0, 0, key, { ...labelStyle, ...draftNodeStyle }).addTo( canvas );
    }
}

async function drawNode({ node, position, canvas, baseSize, key, isDraft }) {
    debug( 'About to Project Style' );
    const myStyles = projectStyle( node, node.nodeShape );

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
        default:
            throw new Error( `Unrecognized node shape: ${shape}` );
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

function findBezierEdgeMidpoint( x0, y0, x1, y1, cx0, cy0, cx1, cy1 ) {
    return [ (x0 + 3 * cx0 + 3 * cx1 + x1) / 8, (y0 + 3 * cy0 + 3 * cy1 + y1) / 8 ];
}

const edgeBaseOffset = 12;

function drawEdgeTextAtMidpoint({ edge, midpoint, tangent, text, drawAbove, canvas, nodeDistance, extraOffset = [0, 0] }) {
    let angle = Math.atan2( tangent[1], tangent[0] ) / DEGREES_TO_RADIANS;
    const offsetVector = calculateOffsetVector( extraOffset );
    let flip = 1;
    if ( tangent[0] < 0 ) {
        angle = ( angle + 180 ) % 360;
        flip = -1;
    }
    const [dx, dy] = positiveHalfSpace( tangent );
    const perp = (drawAbove ? -1 : 1) * edgeBaseOffset;
    const offsetH = [ flip * 0.5 * nodeDistance * offsetVector[0] * dy, -flip * 0.5 * nodeDistance * offsetVector[0] * dx ];  // [-dy, dx] is normalized tangent
    const offsetV = [ flip * (perp + 0.5 * nodeDistance * offsetVector[1]) * dx, flip * (perp + 0.5 * nodeDistance * offsetVector[1]) * dy ];
    const textElem = rotatedText( midpoint[0] + offsetH[0] + offsetV[0], midpoint[1] + offsetH[1] + offsetV[1], text, angle, edge );
    textElem.addTo( canvas );
}


/**
 *
 */
function positiveHalfSpace( [a, b] ) {
    const norm = Math.sqrt( a * a + b * b );
    return [ -b/norm, a/norm ];
}

function drawLinearEdge( { sourcePos, targetPos, edge, key, baseSize, source, target, arrow, canvas, isDraft } ) {
    const myStyles = projectStyle( edge, 'line' );
    const [x0, y0] = shapeBoundary( sourcePos, targetPos, source, null, baseSize );
    const [x1, y1] = shapeBoundary( targetPos, sourcePos, target, arrow, baseSize );
    const lineElem = line( x0, y0, x1, y1, myStyles );
    lineElem.addTo( canvas );
    if ( arrow ) {
        arrow.addTo( canvas );
        lineElem.marker( 'end', arrow );
    }
    if ( isDraft || edge.label || edge.weight !== void 0 ) {
        const midpoint = findLinearEdgeMidpoint( sourcePos, targetPos );
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

function drawBezierEdge( { sourcePos, targetPos, edge, key, baseSize, source, target, arrow, canvas, isDraft } ) {
    const [ x0, y0, x1, y1, cx0, cy0, cx1, cy1 ] = edgeCurveExtent( sourcePos, targetPos, arrow, baseSize, edge );
    const myStyles = projectStyle( edge, 'line' );
    const curveElem = bezier( x0, y0, cx0, cy0, cx1, cy1, x1, y1, myStyles );
    curveElem.addTo( canvas );
    if ( arrow ) {
        arrow.addTo( canvas );
        curveElem.marker( 'end', arrow );
    }
    if ( isDraft || edge.label || edge.weight !== void 0 ) {
        const midpoint = findBezierEdgeMidpoint( x0, y0, x1, y1, cx0, cy0, cx1, cy1 );
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

const DEFAULT_LOOP_ANGLE = 25;
const DEFAULT_LOOP_UNIT = [ 1, 0 ];

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
    const [x0, y0] = shapeBoundary( [x, y], [x + Math.cos(offsetAngleUp) * 10 * baseSize, y - Math.sin(offsetAngleUp) * 10 * baseSize], source, null, baseSize );
    const [x1, y1] = shapeBoundary( [x, y], [x + Math.cos(offsetAngleDown) * 10 * baseSize, y - Math.sin(offsetAngleDown) * 10 * baseSize], source, arrow, baseSize );
    const [ ux, uy ] = rotate2d( DEFAULT_LOOP_UNIT[0], DEFAULT_LOOP_UNIT[1], -(angleLeaving || DEFAULT_LOOP_ANGLE ) - directionAngle );   // ATTN: 0 forbidden?
    const [ vx, vy ] = rotate2d( DEFAULT_LOOP_UNIT[0], DEFAULT_LOOP_UNIT[1], (angleEntering || DEFAULT_LOOP_ANGLE ) - directionAngle );
    const cx0 = x0 + softnessLeaving * 3 * size * ux;
    const cy0 = y0 + softnessLeaving * 3 * size * uy;
    const cx1 = x1 + softnessEntering * 3 * size * vx;
    const cy1 = y1 + softnessEntering * 3 * size* vy;
    const myStyles = projectStyle( edge, 'line' );
    const curveElem = bezier( x0, y0, cx0, cy0, cx1, cy1, x1, y1, myStyles );
    curveElem.addTo( canvas );
    if ( arrow ) {
        arrow.addTo( canvas );
        curveElem.marker( 'end', arrow );
    }
    if ( isDraft || edge.label || edge.weight !== void 0 ) {
        const midpoint = findBezierEdgeMidpoint( x0, y0, x1, y1, cx0, cy0, cx1, cy1 );
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
    const decorations = graph.decorations || [];
    for ( let i = 0; i < decorations.length; ++i ) {
        const decoration = decorations[ i ];
        const x = decoration.x * width;
        const y = ( 1.0 - decoration.y ) * height;
        switch ( decoration.type ) {
            case 'text':
                text( x, y, 0, 0, decoration.text, decoration ).addTo( canvas );
                break;
            case 'region':
                rectangle( x, y, decoration.region[0] * width, decoration.region[1] * height, decoration ).addTo( canvas );
                break;
            default:
                throw new Error( `Unrecognized decoration type: ${decoration.type}` );
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
    const adjacency = graph.adjacency;
    const adjacencyKeys = Object.keys( adjacency );
    const useArrow = graph.directed;
    const edgesSeen = new Set();
    const DIRECTIONAL_BINWIDTH = 10;  // Ensure that this divides 360 for edge case below
    for ( let i = 0; i < adjacencyKeys.length; ++i ) {
        const source = adjacencyKeys[ i ];
        const sourceIndex = nodeKeys.indexOf( source );
        const nSelfLoops = adjacency[source].filter( ({targetNode}) => targetNode === source ).length;
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
        for ( let { targetNode, edge } of adjacency[source] ) {
            if ( edge === void 0 || edge === '' ) {
                edge = source + targetNode;
            }
            if ( edgesSeen.has( edge ) ) {
                continue;
            }
            edgesSeen.add( edge );
            const edgeObject = edges[edge] || {};
            const targetIndex = nodeKeys.indexOf( targetNode );
            const sourcePos = positions[ sourceIndex ];
            const targetPos = positions[ targetIndex ];
            if ( !edgeObject.fillColor && edgeObject?.lineColor ) {
                edgeObject.fillColor = edgeObject.lineColor;
            }
            let arrow = null;
            if ( useArrow ) {
                arrow = arrowhead( 8, 8, edgeObject );
            }
            if ( targetNode === source ) { // Case: Self Loop
                drawSelfLoopEdge({
                    pos: sourcePos,
                    edge: edgeObject,
                    key: edge,
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
                    key: edge,
                    baseSize: baseSize,
                    source: nodes[ source ],
                    target: nodes[ targetNode ],
                    arrow,
                    canvas,
                    isDraft
                });
            } else {
                drawBezierEdge({
                    sourcePos,
                    targetPos,
                    edge: edgeObject,
                    key: edge,
                    baseSize: baseSize,
                    source: nodes[ source ],
                    target: nodes[ targetNode ],
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
