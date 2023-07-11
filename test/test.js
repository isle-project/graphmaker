const test = require('node:test');
const assert = require('node:assert');
const graphmaker = require( './../lib/index.js' );

test('resetPositions', (t) => {
    const reset = graphmaker.resetPositions();
    assert.strictEqual(reset.action, 'RESET_POSITIONS', 'action should be RESET_POSITIONS');
    assert.strictEqual(reset.payload, null, 'payload should be null');
});
