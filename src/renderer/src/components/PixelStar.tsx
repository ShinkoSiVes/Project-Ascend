// A 7x7 pixel star. Each string is one row and each X is a filled pixel.
const STAR_ROWS = ['...X...', '...X...', 'XXXXXXX', '.XXXXX.', '..XXX..', '.XX.XX.', '.X...X.'];

interface PixelStarProps {
  filled: boolean;
}

// Draws the star with crisp edges. The color comes from CSS: yellow when filled, dim when empty.
function PixelStar({ filled }: PixelStarProps): React.JSX.Element {
  return (
    <svg
      className={`pixel-star ${filled ? 'pixel-star--filled' : ''}`.trim()}
      viewBox="0 0 7 7"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {STAR_ROWS.flatMap((row, y) =>
        [...row].map((cell, x) =>
          cell === 'X' ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" /> : null
        )
      )}
    </svg>
  );
}

export default PixelStar;
