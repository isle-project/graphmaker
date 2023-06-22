const hasOwnProperty = require( '@stdlib/assert/has-own-property' );
const isPlainObject = require( '@stdlib/assert/is-plain-object' );
const isString = require( '@stdlib/assert/is-string' ).isPrimitive;
const objectKeys = require( '@stdlib/utils/keys' );
const { buildAdjacency } = require('./graph-mutations.js');

/**
 * Returns a function that generates a text summary of a graph or a graph component. The summary is tailored to the changes in the graph.
 *
 * @param {string} diffString - a JSON string representing the changes in the graph
 * @returns {Function} a function that generates a text summary of a graph or a graph component
 */
function autoSummarizer( diffString ) {
    const changes = JSON.parse( diffString );
    let changesGraphStructure = false;
    let changesNodeProps = false;
    let changesEdgeProps = false;
    let changesData = false;
    let changesDecorations = false;
    let changesConstraints = false;

    for ( const change in changes ) {
        if ( hasOwnProperty( changes, change ) ) {
            if ( /^decorations(?:\.|$)/.test(change) ) {
                changesDecorations = true;
            }
            if ( /^constraints(?:\.|$)/.test(change) ) {
                changesConstraints = true;
            }
            if (
                /^(?:nodes|edges)\..+\.data(?:\.|$)/.test(change) ||
                 (/^(?:nodes|edges)\.[^.]+$/.test(change) && changes[change].data)
               ) {
                changesData = true;
            }
            // Be clever about nodes and edges
            if ( /^(?:nodes)\.([^.]+)$/.test( change ) ) {
                changesGraphStructure = true;
            }
            if ( /^(?:nodes)\.([^.]+)\.([^.]+)/.test( change ) ) {
                changesNodeProps = true;
            }
            if ( /^(?:edges)\.([^.]+)$/.test( change ) ) {
                changesGraphStructure = true;
            }
            const edgeChangeInKey = /^(?:edges)\.([^.]+)\.([^.]+)/.exec( change );
            if ( edgeChangeInKey && (edgeChangeInKey[2] === 'source' || edgeChangeInKey[2] === 'target') ) {
                changesGraphStructure = true;
            } else if ( edgeChangeInKey ) {
                changesEdgeProps = true;
            }
        }
     }

    return ( graph ) => {
        const out = [];
        if ( changesGraphStructure ) out.push( summarizeGraph(graph) );
        if ( changesNodeProps ) out.push( summarizeNodes(graph) );
        if ( changesEdgeProps ) out.push( summarizeEdges(graph) );
        if ( changesData ) out.push( summarizeData(graph) );
        if ( changesDecorations ) out.push( summarizeDecorations(graph) );
        if ( changesConstraints ) out.push( summarizeConstraints(graph) );
        if ( out.length === 0 ) {
            return summarizeGraph(graph);
        }
        return out.join('\n');
    };
}

/**
 * Generates a text summary of a graph or a graph component.
 *
 * @param {string} format - one of 'graph', 'nodes', 'edges', 'decorations', 'constraints', or 'data'
 * @param {Object} graph - graph object
 * @returns {string} summary text
 */
function summarize( format, graph ) {
    switch ( format.toLowerCase() ) {
        case 'graph':
            return summarizeGraph( graph );
        case 'nodes':
            return summarizeNodes( graph );
        case 'edges':
            return summarizeEdges( graph );
        case 'decorations':
            return summarizeDecorations( graph );
        case 'constraints':
            return summarizeConstraints( graph );
        case 'data':
            return summarizeData( graph );
        default:
            throw new Error( 'Invalid summary format' );
    }
}

/**
 * Generates a text summary of a graph's nodes and edges.
 *
 * @param {Object} graph - graph object
 * @returns {string} summary text
 */
function summarizeGraph( graph ) {
    const nodeNames = Object.keys(graph.nodes);
    const adjacency = buildAdjacency( graph );  // Each edge appears only once here
    const out = [];
    let icon;
    const adjList = {};
    if ( graph.directed ) {
        icon = '->';
        for ( const node of nodeNames ) {
            adjList[node] = adjacency[node].map( edgeName => graph.edges[edgeName].target );
        }
    } else {
        icon = '--';
        for ( const node of nodeNames ) {
            adjList[node] = [];
        }
        // Symmetrize the adjacency list
        for ( const node of nodeNames ) {
            adjacency[node].forEach( edgeName => adjList[node].push(graph.edges[edgeName].target ) );
            for ( const edge of adjacency[node] ) {
                if ( graph.edges[edge].target !== node ) {
                    adjList[graph.edges[edge].target].push( node );
                }
            }
        }
    }
    for ( const node of nodeNames ) {
        const edges = adjList[node];
        out.push( `${node} ${icon} ${edges.join(', ')}`);
    }
    out.push( `This graph is ${graph.directed ? 'directed' : 'undirected'}.` );
    return out.join('\n');
}

/**
 * Summarizes the nodes in a graph and their properties.
 *
 * @param {Object} graph - graph object
 * @returns {string} summary text
 */
function summarizeNodes(graph) {
    const propertiesMap = {
        'label': 'label',
        'nodeSize': 'size',
        'nodeShape': 'shape',
        'fillColor': 'color',
        'fillStyle': 'fill',
        'fontFamily': 'font-family',
        'fontSize': 'font-size',
        'fontWeight': 'font-weight',
        'fontStyle': 'font-style',
        'fontVariant': 'font-variant',
        'lineWidth': 'line-width',
        'lineColor': 'line-color',
        'lineStyle': 'line-style',
        'style': 'styles'
    };
    const out = [];
    for (const nodeName in graph.nodes) {
        if ( hasOwnProperty(graph.nodes, nodeName) ) {
            const node = graph.nodes[nodeName];
            const nodeDetails = [];
            for (let property in propertiesMap) {
                if (node[property]) {
                    let propertyValue = node[property];
                    if (property === 'style' && Array.isArray(propertyValue)) {
                        propertyValue =  propertyValue.map( x => `"${x}"` ).join(',');
                        nodeDetails.push(`${propertiesMap[property]} [${propertyValue}]`);
                    }
                    else if ( isPlainObject( propertyValue ) ) {
                        nodeDetails.push(`${propertiesMap[property]} ${JSON.stringify(propertyValue)}`);
                    } else if ( isString( propertyValue ) ) {
                        nodeDetails.push(`${propertiesMap[property]} "${propertyValue}"`);
                    } else {
                        nodeDetails.push(`${propertiesMap[property]} ${propertyValue}`);
                    }
                }
            }
            out.push += `${nodeName }: ${nodeDetails.join(', ')}`;
        }
    }
    return out.join('\n');
}

/**
 * Summarizes the edges in a graph and their properties.
 *
 * @param {Object} graph - graph object
 * @returns {string} summary text
 */
function summarizeEdges(graph) {
    const propertiesMap = {
        'source': 'source',
        'target': 'target',
        'label': 'label',
        'weight': 'weight',
        'angleLeaving': 'angle-leaving',
        'angleEntering': 'angle-entering',
        'softnessLeaving': 'softness-leaving',
        'softnessEntering': 'softness-entering',
        'loopDirection': 'loop-direction',
        'arrowStyle': 'arrow-style',
        'fontFamily': 'font-family',
        'fontSize': 'font-size',
        'fontWeight': 'font-weight',
        'fontStyle': 'font-style',
        'fontVariant': 'font-variant',
        'labelAnchor': 'label-anchor',
        'lineWidth': 'line-width',
        'lineColor': 'line-color',
        'lineStyle': 'line-style',
        'style': 'styles'
    };

    const out = [];
    for ( const edgeName in graph.edges ) {
        if ( hasOwnProperty( graph.edges, edgeName) ) {
            const edge = graph.edges[edgeName];
            const edgeDetails = [];
            for ( const property in propertiesMap ) {
                if ( edge[property] ) {
                    let propertyValue = edge[property];
                    if (property === 'style' && Array.isArray(propertyValue)) {
                        propertyValue =  propertyValue.map( x => `"${x}"` ).join(',');
                        edgeDetails.push(`${propertiesMap[property]} [${propertyValue}]`);
                    }
                    else if ( isPlainObject( propertyValue ) ) {
                        edgeDetails.push(`${propertiesMap[property]} ${JSON.stringify(propertyValue)}`);
                    } else if ( isString( propertyValue ) ) {
                        edgeDetails.push(`${propertiesMap[property]} "${propertyValue}"`);
                    } else {
                        edgeDetails.push(`${propertiesMap[property]} ${propertyValue}`);
                    }
                }
            }
            out.push( `${edgeName}: ${edgeDetails.join(', ')}` );
        }
    }
    return out.join('\n');
}

/**
 * Summarizes the data in a graph.
 *
 * @param {Object} graph - graph object
 * @returns {string} summary text
 */
function summarizeData( graph ) {
    const out = [];
    let anyNodes = false;
    const nodeNames = objectKeys( graph.nodes );
    for ( const nodeName of nodeNames ) {
        const node = graph.nodes[nodeName];
        if ( node.data ) {
            if ( !anyNodes ) {
                out.push( 'Nodes' );
                anyNodes = true;
            }
            out.push( `${nodeName} ${JSON.stringify(node.data)}` );
        }
    }
    let anyEdges = false;
    const edgeNames = objectKeys( graph.edges );
    for ( const edgeName of edgeNames ) {
        const edge = graph.edges[edgeName];
        if ( edge.data ) {
            if ( !anyEdges ) {
                if ( anyNodes ) {
                    out.push( '' );
                }
                out.push( 'Edges' );
                anyEdges = true;
            }
            out.push( `${edgeName} ${JSON.stringify(edge.data)}` );
        }
    }
    return out.join('\n');
}

/**
 * Summarizes the decorations in a graph.
 *
 * @param {Object} graph - graph object
 * @returns {string} summary text
 */
function summarizeDecorations( graph ) {
    const outText = [];
    const outReg = [];

    const propertiesMap = {
        'text': 'text',
        'region': 'region',
        'x': 'x',
        'y': 'y',
        'fillColor': 'color',
        'fillStyle': 'fill',
        'fontFamily': 'font-family',
        'fontSize': 'font-size',
        'fontWeight': 'font-weight',
        'fontStyle': 'font-style',
        'fontVariant': 'font-variant',
        'lineWidth': 'line-width',
        'lineColor': 'line-color',
        'lineStyle': 'line-style',
        'style': 'styles'
    };
    const indent = '';
    for (const decorationName in graph.decorations) {
        if ( hasOwnProperty(graph.decorations, decorationName) ) {
            const decoration = graph.decorations[decorationName];
            const decorationDetails = [];
            for (let property in propertiesMap) {
                if (decoration[property]) {
                    let propertyValue = decoration[property];
                    if (property === 'style' && Array.isArray(propertyValue)) {
                        propertyValue =  propertyValue.map( x => `"${x}"` ).join(',');
                        decorationDetails.push(`${propertiesMap[property]} [${propertyValue}]`);
                    }
                    else if ( isPlainObject( propertyValue ) ) {
                        decorationDetails.push(`${propertiesMap[property]} ${JSON.stringify(propertyValue)}`);
                    } else if ( isString( propertyValue ) ) {
                        decorationDetails.push(`${propertiesMap[property]} "${propertyValue}"`);
                    } else {
                        decorationDetails.push(`${propertiesMap[property]} ${propertyValue}`);
                    }
                }
            }
            if ( decoration.type === 'text' ) {
                outText.push(indent + decorationName + ': ' + decorationDetails.join(', '));
            } else if ( decoration.type === 'region' ) {
                outReg.push(indent + decorationName + ': ' + decorationDetails.join(', '));
            }
        }
    }
    const anyText = outText.length > 0;
    const anyReg = outReg.length > 0;
    return (anyText ? outText.join('\n') + '\n': '') + (anyReg ? outReg.join('\n') + '\n': '');
}

/**
 * Summarizes the constraints in a graph.
 *
 * @param {Object} graph - graph object
 * @returns {string} summary text
 */
function summarizeConstraints( graph ) {
    const out = [];
    for ( const constraint of graph.constraints ) {
        if ( constraint.meaning ) {
            out.push( constraint.meaning );
            for ( const constraintString of constraint.constraints ) {
                out.push( '  ' + constraintString );
            }
        } else {
            for ( const constraintString of constraint.constraints ) {
                out.push( constraintString );
            }
        }
    }
    return out.join('\n');
}

module.exports = {
    autoSummarizer,
    summarize,
    summarizeGraph,
    summarizeNodes,
    summarizeEdges,
    summarizeDecorations,
    summarizeConstraints
};
