const isArray = require( '@stdlib/assert-is-array' );
const { DEGREES_TO_RADIANS, RADIANS_TO_DEGREES, SQRT_2, CoordinateSystem } = require( './constants.js' );

// Geometric Utilities

/**
 * Computes the intersection point of two lines
 *
 * @param {Object} line1 - Specifies one line by coordinates of two points
 *     with numeric props { x1, y1, x2, y2 }
 * @param {Object} line2 - Specifies another line by coordinates of two points
 *     with numeric props { x1, y1, x2, y2 }
 * @returns {Object|null} {x: number, y:number} - the coordinates of the intersection
 *     of the two lines, if it exists, else null.
 */
function computeIntersection(line1, line2) {
    const determinant = (line1.x1 - line1.x2) * (line2.y1 - line2.y2) - (line1.y1 - line1.y2) * (line2.x1 - line2.x2);
    if (determinant === 0) {
        return null;
    }
    return {
        x: ((line1.x1 * line1.y2 - line1.y1 * line1.x2) * (line2.x1 - line2.x2) - (line1.x1 - line1.x2) * (line2.x1 * line2.y2 - line2.y1 * line2.x2)) / determinant,
        y: ((line1.x1 * line1.y2 - line1.y1 * line1.x2) * (line2.y1 - line2.y2) - (line1.y1 - line1.y2) * (line2.x1 * line2.y2 - line2.y1 * line2.x2)) / determinant
    };
}

/**
 * Checks whether a point lies on a line segment.
 *
 * @param {Object} (x,y) - point to check
 * @param {Object} line - line segment defined by { x1, y1, x2, y2 }
 * @returns {boolean} true if the point lies on the line segment, false otherwise
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
 *
 * @param {number} x1 - x-coordinate of the first point
 * @param {number} y1 - y-coordinate of the first point
 * @param {number} x2 - x-coordinate of the second point
 * @param {number} y2 - y-coordinate of the second point
 * @returns {number} Euclidean distance between the two points
 */
function euclideanDistance(x1, y1, x2, y2) {
    return Math.sqrt((x2 - x1)**2 + (y2 - y1)**2);
}

// Intersections of Line with Shape Boundary

/**
 * Returns (x,y) coordinates of the point on the source node / circle boundary intersecting with the line from the source to the target.
 *
 * @param {[number, number]} sourcePos - (x,y) coordinates of the source node
 * @param {[number, number]} targetPos - (x,y) coordinates of the target node
 * @param {number} diameter - diameter of the circle
 * @param {number} arrowSize - size of the arrowhead
 * @returns {[number,number]} (x,y) coordinates of the point where the circle boundary intersects with the given line
 */
function circleBoundary( [sourceX, sourceY], [targetX, targetY], diameter, arrowSize ) {
    const totalLength = Math.sqrt((targetX - sourceX)**2 + (targetY - sourceY)**2 );
    const radius = diameter / 2;
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
 * @param {number} arrowSize - size of the arrowhead
 * @returns {[number, number]} (x,y) coordinates of the point where the rectangle boundary intersects with the given line
 */
function rectangleBoundary( [sourceX, sourceY], [targetX, targetY], width, height, arrowSize ) {
    const totalLength = Math.sqrt((targetX - sourceX) ** 2 + (targetY - sourceY) ** 2);
    const deltaX = targetX - sourceX;
    const deltaY = targetY - sourceY;
    const neX = width / 2;
    const neY = height / 2;
    const neHalf = (deltaX * -neY + deltaY * neX) > 0;
    const seHalf = (deltaX * neY + deltaY * neX) > 0;

    let arrowShift = 0;
    if ( arrowSize > 0 ) {
        arrowShift = arrowSize / totalLength;
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
    return arrowSize > 0 ? [ boundary[0] + arrowShift * deltaX, boundary[1] + arrowShift * deltaY ] : boundary;
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
 * @param {number} arrowSize - size of the arrowhead
 * @returns {[number, number]} (x,y) coordinates of the point where the ellipse boundary intersects with the given line
 */
function ellipseBoundary([sourceX, sourceY], [targetX, targetY], width, height, arrowSize ) {
    // Calculate the semi-major and semi-minor axes of the ellipse:
    const a = width / 2;
    const b = height / 2;

    // Calculate the coordinates of the point on the ellipse boundary:
    // Line from (x,y) of the form      c -> (x + c dx, y + c dy)
    // Ellipse around (x,y) of the form t -> (x + a cos t, y + b sin t)
    // Find t (and c) such that
    // x + a cos t = x + c dx
    // y + b sin t = y + c dy
    // => tan t = (c dx / a) / (c dy / b) = b dx / (a dy)
    // => t = arctan2( b dx, a dy )
    const t = Math.atan2( a * (targetY - sourceY), b * (targetX - sourceX) );
    const boundaryX = sourceX + a * Math.cos(t);
    const boundaryY = sourceY + b * Math.sin(t);

    // Adjust for arrowhead if it exists:
    if (arrowSize > 0 ) {
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
 * -   This implementation assumes that the source point is at the center of the diamond
 *
 * @param {[number, number]} sourcePos - (x,y) coordinates of the source node
 * @param {[number, number]} targetPos - (x,y) coordinates of the target node
 * @param {number} width - width of the diamond
 * @param {number} height - height of the diamond
 * @param {number} arrowSize - size of the arrowhead
 * @returns {[number, number]|null} (x,y) coordinates of the point where the diamond boundary intersects with the given line,
 *     or null if there are no intersections (which cannot happen under the stated assumptions).
 */
function diamondBoundary( [sourceX, sourceY], [targetX, targetY], width, height, arrowSize ) {
    const lines = [
        {x1: sourceX, y1: sourceY - height / 2, x2: sourceX + width / 2, y2: sourceY},
        {x1: sourceX + width / 2, y1: sourceY, x2: sourceX, y2: sourceY + height / 2},
        {x1: sourceX, y1: sourceY + height / 2, x2: sourceX - width / 2, y2: sourceY},
        {x1: sourceX - width / 2, y1: sourceY, x2: sourceX, y2: sourceY - height / 2}
    ];

    // Define the line from the source to the target:
    const line = {x1: sourceX, y1: sourceY, x2: targetX, y2: targetY};

    // Compute intersection points and keep the valid ones:
    const intersections = lines.map(l => computeIntersection(l, line)).filter(p => p && isPointInSegment(p, line));
    if ( intersections.length === 0 ) {
        // Case: no intersections found; cannot happen under assumed conditions (source at center of node)
        return null;
    }

    // Choose the intersection point which is closest to the source:
    const boundary = intersections.reduce((p1, p2) =>
        euclideanDistance(sourceX, sourceY, p1.x, p1.y) < euclideanDistance(sourceX, sourceY, p2.x, p2.y) ? p1 : p2
    );

    // Adjust for arrow:
    if (arrowSize > 0 ) {
        const arrowShift = arrowSize / Math.sqrt((targetX - sourceX)**2 + (targetY - sourceY)**2);
        const deltaX = targetX - sourceX;
        const deltaY = targetY - sourceY;
        return [boundary.x + arrowShift * deltaX, boundary.y + arrowShift * deltaY];
    }
    return [boundary.x, boundary.y];
}

/**
 * Returns (x,y) coordinates of the point on the source node / triangle boundary along the line from the source to the target.
 *
 * ## Notes
 * -   This implementation assumes an isosceles triangle with the base at the bottom and the point at the top.
 * -   The source point is assumed to be at "center of mass" or "centroid" of the triangle
 *
 * @param {[number, number]} sourcePos - (x,y) coordinates of the source node
 * @param {[number, number]} targetPos - (x,y) coordinates of the target node
 * @param {number} width - width of the triangle
 * @param {number} r - radius of the circle circumscribing the triangle
 * @param {number} arrowSize - size of the arrowhead
 * @returns {[number, number]|null} (x,y) coordinates of the point on the source node boundary along the given line,
 *     or null if there is no intersection.
 */
function triangleBoundary( [sourceX, sourceY], [targetX, targetY], baseWidth, r, arrowSize ) {
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
        if ( intersection && isPointInSegment(intersection, side)) {
            const dist = euclideanDistance(targetX, targetY, intersection.x, intersection.y);
            if (dist < minDistance) {
                minDistance = dist;
                boundary = intersection;
            }
        }
    }
    if ( boundary === null ) {
        return null;
    }

    // Adjust for arrow:
    if ( arrowSize > 0 ) {
        const totalLength = euclideanDistance(sourceX, sourceY, targetX, targetY);
        const arrowShift = arrowSize / totalLength;
        const deltaX = targetX - sourceX;
        const deltaY = targetY - sourceY;
        return [boundary.x + arrowShift * deltaX, boundary.y + arrowShift * deltaY];
    }
    return [boundary.x, boundary.y];
}


// Rotation and Directional Calculations

/**
 * Computes the unit vector giving the positive half-space direction of a one-dimensional subspace
 * This direction is "positive" in the sense of the right-hand rule.
 *
 * @param {[number, number]} a_b - a 2D vector specifying a line (as a 1D subspace)
 * @returns {[number, number]} a 2D *unit* vector giving the positive half-space direction
 */
function positiveHalfSpace( [a, b] ) {
    const norm = Math.sqrt( a * a + b * b );
    return [ -b/norm, a/norm ];
}

/**
 * Rotates a 2D vector counter-clockwise by a given angle.
 *
 * @param {number} dx - x-component of the vector
 * @param {number} dy - y-component of the vector
 * @param {number} angle - angle in degrees of the desired counter-clockwise rotation
 * @returns {[number, number]} rotated vector
 */
function rotate2d( dx, dy, angle ) {
    const horizL = Math.cos( angle * DEGREES_TO_RADIANS );
    const vertL= Math.sin( angle * DEGREES_TO_RADIANS );
    return [ horizL * dx - vertL * dy, vertL * dx + horizL * dy ];
}

/**
 * Returns a polar vector from source to target.
 *
 * @param {[number, number]} sourcePos - [x, y] coordinates of source node
 * @param {[number, number]} targetPos - [x, y] coordinates of target node
 * @returns { Object }  { direction, unit } where direction is the angle (in degrees from positive-x) from
 *     from source to target and unit is *half* the distance between source and target.
 */
function polarVector( sourcePos, targetPos ) {
    const unit = 0.5 * Math.sqrt( (targetPos[0] - sourcePos[0])**2 + (targetPos[1] - sourcePos[1])**2 );
    const direction = Math.atan2( targetPos[1] - sourcePos[1], targetPos[0] - sourcePos[0] ) * RADIANS_TO_DEGREES;
    return { direction, unit };
}


// Edge Geometry

/**
 * Returns the midpoint of a line segment between two 2D points
 *
 * @param {[number, number]} x0_y0 - one endpoint of the line segment
 * @param {[number, number]} x1_y1 - another endpoint of the line segment
 * @returns {[number, number]} - a 2D vector representing the segment midpoint
 */
function lineSegmentMidpoint( [x0, y0], [x1, y1] ) {
    return [ (x0 + x1) / 2, (y0 + y1) / 2 ];
}

/**
 * Returns the midpoint of a 2D cubic Bezier curve from endpoints and control points.
 *
 * Let c0, c1, c2, c3  be the control points of the cubic Bezier curve, with c0, c3 being the endpoints
 * Let   m0 = (c0 + c1)/2
 *       m1 = (c1 + c2)/2
 *       m2 = (c2 + c3)/2
 *       m3 = (m0 + m1)/2
 *       m4 = (m1 + m2)/2
 *       m5 = (m3 + m4)/2
 * Then, m5 is the midpoint of the Bezier curve.
 * Expanding
 *   m5 = h ( h m0 + h m1 + h m1 + h m2) = q m0 + h m1 + q m2
 *      = q h c0 + q h c1 + h h c1 + h h c2 + q h c2 + q h c3
 *      = e c0 + e c1 + q c1 + q c2 + e c2 + e c3
 *      = e c0 + 3 e c1 + 3 e c2 + e c3
 *  We have midpoint = c0 / 8 + 3 c1 / 8 + 3 c2 / 8 + c3 /8
 *
 * Tangent direction at midpoint is  m4 - m3 suitably normalized
 * m4 - m3 = h m1 + h m2 - h m0 - h m 1 = h (m2 - m0)
 *         = q c3 + q c2 - q c1 - q c0
 *
 * @param {number} x0 - starting point x-coordinate
 * @param {number} y0 - starting point y-coordinate
 * @param {number} x1 - endpoint x-coordinate
 * @param {number} y1 - endpoint y-coordinate
 * @param {number} cx0 - first control point x-coordinate
 * @param {number} cy0 - first control point y-coordinate
 * @param {number} cx1 - second control point x-coordinate
 * @param {number} cy1 - second control point y-coordinate
 * @returns {[number, number]} - 2D vector giving midpoint coordinates
 *
 */
function bezierCurveMidpoint( x0, y0, x1, y1, cx0, cy0, cx1, cy1 ) {
    return [ (x0 + 3 * cx0 + 3 * cx1 + x1) / 8, (y0 + 3 * cy0 + 3 * cy1 + y1) / 8 ];
}

/**
 * Calculates an offset vector given an offset specification.
 *
 * ## Notes
 *
 * The offset specification can be in various formats:
 *
 * -   'none': no offset
 * -   A cardinal direction: 'north', 'east', 'south', 'west', etc.
 * -   An array of two numbers representing cartesian coordinates: [x, y]
 * -   An array representing a polar coordinate: ['polar', angle, distance]
 * -   An array specifying a cardinal direction and a distance: ['north', distance]
 *
 * @param {(string|[string,number]|[string,number,number]|[number,number])} offsetSpec - offset specification
 * @param {[CoordinateSystem=LEFT_HANDED]} coordinateSystem - indicates whether a left-handed (y increases downward) or
 *     right-handed (y increases upward) coordinate system is to be used for calculating offsets
 * @returns {[number, number]} offset vector
 * @throws will throw an error if the provided offset specification is not recognized
 */
function calculateOffsetVector( offsetSpec = [ 0, 0 ], coordinateSystem = CoordinateSystem.LEFT_HANDED ) {
    const isOffsetArray = isArray( offsetSpec );
    const yReflection = coordinateSystem === CoordinateSystem.LEFT_HANDED ? 1 : -1;
    if ( !offsetSpec || offsetSpec === 'none' ) {
        return [0, 0];
    }

    if ( isOffsetArray && offsetSpec.length === 2 && typeof offsetSpec[0] === 'number' ) {
        // Case: absolute offset vector
        return [ offsetSpec[0], -yReflection * offsetSpec[1] ]; // Negative for left-handed graphics coord system
    }

    if ( isOffsetArray && offsetSpec.length === 3 ) {
        // Case: polar offset
        const angle = offsetSpec[1] * DEGREES_TO_RADIANS;
        return [ offsetSpec[2] * Math.cos( angle ), -yReflection * offsetSpec[2] * Math.sin( angle ) ]; // Left-handed coordinate system
    }

    const dir = isOffsetArray ? offsetSpec[0] : offsetSpec;
    const r = isOffsetArray ? offsetSpec[1] : 1.0;
    switch ( dir ) {
        case 'north':
        case 'up':
            return [0, -yReflection * r];
        case 'south':
        case 'down':
            return [0, yReflection * r];
        case 'east':
        case 'right':
            return [r, 0];
        case 'west':
        case 'left':
            return [-r, 0];
        case 'northeast':
        case 'upper-right':
            return [ r * SQRT_2, -yReflection * r * SQRT_2 ];
        case 'southeast':
        case 'lower-right':
            return [ r * SQRT_2, yReflection * r * SQRT_2 ];
        case 'northwest':
        case 'upper-left':
            return [ -r * SQRT_2, -yReflection * r * SQRT_2 ];
        case 'southwest':
        case 'lower-left':
            return [ -r * SQRT_2, yReflection * r * SQRT_2 ];
        default:
            throw new Error( `Invalid label offset direction: ${dir}` );
    }
}

module.exports = {
    circleBoundary,
    ellipseBoundary,
    diamondBoundary,
    rectangleBoundary,
    triangleBoundary,
    positiveHalfSpace,
    rotate2d,
    polarVector,
    lineSegmentMidpoint,
    bezierCurveMidpoint,
    calculateOffsetVector
};
