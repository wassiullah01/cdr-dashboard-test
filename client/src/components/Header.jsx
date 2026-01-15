import React from 'react';
import '../styles/layout.css';

function Header() {
  return (
    <header style={{
      background: 'var(--bg-primary)',
      borderBottom: '1px solid var(--border-color)',
      boxShadow: 'var(--shadow-sm)',
      padding: 'var(--spacing-lg) 0'
    }}>
      <div className="container">
        <h1 style={{ 
          fontSize: '1.75rem', 
          fontWeight: 700,
          color: 'var(--primary-color)',
          marginBottom: 'var(--spacing-xs)'
        }}>
          CDR Dashboard
        </h1>
        <p style={{ 
          color: 'var(--text-secondary)',
          fontSize: '0.875rem'
        }}>
          Operation ECHO - Investigation Analytics Platform
        </p>
      </div>
    </header>
  );
}

export default Header;
