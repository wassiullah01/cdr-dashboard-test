import React from 'react';
import '../styles/dashboard.css';

function SummaryCards({ overview }) {
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

  return (
    <div className="summary-cards">
      <div className="summary-card">
        <div className="summary-card-label">Total Events</div>
        <div className="summary-card-value">
          {overview.totalEvents?.toLocaleString() || 0}
        </div>
      </div>

      <div className="summary-card">
        <div className="summary-card-label">Total Calls</div>
        <div className="summary-card-value">
          {overview.totalCalls?.toLocaleString() || 0}
        </div>
      </div>

      <div className="summary-card">
        <div className="summary-card-label">Total SMS</div>
        <div className="summary-card-value">
          {overview.totalSMS?.toLocaleString() || 0}
        </div>
      </div>

      <div className="summary-card">
        <div className="summary-card-label">Total Duration</div>
        <div className="summary-card-value">
          {overview.totalDurationHours?.toFixed(1) || 0}
          <span className="summary-card-unit">hours</span>
        </div>
      </div>

      <div className="summary-card">
        <div className="summary-card-label">Unique Contacts</div>
        <div className="summary-card-value">
          {overview.uniqueContacts?.toLocaleString() || 0}
        </div>
      </div>

      <div className="summary-card">
        <div className="summary-card-label">Incoming / Outgoing</div>
        <div className="summary-card-value" style={{ fontSize: '1.25rem' }}>
          {overview.incomingCount || 0} / {overview.outgoingCount || 0}
        </div>
      </div>
    </div>
  );
}

export default SummaryCards;
