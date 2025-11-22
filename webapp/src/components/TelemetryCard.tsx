import type { ReactNode } from 'react'
import Sparkline from './Sparkline'
import './TelemetryCard.css'

export type TelemetryTone = 'default' | 'success' | 'warning' | 'danger'

interface TelemetryCardProps {
  label: string
  value: ReactNode
  subtext?: ReactNode
  trend?: Array<number | null | undefined>
  trendLabel?: string
  tone?: TelemetryTone
  icon?: ReactNode
}

function TelemetryCard({
  label,
  value,
  subtext,
  trend,
  trendLabel,
  tone = 'default',
  icon,
}: TelemetryCardProps) {
  return (
    <div className={`telemetry-card rich ${tone}`}>
      <div className="telemetry-card-header">
        <div className="telemetry-card-label">{label}</div>
        {icon && <div className="telemetry-card-icon">{icon}</div>}
      </div>
      <div className="telemetry-card-value">{value}</div>
      {subtext && <div className="telemetry-card-subtext">{subtext}</div>}
      {trend && trend.length > 1 && (
        <div className="telemetry-card-trend">
          <Sparkline data={trend} ariaLabel={trendLabel} />
        </div>
      )}
    </div>
  )
}

export default TelemetryCard
