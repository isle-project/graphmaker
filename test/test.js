const { initializeGraph, updateGraph, redo, resetGraph, undo, save, task } = require( './../lib/index.js' );

jest.setTimeout( 20000 );

async function testSequence( tasks, expected ) {
    let graphState = initializeGraph({});
    for ( let i = 0; i < tasks.length; ++i ) {
        const [ state, output ] = await updateGraph( graphState, task( tasks[ i ] ) );
        expect( output ).toBeNull();
        if ( typeof expected[ i ] === 'function' ) {
            expect( state.graph ).toProjectTruthy( expected, i );
        } else {
            expect( state.graph ).toEqual( expected[ i ] );
        }
        graphState = state;
    }
    return graphState;
}


test( 'simple-directed-1', async () => {
    const tasks = [
        'make this graph directed',
        'add nodes A and B and an edge from A to B',
        'add a node C and an edge from C to A and from C to B',
        'add an edge from B to itself',
    ];
    const expected = [
        {
            'directed': true,
            'nodes': {},
            'edges': {},
            'adjacency': {}
        },
        ( graph ) => {
            return (
                graph.directed === true &&
                graph.nodes.A && graph.nodes.B &&
                Object.keys( graph.edges ).length === 1 &&
                graph.adjacency.A[ 0 ].targetNode === 'B' &&
                graph.edges[ graph.adjacency.A[ 0 ].edge ]
            );
        },
        ( graph ) => {
            return (
                graph.directed === true &&
                graph.nodes.A && graph.nodes.B && graph.nodes.C &&
                Object.keys( graph.edges ).length === 3 &&
                graph.adjacency.A[ 0 ].targetNode === 'B' &&
                graph.adjacency.C[ 0 ].targetNode === 'A' &&
                graph.adjacency.C[ 1 ].targetNode === 'B' &&
                graph.edges[ graph.adjacency.A[ 0 ].edge ] &&
                graph.edges[ graph.adjacency.C[ 0 ].edge ] &&
                graph.edges[ graph.adjacency.C[ 1 ].edge ] &&
                graph.adjacency.A[ 0 ].edge !== graph.adjacency.C[ 0 ].edge &&
                graph.adjacency.A[ 0 ].edge !== graph.adjacency.C[ 1 ].edge &&
                graph.adjacency.C[ 0 ].edge !== graph.adjacency.C[ 1 ].edge
            );
        },
        ( graph ) => {
            return (
                graph.directed === true &&
                graph.nodes.A && graph.nodes.B && graph.nodes.C &&
                Object.keys( graph.edges ).length === 4 &&
                graph.adjacency.B[ 0 ].targetNode === 'B' &&
                graph.edges[ graph.adjacency.A[ 0 ].edge ] &&
                graph.edges[ graph.adjacency.C[ 0 ].edge ] &&
                graph.edges[ graph.adjacency.C[ 1 ].edge ] &&
                graph.edges[ graph.adjacency.B[ 0 ].edge ] &&
                graph.adjacency.A[ 0 ].edge !== graph.adjacency.C[ 0 ].edge &&
                graph.adjacency.A[ 0 ].edge !== graph.adjacency.C[ 1 ].edge &&
                graph.adjacency.C[ 0 ].edge !== graph.adjacency.C[ 1 ].edge &&
                graph.adjacency.B[ 0 ].edge !== graph.adjacency.A[ 0 ].edge &&
                graph.adjacency.B[ 0 ].edge !== graph.adjacency.C[ 0 ].edge &&
                graph.adjacency.B[ 0 ].edge !== graph.adjacency.C[ 1 ].edge
            );
        }
    ];
    await testSequence( tasks, expected );
});

test( 'convert-undirected-1', async () => {
    const tasks = [
        'make this graph directed',
        'add nodes A and B and an edge from A to B',
        'make this graph undirected'
    ];
    const expected = [
        {
            'directed': true,
            'nodes': {},
            'edges': {},
            'adjacency': {}
        },
        ( graph ) => {
            return (
                graph.directed === true &&
                graph.nodes.A && graph.nodes.B &&
                Object.keys( graph.edges ).length === 1 &&
                graph.adjacency.A[ 0 ].targetNode === 'B' &&
                graph.edges[ graph.adjacency.A[ 0 ].edge ]
            );
        },
        ( graph ) => {
            return (
                graph.directed === false &&
                graph.nodes.A && graph.nodes.B &&
                Object.keys( graph.edges ).length === 1 &&
                graph.adjacency.A[ 0 ].targetNode === 'B' &&
                graph.adjacency.B[ 0 ].targetNode === 'A' &&
                graph.edges[ graph.adjacency.A[ 0 ].edge ] &&
                graph.edges[ graph.adjacency.B[ 0 ].edge ]
            );
        }
    ];
    await testSequence( tasks, expected );
});
