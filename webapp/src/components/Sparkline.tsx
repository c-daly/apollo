import type { CSSProperties } from 'react'

interface SparklineProps {
  data: Array<number | null | undefined>
  width?: number
  height?: number
  stroke?: string
  strokeWidth?: number
  className?: string
  style?: CSSProperties
  ariaLabel?: string
}

function sanitize(data: Array<number | null | undefined>): number[] {
  return data.filter(
    (value): value is number =>
      typeof value === 'number' && Number.isFinite(value)
  )
}

function Sparkline({
  data,
  width = 120,
  height = 36,
  stroke = '#818cf8',
  strokeWidth = 2,
  className,
  style,
  ariaLabel = 'Metric trend',
}: SparklineProps) {
  const values = sanitize(data)
  if (values.length < 2) {
    return (
      <div
        className={`sparkline sparkline--empty ${className ?? ''}`.trim()}
        style={style}
        aria-label={`${ariaLabel} (insufficient data)`}
      />
    )
  }

  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1

  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width
      const normalized = (value - min) / range
      const y = height - normalized * height
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  const areaPoints = `0,${height} ${points} ${width},${height}`

  return (
    <svg
      className={`sparkline ${className ?? ''}`.trim()}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel}
      style={style}
    >
      <polyline
        points={areaPoints}
        fill={`${stroke}26`}
        stroke="none"
        vectorEffect="non-scaling-stroke"
      />
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

export default Sparkline
