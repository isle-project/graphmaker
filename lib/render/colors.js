/* eslint-disable no-cond-assign */

const convert = require('color-convert');
const supportedColors = require('./supported-colors.json');

function colorAsRGB( colorSpec, strict = true ) {
    const color = colorSpec.replaceAll( ' ', '' );
    const colorStrict = strict  // If true, remove digits and downcase
        ? colorSpec
            .replace( /[0-9]/g, '' )
            .toLowerCase()
        : color;
    let m;

    if ( colorSpec.startsWith( '#') ) {
        return convert.hex.rgb( colorSpec.slice( 1 ) );
    } else if ( /[0-9a-f]{6,6}/i.test( colorSpec ) ) {
        return convert.hex.rgb( colorSpec );
    } else if ( (m = /(rgb|hsl|cmyk)\(.*\)/.exec( color )) && m ) {
        return convert[m[1]].rgb( colorStrict );
    }
    const rgb = convert.keyword.rgb( colorStrict );

    if ( rgb ) {
        return rgb;
    } else if ( supportedColors[color] ) {
        return supportedColors[color];
    }
    throw new Error( `Unsupported color name ${colorSpec}` );  // ATTN: handle this better
}

function svgColor( colorSpec ) {
    const [r, g, b] = colorAsRGB( colorSpec );
    return `rgb(${r},${g},${b})`;
}

function latexColor( colorSpec ) {
    const color = colorSpec.replaceAll( ' ', '' );

    if ( supportedColors[color] ) {
        return color;
    }
    // ^-*                                             # Start: Leading complement characters (optional)
    // ([A-Z0-9]+)                                     # a color name
    // (?:!(?:[0-9]+(?:\.[0-9]+)?(?:!([A-Z0-9]+))))*   # Followed by zero or more !number colorname's
    // (?:!([A-Z0-9]+))?$                              # Followed by optional !colorname and end
    const latexForm = /^-*([A-Z0-9]+)(?:!(?:[0-9]+(?:\.[0-9]+)?(?:!([A-Z0-9]+))))*(?:!([A-Z0-9]+))?$/i.exec( color );
    if ( latexForm && latexForm.slice(1).every( name => name !== void 0 && supportedColors[name]) ) {
        return color;
    }
    const [r, g, b] = colorAsRGB( colorSpec, false );
    return `{rgb: red, ${r}; green, ${g}; blue, ${b}}`;
}

module.exports = {
    colorAsRGB,
    latexColor,
    supportedColors,
    svgColor
};
