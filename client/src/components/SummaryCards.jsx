import React, { useState } from 'react';
import '../styles/dashboard.css';

function SummaryCards({ overview }) {
  const [tooltip, setTooltip] = useState(null);

  if (!overview) {
    return (
      <div className="summary-cards">
        <div className="summary-card">
          <div className="summary-card-label">Total Events</div>
          <div className="summary-card-value">-</div>
        </div>
      </div>
    );
  }

  const TooltipContent = ({ text }) => (
    <div 
      className="tooltip"
      style={{
        position: 'absolute',
        bottom: '100%',
        left: '50%',
        transform: 'translateX(-50%)',
        marginBottom: '8px',
        padding: '8px 12px',
        background: '#1e293b',
        color: 'white',
        borderRadius: '4px',
        fontSize: '0.75rem',
        whiteSpace: 'nowrap',
        zIndex: 1000,
        pointerEvents: 'none'
      }}
    >
      {text}
      <div style={{
        position: 'absolute',
        top: '100%',
        left: '50%',
        transform: 'translateX(-50%)',
        border: '4px solid transparent',
        borderTopColor: '#1e293b'
      }}></div>
    </div>
  );

  return (
    <div className="summary-cards">
      <div 
        className="summary-card"
        onMouseEnter={() => setTooltip('totalEvents')}
        onMouseLeave={() => setTooltip(null)}
        style={{ position: 'relative' }}
      >
        <div className="summary-card-label">Total Events</div>
        <div className="summary-card-value">
          {overview.totalEvents?.toLocaleString() || 0}
        </div>
        {tooltip === 'totalEvents' && (
          <TooltipContent text="Total number of communication events (calls + SMS)" />
        )}
      </div>

      <div 
        className="summary-card"
        onMouseEnter={() => setTooltip('uniqueContacts')}
        onMouseLeave={() => setTooltip(null)}
        style={{ position: 'relative' }}
      >
        <div className="summary-card-label">Unique Contacts</div>
        <div className="summary-card-value">
          {overview.uniqueContacts?.toLocaleString() || 0}
        </div>
        {tooltip === 'uniqueContacts' && (
          <TooltipContent text="Number of unique phone numbers in the dataset" />
        )}
      </div>

      <div 
        className="summary-card"
        onMouseEnter={() => setTooltip('callsSmsRatio')}
        onMouseLeave={() => setTooltip(null)}
        style={{ position: 'relative' }}
      >
        <div className="summary-card-label">Calls / SMS Ratio</div>
        <div className="summary-card-value" style={{ fontSize: '1.1rem' }}>
          {overview.dataCoverage?.callPercentage || 0}% / {overview.dataCoverage?.smsPercentage || 0}%
        </div>
        {tooltip === 'callsSmsRatio' && (
          <TooltipContent text="Percentage breakdown of calls vs SMS events" />
        )}
      </div>

      <div 
        className="summary-card"
        onMouseEnter={() => setTooltip('nightActivity')}
        onMouseLeave={() => setTooltip(null)}
        style={{ position: 'relative' }}
      >
        <div className="summary-card-label">Night Activity</div>
        <div className="summary-card-value">
          {overview.temporal?.nightActivityPercentage || 0}%
        </div>
        {tooltip === 'nightActivity' && (
          <TooltipContent text="Percentage of events occurring between 10 PM and 6 AM (local time)" />
        )}
      </div>

      <div 
        className="summary-card"
        onMouseEnter={() => setTooltip('locationCoverage')}
        onMouseLeave={() => setTooltip(null)}
        style={{ position: 'relative' }}
      >
        <div className="summary-card-label">Location Coverage</div>
        <div className="summary-card-value">
          {overview.dataCoverage?.gpsPercentage || 0}%
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
          GPS: {overview.dataCoverage?.gpsPercentage || 0}% | Cell: {overview.dataCoverage?.cellIdOnlyPercentage || 0}%
        </div>
        {tooltip === 'locationCoverage' && (
          <TooltipContent text="Percentage of events with GPS coordinates. Cell ID only shown separately." />
        )}
      </div>

      <div 
        className="summary-card"
        onMouseEnter={() => setTooltip('burstSessions')}
        onMouseLeave={() => setTooltip(null)}
        style={{ position: 'relative' }}
      >
        <div className="summary-card-label">Burst Sessions</div>
        <div className="summary-card-value">
          {overview.behavioral?.totalBurstSessions || 0}
        </div>
        {overview.behavioral?.maxBurstSessionSize > 0 && (
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Max: {overview.behavioral.maxBurstSessionSize}
          </div>
        )}
        {tooltip === 'burstSessions' && (
          <TooltipContent text="Number of burst communication sessions (events within X minutes apart)" />
        )}
      </div>
    </div>
  );
}

export default SummaryCards;
