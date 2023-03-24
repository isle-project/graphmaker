const pick = require( '@stdlib/utils-pick' );
const deepMerge = require( '@stdlib/utils-merge' );

const STYLE_ATTRIBUTES = [
    'lineColor',
    'lineWidth',
    'lineStyle',
    'arrowStyle',
    'fillColor',
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

module.exports = extractStyles;
