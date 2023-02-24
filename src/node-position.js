const MAX_ITER = 20000;
const ANNEAL = 0.99;

const equilibrate = ( positions, fixed = [], ambient = 1.0, dt = 1.0, epsilon = 1.0e-7 ) => {
    const n = positions.length;
    let maxForce = 1e10;
    let iter = 0;
    let converged = false;

    while ( maxForce > epsilon && iter < MAX_ITER ) {
        let forces = positions.map( p => {
            // Ambient radial field points towards origin and grows towards infinity
            let a = -ambient * p[0];
            let b = -ambient * p[1];

            // Fixed point Coulomb forces on this point
            for( const q of fixed ) {
                const dx = p[0] - q[0];
                const dy = p[1] - q[1];
                const rsq = dx * dx + dy * dy;

                a += dx/rsq;
                b += dy/rsq;
            }
            return [a, b];
        });

        for ( let i = 0; i < positions.length; ++i ) {
            for ( let j = 0; j < positions.length; ++j ) {
                if ( i !== j ) {
                    const dx = positions[i][0] - positions[j][0];
                    const dy = positions[i][1] - positions[j][1];
                    const rsq = dx * dx + dy * dy;

                    forces[i][0] += dx/rsq;
                    forces[i][1] += dy/rsq;
                }
            }
        }

        maxForce = 0.0;
        for ( let i = 0; i < positions.length; ++i ) {
            const mag = Math.sqrt(forces[i][0] * forces[i][0] + forces[i][1] * forces[i][1]);
            positions[i][0] += dt * forces[i][0];
            positions[i][1] += dt * forces[i][1];

            if ( mag > maxForce ) {
                maxForce = mag;
            }
        }

        dt *= ANNEAL;
        iter += 1;
    }
    
    if ( iter < MAX_ITER ) {
        converged = true;
    }

    return [positions, converged, maxForce];
};

const nodePositions = ( n, fixed = [] ) => {
    const positions = [];
    for ( let i = 0; i < n; ++i ) {
        const x = -2.0 + 4 * Math.random();
        const y = -2.0 + 4 * Math.random();
        positions.push([x, y]);
    }

    return equilibrate(positions, fixed);
};
