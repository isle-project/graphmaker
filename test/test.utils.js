const test = require('node:test');
const assert = require('node:assert');
const {
    baseGraph,
    deepSet,
    typeOfNestedKey,
    ValidationError
} = require('./../lib/utils.js');
const BASE_GRAPH = require('./../lib/spec/base-graph.json');

const mockSchema = {
    properties: {
        name: {
            type: 'string'
        },
        age: {
            type: 'number'
        }
    }
};
const mockKeys = ['name'];

test('baseGraph', (t) => {
    const base = baseGraph();
    assert.deepEqual(base, BASE_GRAPH, 'base graph should match the BASE_GRAPH');
    assert.ok(base.nodes, 'base graph should have nodes');
    assert.ok(base.edges, 'base graph should have edges');
    assert.strictEqual(base.directed, false, 'base graph should be undirected');
    assert.strictEqual(base.hasParents, false, 'base graph should have no parents');
});

test('typeOfNestedKey', (t) => {
    const type = typeOfNestedKey(mockSchema, mockKeys);
    assert.strictEqual(type, 'string', 'Type of the key "name" should be "string"');
});

test('deepSet', (t) => {
    const obj = {};
    const props = ['name'];
    const val = 'John Doe';
    const result = deepSet(obj, props, true, false, val);

    assert.ok(result, 'deepSet should return true');
    assert.strictEqual(obj.name, 'John Doe', 'Name should be set to "John Doe"');
});

test('ValidationError', (t) => {
    const error = new ValidationError('Test error', {}, {});

    assert.ok(error instanceof Error, 'ValidationError should be an instance of Error');
    assert.strictEqual(error.message, 'Test error', 'Error message should be "Test error"');
});
