/**
 * node-positions - randomized algorithm to compute nice node positions
 *
 */


/**
 * Computes Coulomb force between two charges, numerically stable when close together.
 *
 * The charges are assumed to have the same sign and magnitude. This computes the
 * resulting repulsive force of one charge on the other, giving a vector pointing
 * in the dx, dy direction.
 *
 * If the points are too close together to get a numerically stable force,
 * the force is capped in a non-Coulomb way, to move the charges apart
 * for the next step in the simulation. This condition will usually only
 * be needed if the starting configuration of the charges happens to put
 * two close together. The simulation will not let the charges approach
 * so close otherwise.
 *
 * @param dx {number} - difference in x-coordinates of the charges
 * @param dx {number} - difference in y-coordinates of the charges
 * @param [epsilon = 2**-20] {number} - tolerance for square distance to be
 *    considered numerically close
 *
 * @returns {array} a numeric pair of the Coulomb force x and y components.
 */
const safeCoulomb = (dx, dy, epsilon = 2**-20) => {
    const rsq = dx * dx + dy * dy;
    if ( rsq > epsilon ) {
        return [dx/rsq, dy/rsq];  // The ordinary Coulomb force
    } else if ( rsq > Number.EPSILON ) {
        // Stabilize the numerically unstable force
        // just to get the two points away from each other.
        const r = Math.sqrt(rsq);
        return [dx/r, dy/r];
    }
    // Bounce away points that are numerically identical,
    // but try to send them in opposite directions.
    // If they are exactly the same, we cannot separate them.
    return [Math.sign(dx),  Math.sign(dy)];
};


/**
 * Computes node positions in a graph by electrostatic simulation.
 *
 * @param positions {Array<Array<number>>} - an array of numeric pairs,
 *     each representing the position of one node. The order is arbitrary
 *     but maintained throughout the simulation and result.
 * @param fixed {Array<Array<number>>} - an array of nodes whose positions are
 *     fixed but whose presence should influence the positions of other nodes
 * @param ambient {number} - determines the magnitude of the radial force used to
 *     keep the points in a bounded region; the larger this value the closer together
 *     the nodes will be packed.
 * @param options.max_iter {number} - maximum number of iterations in which to converge
 *     Default: 20000
 * @param options.tol      {number} - convergence tolerance on maximum force magnitude
 *     Default: 2**-20
 * @param options.anneal   {number} - factor by which the time step is shrunk
 *     Default: 0.99
 * @param options.dt       {number} - initial time step
 *     Default: 1.0
 *
 * @returns {Object} {positions: Array<Array<number>>, converged: bool, maxForce: number}
 *     where `positions` is the current configuration of points in the same format and
 *     order as the `positions` argument; `converged` indicates whether the simulation
 *     ended with a maximum force under the tolerance; and `maxForce` is the maximum
 *     force magnitude at the end of the simulation (whether converged or not).
 *
 */
const equilibrate = (positions, fixed = [], ambient = 1.0,
                     {max_iter = 20000, tol = 2**-20, anneal = 0.99, dt = 1.0} = {}) => {
    const n = positions.length;

    if ( n === 1 ) {
        // Solution known, so avoid numerical ambiguities near zero.
        return { positions: [[0, 0]], converged: true, maxForce: 0 };
    }

    let maxForce = 1e10;
    let iter = 0;
    let converged = false;

    while ( maxForce > tol && iter < max_iter ) {
        let forces = positions.map( p => {
            // Ambient radial field points towards origin and grows towards infinity
            let a = -ambient * p[0];
            let b = -ambient * p[1];

            // Fixed point Coulomb forces on this point
            for ( const q of fixed ) {
                const dx = p[0] - q[0];
                const dy = p[1] - q[1];
                const [dFx, dFy] = safeCoulomb(dx, dy);

                a += dFx;
                b += dFy;
            }
            return [a, b];
        });

        for ( let i = 0; i < n; ++i ) {
            for ( let j = 0; j < n; ++j ) {
                if ( i !== j ) {
                    const dx = positions[i][0] - positions[j][0];
                    const dy = positions[i][1] - positions[j][1];
                    const [dFx, dFy] = safeCoulomb(dx, dy);

                    forces[i][0] += dFx;
                    forces[i][1] += dFy;
                }
            }
        }

        maxForce = 0.0;
        for ( let i = 0; i < n; ++i ) {
            const mag = Math.sqrt(forces[i][0] * forces[i][0] + forces[i][1] * forces[i][1]);
            positions[i][0] += dt * forces[i][0];
            positions[i][1] += dt * forces[i][1];

            if ( mag > maxForce ) {
                maxForce = mag;
            }
        }

        dt *= anneal;
        iter += 1;
    }

    if ( iter < max_iter ) {
        converged = true;
    }

    return { positions, converged, maxForce };
};

/**
 * Computes node positions in a graph by electrostatic simulation with random initial positions.
 *
 * @param n {number} - number of nodes
 * @param fixed {Array<Array<number>>} - an array of nodes whose positions are
 *     fixed but whose presence should influence the positions of other nodes
 * @param ambient {number} - determines the magnitude of the radial force used to
 *     keep the points in a bounded region; the larger this value the closer together
 *     the nodes will be packed.
 *
 * @returns {Object} { positions: Array<Array<number>>, converged: bool, maxForce: number }
 *     as described in `equilibrate`.
 */
const nodePositions = ( n, fixed = [], ambient = 1.0 ) => {
    const positions = [];
    for ( let i = 0; i < n; ++i ) {
        const x = -2.0 + 4 * Math.random();
        const y = -2.0 + 4 * Math.random();
        positions.push([x, y]);
    }
    return equilibrate(positions, fixed, ambient);
};

module.exports = {
    equilibrate,
    nodePositions
};
