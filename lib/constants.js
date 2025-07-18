const DEGREES_TO_RADIANS = Math.PI/180;
const RADIANS_TO_DEGREES = 180/Math.PI;
const ZERO_TOLERANCE = 2 ** -20;
const SQRT_2 = Math.sqrt(2);

const CoordinateSystem = {
    RIGHT_HANDED: 0,
    LEFT_HANDED: 1
};

module.exports = {
    CoordinateSystem,
    DEGREES_TO_RADIANS,
    RADIANS_TO_DEGREES,
    ZERO_TOLERANCE,
    SQRT_2
};
