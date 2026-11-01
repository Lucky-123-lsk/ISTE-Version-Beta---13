import React from 'react';
import { IconArrowRight } from './Icons';

export default function MetricCard({
  title,
  value,
  subtext,
  icon: Icon,
  trend,
  trendType = 'neutral', // 'positive', 'neutral', 'warning'
  onClick,
  href,
  colorScheme = 'blue', // 'blue', 'emerald', 'amber', 'purple'
  isLoading = false
}) {
  const CardWrapper = href ? 'a' : 'div';
  const cardProps = href
    ? { href, className: `metric-card metric-card-${colorScheme} hover-lift` }
    : { onClick, className: `metric-card metric-card-${colorScheme} ${onClick ? 'cursor-pointer hover-lift' : ''}` };

  if (isLoading) {
    return (
      <div className={`metric-card metric-card-${colorScheme}`}>
        <div className="skeleton skeleton-icon" />
        <div className="skeleton skeleton-value" />
        <div className="skeleton skeleton-text" />
      </div>
    );
  }

  return (
    <CardWrapper {...cardProps}>
      <div className="metric-header">
        <span className="metric-title">{title}</span>
        {Icon && (
          <div className={`metric-icon-wrap metric-icon-${colorScheme}`}>
            <Icon size={18} />
          </div>
        )}
      </div>

      <div className="metric-body">
        <div className="metric-value-row">
          <span className="metric-value">{value ?? 0}</span>
          {trend && (
            <span className={`metric-trend trend-${trendType}`}>
              {trend}
            </span>
          )}
        </div>
        {subtext && <p className="metric-subtext">{subtext}</p>}
      </div>

      <div className="metric-footer">
        <span className="metric-link-text">View details</span>
        <IconArrowRight size={13} className="metric-link-arrow" />
      </div>
    </CardWrapper>
  );
}

